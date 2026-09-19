import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BelfiusAudit, { reconcileBelfiusRows } from './BelfiusAudit.jsx';

const recurring = [
  ['18838193', 'Épargne frais divers véhicule', 100, 1],
  ['18893403', 'Épargne solde Peugeot', 400, 4],
  ['18833985', 'Épargne frais divers foyer (Taxes, eau…)', 100, 1],
  ['18833987', 'Épargne loisirs', 100, 3],
  ['17178591', 'Epargne Pension Esther', 110, 1],
  ['17178594', 'Épargne pension Alain', 110, 1],
].map(([reference, label, amount, day]) => ({
  id: reference, direct_debit_reference: reference, label, amount, day,
  person: 'Foyer', category: 'epargne', payment_method: 'Compte Belfius',
}));
const orders = recurring.map((expense, index) => ({
  id: `bank-${index}`, date: '2026-09-04', amount: -expense.amount,
  label: 'Bénéficiaire', details: `ORDRE PERMANENT ${expense.id} POUR compte`,
}));
const taxesOrder = { id: 'taxes-order', date: '2026-09-01', amount: -300,
  label: 'Bénéficiaire', details: 'ORDRE PERMANENT INSTANTANE 20401142 Épargne Taxes' };

describe('ordres permanents mensuels dans l’audit', () => {
  it('ne certifie pas le mois tant qu’un OP attendu reste absent du relevé', () => {
    localStorage.setItem('mon-foyer-belfius-audit-v1', JSON.stringify({
      rows: [], balance: 1000, balanceDate: '16/09/2026 08:30:06',
    }));
    const onAuditSnapshot = vi.fn();
    render(<BelfiusAudit operations={[]} recurringExpenses={[recurring[0]]}
      selectedMonth="2026-09" appBelfiusBalance={1000} onAuditSnapshot={onAuditSnapshot} />);
    expect(screen.getByText('Pas encore retrouvé dans le relevé de ce mois')).toBeInTheDocument();
    expect(screen.queryByText('Comptabilité conforme')).not.toBeInTheDocument();
    expect(onAuditSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ clean: false, remaining: 1 }));
  });

  it('affiche l’écart de montant et le compte parmi les contrôles restants', () => {
    localStorage.setItem('mon-foyer-belfius-audit-v1', JSON.stringify({
      rows: [{ ...orders[0], amount: -300 }], balance: 1000, balanceDate: '16/09/2026 08:30:06',
    }));
    const onAuditSnapshot = vi.fn();
    render(<BelfiusAudit operations={[]} recurringExpenses={[recurring[0]]}
      selectedMonth="2026-09" appBelfiusBalance={1000} onAuditSnapshot={onAuditSnapshot} />);
    expect(screen.getByText('Mouvement retrouvé — montant différent')).toBeInTheDocument();
    expect(onAuditSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ clean: false, remaining: 1, anomalies: 1 }));
  });

  it('reconnaît le nouvel OP Taxes sans recréer les six épargnes comme dépenses orphelines', () => {
    const result = reconcileBelfiusRows([...orders, taxesOrder], [], '2026-09', recurring);
    expect(result.extra).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.savingsAudit).toHaveLength(6);
    expect(result.savingsAudit.every(entry => entry.status === 'matched')).toBe(true);
    expect(result.splits).toHaveLength(0);
  });

  it('reconnaît un OP instantané dans le même mois sans imposer le jour prévu', () => {
    const result = reconcileBelfiusRows([{
      ...orders[0], date: '2026-09-21', details: `ORDRE PERMANENT INSTANTANE ${recurring[0].id}`,
    }], [], '2026-09', [recurring[0]]);
    expect(result.savingsAudit[0].status).toBe('matched');
    expect(result.extra).toHaveLength(0);
  });

  it('ne solde pas septembre avec le mouvement d’août ou un numéro partiel', () => {
    const result = reconcileBelfiusRows([
      { ...orders[0], date: '2026-08-31' },
      { ...orders[0], details: `ORDRE PERMANENT ${recurring[0].id}9` },
    ], [], '2026-09', [recurring[0]]);
    expect(result.savingsAudit[0].status).toBe('pending');
    expect(result.savingsAudit[0].bank).toHaveLength(0);
  });

  it('signale un montant différent sans classer le mouvement comme absent', () => {
    const result = reconcileBelfiusRows([{ ...orders[0], amount: -300 }], [], '2026-09', [recurring[0]]);
    expect(result.savingsAudit[0]).toMatchObject({ status: 'amount-mismatch', expected: 100, actual: 300 });
    expect(result.extra).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it('ne valide pas deux exécutions ou deux prévisions avec un seul OP', () => {
    const duplicateBank = reconcileBelfiusRows([orders[0], { ...orders[0], id: 'second' }], [], '2026-09', [recurring[0]]);
    expect(duplicateBank.savingsAudit[0].status).toBe('ambiguous');
    const duplicatePlan = reconcileBelfiusRows([orders[0]], [], '2026-09', [recurring[0], { ...recurring[0], id: 'second' }]);
    expect(duplicatePlan.savingsAudit).toHaveLength(1);
    expect(duplicatePlan.savingsAudit[0].status).toBe('ambiguous');
  });

  it('respecte les récurrences inactives et les mois hors fréquence', () => {
    const result = reconcileBelfiusRows(orders, [], '2026-09', [
      { ...recurring[0], active: false },
      { ...recurring[1], frequency: 'quarterly', start_date: '2026-08-01' },
    ]);
    expect(result.savingsAudit).toHaveLength(0);
  });

  it('laisse deux achats sémantiquement compatibles au montant exact à confirmer', () => {
    const result = reconcileBelfiusRows([{ id: 'bank', date: '2026-09-02', amount: -15.65, label: 'PHARMACIE ALLEUR' }], [
      { id: 'a', date: '2026-09-02', amount: 15.65, type: 'variable', label: 'Pharmacie achat A' },
      { id: 'b', date: '2026-09-02', amount: 15.65, type: 'variable', label: 'Pharmacie achat B' },
    ], '2026-09', []);
    expect(result.matched).toHaveLength(0);
    expect(result.review).toHaveLength(1);
    expect(result.review[0].candidates).toHaveLength(2);
  });

  it('un montant exact ne remplace pas une référence bancaire plus forte', () => {
    const result = reconcileBelfiusRows([{
      id: 'bank', date: '2026-09-02', amount: -15.65, label: 'PHARMACIE ALLEUR', details: 'Référence ABC123',
    }], [
      { id: 'mandate', date: '2026-09-02', amount: 15.70, type: 'fixed', label: 'Contrat récurrent' },
      { id: 'pharmacy', date: '2026-09-02', amount: 15.65, type: 'variable', label: 'Pharmacie Alleur' },
    ], '2026-09', [{ id: 'contract', label: 'Contrat récurrent', amount: 15.70, day: 2, directDebitReference: 'ABC123' }]);
    expect(result.matched).toHaveLength(0);
    expect(result.review).toHaveLength(1);
  });

  it('ventile le ticket partagé et conserve le remboursement cash hors de Belfius', () => {
    const result = reconcileBelfiusRows([{
      id: 'ticket', date: '2026-09-14', amount: -33.17, label: 'DELHAIZE HERSTAL',
    }], [
      { id: 'household', date: '2026-09-14', amount: 29.98, type: 'variable', label: 'Delhaize Herstal - foyer', paymentMethod: 'Compte Belfius' },
      { id: 'bread', date: '2026-09-14', amount: 3.19, type: 'variable', label: 'Delhaize Herstal - Pain pour papa', paymentMethod: 'Compte Belfius' },
      { id: 'cash', date: '2026-09-14', amount: 7, type: 'reimbursement', label: 'Remboursement Papa', payment_method: 'Espèces' },
    ], '2026-09', []);
    expect(result.splits).toHaveLength(1);
    expect(result.splits[0].app.map(row => row.id)).toEqual(['household', 'bread']);
    expect(result.extra).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.appRows.some(row => row.id === 'cash')).toBe(false);
  });

  it('rapproche la pharmacie après correction du montant saisi', () => {
    const result = reconcileBelfiusRows([{
      id: 'pharmacy-bank', date: '2026-09-02', amount: -15.65, label: 'PHARMACIE ALLEUR',
    }], [
      { id: 'older-pharmacy', date: '2026-08-31', amount: 15.70, type: 'variable',
        label: 'Médicaments', store: 'Pharmacie', payment_method: 'Compte Belfius' },
      { id: 'pharmacy-app', date: '2026-09-02', amount: 15.65, type: 'variable',
        label: 'Pharmacie 360', store: 'Pharmacie 360 Alleur', payment_method: 'Compte Belfius' },
    ], '2026-09', []);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].app.id).toBe('pharmacy-app');
    expect(result.review).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });
});
