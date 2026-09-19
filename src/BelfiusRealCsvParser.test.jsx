import { describe, expect, it } from 'vitest';
import { parseBelfius, parseDate, reconcileBelfiusRows } from './BelfiusAudit.jsx';
import { findOutstandingRecurringExpenses } from './lib/budgetAnalysisRules.js';

const headers = [
  'Compte', 'Date de comptabilisation', "Numéro d'extrait", 'Numéro de transaction',
  'Compte contrepartie', 'Nom contrepartie contient', 'Rue et numéro', 'Code postal et ville',
  'Transaction', 'Date valeur', 'Montant', 'Devise', 'BIC', 'Code pays', 'Communications',
];

function csvRow({ date, valueDate = date, amount, beneficiary, transaction }) {
  return [
    'BE55 0630 5192 5044', date, '', '', '', beneficiary, '', '', transaction,
    valueDate, amount, 'EUR', '', 'BE', transaction,
  ].join(';') + ';'.repeat(16384 - headers.length);
}

const realFormatCsv = [
  'Dernier solde;-185,81 EUR',
  'Date/heure du dernier solde;19-09-26 09:42',
  headers.join(';') + ';'.repeat(16384 - headers.length),
  csvRow({ date: '01-09-26', amount: '-651,97', beneficiary: 'ETHIAS nv / ETHIAS SA',
    transaction: 'VOTRE DOMICILIATION EUROPEENNE POUR ETHIAS nv / ETHIAS SA' }),
  csvRow({ date: '01-09-26', amount: '-41,78', beneficiary: 'AG INSURANCE',
    transaction: 'VOTRE DOMICILIATION EUROPEENNE POUR AG INSURANCE' }),
  csvRow({ date: '02-09-26', valueDate: '03-09-26', amount: '-100', beneficiary: 'BRIGANTE Esther',
    transaction: 'ORDRE PERMANENT 18838193 POUR BRIGANTE Esther Pour voiture' }),
  csvRow({ date: '01-09-26', amount: '-300', beneficiary: 'Esther Brigante',
    transaction: 'ORDRE PERMANENT INSTANTANE 20401142 Esther Brigante Epargne "Taxes"' }),
].join('\r\n');

describe('parseur du véritable format CSV Belfius', () => {
  it('convertit les variantes de date en ISO et refuse les dates impossibles', () => {
    expect(parseDate('01-09-26')).toBe('2026-09-01');
    expect(parseDate('01/09/2026')).toBe('2026-09-01');
    expect(parseDate('2026-09-01')).toBe('2026-09-01');
    expect(parseDate('31-02-26')).toBe('');
  });

  it('lit les quatre mouvements sans conserver les 16 384 colonnes vides', () => {
    const parsed = parseBelfius(realFormatCsv);
    expect(parsed.diagnostics).toEqual({
      sourceRowCount: 4, parsedRowCount: 4, rejectedRowCount: 0, usefulColumnCount: 15,
    });
    expect(parsed.balanceCents).toBe(-18581);
    expect(parsed.rows.map(({ date, valueDate, label, amountCents, amountRaw }) => (
      { date, valueDate, label, amountCents, amountRaw }
    ))).toEqual([
      { date: '2026-09-01', valueDate: '2026-09-01', label: 'ETHIAS nv / ETHIAS SA', amountCents: -65197, amountRaw: '-651,97' },
      { date: '2026-09-01', valueDate: '2026-09-01', label: 'AG INSURANCE', amountCents: -4178, amountRaw: '-41,78' },
      { date: '2026-09-02', valueDate: '2026-09-03', label: 'BRIGANTE Esther', amountCents: -10000, amountRaw: '-100' },
      { date: '2026-09-01', valueDate: '2026-09-01', label: 'Esther Brigante', amountCents: -30000, amountRaw: '-300' },
    ]);
    expect(parsed.rows.every((row) => row.rawDetails.length < 500)).toBe(true);
  });

  it('rapproche ETHIAS, AG et les deux OP sans supprimer une attente absente', () => {
    const bankRows = parseBelfius(realFormatCsv).rows;
    const recurring = [
      { id: 'ethias', label: 'Ethias maison', amount: 651.97, day: 1, category: 'assurances', paymentMethod: 'Compte Belfius' },
      { id: 'ag', label: 'AG Assurance', amount: 41.78, day: 1, category: 'assurances', paymentMethod: 'Compte Belfius' },
      { id: 'vehicle', label: 'Épargne véhicule', amount: 100, day: 1, category: 'epargne', directDebitReference: '18838193', paymentMethod: 'Compte Belfius' },
      { id: 'taxes', label: 'Épargne Taxes / Impôts', amount: 300, day: 1, category: 'epargne', directDebitReference: '20401142', paymentMethod: 'Compte Belfius' },
      { id: 'absent', label: 'Assurance réellement absente', amount: 55, day: 1, category: 'assurances', paymentMethod: 'Compte Belfius' },
    ];
    const result = reconcileBelfiusRows(bankRows, [], '2026-09', recurring);
    expect(result.savingsAudit.map((entry) => [entry.reference, entry.status])).toEqual([
      ['18838193', 'matched'], ['20401142', 'matched'],
    ]);
    expect(result.matched.map((entry) => entry.app.recurringExpenseId).sort()).toEqual(['ag', 'ethias']);
    const outstanding = findOutstandingRecurringExpenses({
      recurringExpenses: recurring, bankRows, selectedMonth: '2026-09', currentDate: '2026-09-19',
    });
    expect(outstanding.map((row) => row.recurringExpenseId)).toEqual(['absent']);
  });
});
