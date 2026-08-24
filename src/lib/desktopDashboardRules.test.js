import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyBudgetSeries,
  buildMonthClosingChecks,
  mastercardReconciliation,
} from './desktopDashboardRules.js';

const mastercard = 'Mastercard Platinum •••• 4397';

test('place les achats Mastercard dans le mois et au jour de leur prélèvement', () => {
  const series = buildDailyBudgetSeries({
    selectedMonth: '2026-08',
    throughDate: '2026-08-20',
    openingBalance: 500,
    operations: [
      { date: '2026-07-28', type: 'fixed', amount: 7.99, paymentMethod: mastercard, settlementDate: '2026-08-17', budgetMonth: '2026-08' },
      { date: '2026-08-28', type: 'fixed', amount: 7.99, paymentMethod: mastercard, settlementDate: '2026-09-16', budgetMonth: '2026-09' },
    ],
  });
  assert.equal(series.find((row) => row.day === 17).expenses, 7.99);
  assert.equal(series.reduce((sum, row) => sum + row.expenses, 0), 7.99);
});

test('rapproche une ventilation Mastercard avec son règlement global', () => {
  const result = mastercardReconciliation([
    { date: '2026-07-28', type: 'fixed', amount: 7.99, paymentMethod: mastercard, settlementDate: '2026-08-17' },
    { date: '2026-07-22', type: 'fixed', amount: 9.99, paymentMethod: mastercard, settlementDate: '2026-08-17' },
    { date: '2026-08-17', type: 'card_settlement', amount: 17.98, paymentMethod: 'Compte Belfius' },
  ], '2026-08');
  assert.equal(result.reconciled, true);
  assert.equal(result.purchases, 17.98);
});

test('le contrôle mensuel signale une ventilation incomplète sans modifier les opérations', () => {
  const operations = [
    { date: '2026-08-19', type: 'fixed', amount: 17.99, paymentMethod: mastercard, settlementDate: '2026-09-16' },
  ];
  const before = structuredClone(operations);
  const checks = buildMonthClosingChecks({
    operations,
    selectedMonth: '2026-09',
    snapshot: { balance: 12.51, balanceDate: '24/08/2026' },
    lastBackupAt: '2026-08-20T10:00:00Z',
    now: new Date('2026-08-24T10:00:00Z'),
  });
  assert.equal(checks.find((check) => check.id === 'mastercard').status, 'warning');
  assert.deepEqual(operations, before);
});
