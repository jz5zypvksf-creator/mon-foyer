import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBankAuditSummary,
  calculateEndOfMonthForecast,
  calculateScheduledTotal,
} from './budgetMetrics.js';

const closeTo = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) < 0.005, `${actual} ≠ ${expected}`);
};

test('audit Belfius d’août : opérations dominicales en attente', () => {
  const summary = calculateBankAuditSummary({
    bankBalance: 103.75,
    pendingRows: [
      { type: 'variable', amount: 59 },
      { type: 'variable', amount: 7.45 },
    ],
    missingBankRows: [],
    reviewRows: [],
  });

  closeTo(summary.bankBalance, 103.75);
  closeTo(summary.pendingAmount, -66.45);
  closeTo(summary.expectedBankBalance, 37.30);
  closeTo(summary.unexplainedAmount, 0);
});

test('prévision d’août : sept dépenses programmées', () => {
  const scheduled = [25.12, 24.20, 7.99, 45, 5, 22.99, 17.99];
  closeTo(calculateScheduledTotal(scheduled), 148.29);
  closeTo(calculateEndOfMonthForecast(179.72, scheduled), 31.43);
});

test('un mouvement Belfius non rapproché reste un écart inexpliqué', () => {
  const summary = calculateBankAuditSummary({
    bankBalance: 103.75,
    pendingRows: [{ type: 'variable', amount: 66.45 }],
    missingBankRows: [{ amount: -12.34 }],
  });

  closeTo(summary.unexplainedAmount, -12.34);
});
