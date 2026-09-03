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
  it('ventile un débit MEGA unique entre les lignes Électricité et Gaz', () => {
    const result = reconcileBelfiusRows([
      bankRow('mega-bank', {
        date: '2026-09-01', amount: -350, label: 'MEGA (POWER ONLINE SA)',
        details: 'Domiciliation européenne MEGA',
      }),
    ], [
      appRow('electricity', { date: '2026-09-01', amount: 210, category: 'habitation', label: 'Électricité' }),
      appRow('gas', { date: '2026-09-01', amount: 140, category: 'habitation', label: 'Gaz' }),
    ], '2026-09', []);

    expect(result.splits).toHaveLength(1);
    expect(result.splits[0].app.map((row) => row.id)).toEqual(['electricity', 'gas']);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
  });

  it('consomme les dons identiques dans leur ordre FIFO sans ambiguïté', () => {
    const banks = ['bank-1', 'bank-2', 'bank-3'].map((id) => bankRow(id, {
      label: 'DONATE.JW.ORG-CGJG', details: 'Paiement DONATE.JW.ORG',
    }));
    const apps = ['app-1', 'app-2', 'app-3'].map((id) => appRow(id, {
      label: 'DONATE JW', store: 'DONATE.JW.ORG',
    }));

    const result = reconcileBelfiusRows(banks, apps, '2026-09', []);

    expect(result.matched.map(({ app }) => app.id)).toEqual(['app-1', 'app-2', 'app-3']);
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
