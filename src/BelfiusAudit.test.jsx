import { describe, expect, it } from 'vitest';
import { reconcileBelfiusRows } from './BelfiusAudit.jsx';

const bankRow = (id, overrides = {}) => ({
  id,
  date: '2026-09-02',
  amount: -10,
  label: 'Opération Belfius',
  details: '',
  communication: '',
  ...overrides,
});

const appRow = (id, overrides = {}) => ({
  id,
  date: '2026-09-02',
  amount: 10,
  type: 'fixed',
  category: 'divers',
  person: 'Foyer',
  paymentMethod: 'Compte Belfius',
  label: 'Opération',
  ...overrides,
});

describe('rapprochement bancaire Belfius', () => {
  it('reconnaît universellement un débit comptabilisé après la date d’achat, même au changement de mois', () => {
    const result = reconcileBelfiusRows([
      bankRow('delhaize-bank', {
        date: '2026-09-01', amount: -47.72, label: 'DELHAIZE HERSTAL',
      }),
    ], [
      appRow('delhaize-app', {
        date: '2026-08-30', amount: 47.72, label: 'Delhaize Herstal - nourriture',
        category: 'nourriture',
      }),
    ], '2026-09', []);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].bank.id).toBe('delhaize-bank');
    expect(result.matched[0].app.id).toBe('delhaize-app');
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
  });

  it('ne rapproche pas un débit retardé sur le seul critère du montant', () => {
    const result = reconcileBelfiusRows([
      bankRow('unrelated-bank', {
        date: '2026-09-01', amount: -47.72, label: 'AUTRE COMMERCANT',
      }),
    ], [
      appRow('delhaize-app', {
        date: '2026-08-30', amount: 47.72, label: 'Delhaize Herstal - nourriture',
        category: 'nourriture',
      }),
    ], '2026-09', []);

    expect(result.matched).toHaveLength(0);
    expect(result.review).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
  });

  it('ventile un débit MEGA unique entre les lignes Électricité et Gaz', () => {
    const result = reconcileBelfiusRows([
      bankRow('mega-bank', {
        date: '2026-09-01', amount: -350, label: 'MEGA (POWER ONLINE SA)',
        details: 'Domiciliation européenne MEGA',
      }),
    ], [], '2026-09', [
      { id: 'electricity', day: 3, amount: 220, category: 'electricite', person: 'Foyer', label: 'MEGA (POWER ONLINE SA)', frequency: 'monthly' },
      { id: 'gas', day: 3, amount: 130, category: 'gaz', person: 'Foyer', label: 'MEGA (POWER ONLINE SA)', frequency: 'monthly' },
    ]);

    expect(result.splits).toHaveLength(1);
    expect(result.splits[0].app.map((row) => row.recurringExpenseId)).toEqual(['electricity', 'gas']);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
  });

  it('consomme les dons identiques dans leur ordre FIFO sans ambiguïté', () => {
    const banks = ['bank-1', 'bank-2', 'bank-3'].map((id) => bankRow(id, {
      label: 'DONATE.JW.ORG-CGJG', details: 'Paiement DONATE.JW.ORG',
    }));
    const recurring = ['app-1', 'app-2', 'app-3'].map((id) => ({
      id, day: 1, amount: 10, category: 'don', person: 'Foyer',
      label: 'DONATE JW', frequency: 'monthly',
    }));

    const result = reconcileBelfiusRows(banks, [], '2026-09', recurring);

    expect(result.matched.map(({ app }) => app.recurringExpenseId)).toEqual(['app-1', 'app-2', 'app-3']);
    expect(result.matched.slice(0, 2).every(({ reason }) => reason.includes('FIFO'))).toBe(true);
    expect(result.review).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
  });

  it('relie le retrait d’épargne Purefy à la facture sans créer de seconde dépense', () => {
    const result = reconcileBelfiusRows([
      bankRow('funding', {
        date: '2026-08-31', amount: 161.12, label: 'WILEUR-DU BOIS - BRIGANTE',
        communication: 'Purify', details: 'VERSEMENT DU COMPTE ÉPARGNE Purify',
      }),
      bankRow('purefy', {
        amount: -161.12, label: 'Purefy', communication: '+++000/0015/81096+++',
        details: 'VIREMENT VERS Purefy',
      }),
    ], [
      appRow('savings-funding', {
        date: '2026-08-31', amount: 161.12, type: 'income',
        label: 'Transfert depuis épargne — Entretien', savingsDirection: 'out', budgetMonth: '2026-09',
      }),
      appRow('purefy-expense', { amount: 161.12, label: 'Purefy', category: 'entretien' }),
    ], '2026-09', []);

    expect(result.compensations).toHaveLength(1);
    expect(result.compensations[0].funding.id).toBe('funding');
    expect(result.compensations[0].expense.id).toBe('purefy');
    expect(result.compensations[0].appFunding.id).toBe('savings-funding');
    expect(result.matched.map(({ app }) => app.id)).toEqual(['purefy-expense']);
    expect(result.review).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
  });
});
