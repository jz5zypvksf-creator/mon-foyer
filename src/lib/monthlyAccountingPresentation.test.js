import test from 'node:test';
import assert from 'node:assert/strict';
import { incomeReceivedForNextMonth, monthlyAccountingPresentation, nextMonthKey } from './monthlyAccountingPresentation.js';

test('le résultat mensuel utilise les revenus affectés, jamais le solde d’ouverture', () => {
  const result = monthlyAccountingPresentation({
    opening_balance: 4111.97,
    income: 975.47,
    assigned_income: 5196.20,
    reimbursements: 120.92,
    expenses: 4477.27,
    savings_transfers: 1940,
    savings_withdrawals: 245,
  }, 4805.17);

  assert.equal(result.budgetResources.toFixed(2), '5317.12');
  assert.equal(result.budgetResult.toFixed(2), '839.85');
  assert.equal(result.cashAfterSavings.toFixed(2), '-855.15');
  assert.equal(result.openingBalance, 4111.97);
});

test('les salaires reçus en fin de mois pour le mois suivant restent séparés', () => {
  const operations = [
    { type: 'income', date: '2026-08-28', budgetMonth: '2026-09', amount: 2319.54 },
    { type: 'income', date: '2026-08-31', budgetMonth: '2026-09', amount: 2485.63 },
    { type: 'income', date: '2026-08-04', budgetMonth: '2026-08', amount: 419.07 },
  ];
  assert.equal(nextMonthKey('2026-12'), '2027-01');
  assert.equal(incomeReceivedForNextMonth(operations, '2026-08').toFixed(2), '4805.17');
});

test('une clôture absente ne provoque pas de page blanche', () => {
  const result = monthlyAccountingPresentation(null, 0);

  assert.equal(result.budgetResult, 0);
  assert.equal(result.cashAfterSavings, 0);
  assert.equal(result.bankBalance, null);
});
