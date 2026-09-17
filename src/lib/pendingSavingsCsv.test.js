import test from 'node:test';
import assert from 'node:assert/strict';
import { findOutstandingRecurringExpenses } from './budgetAnalysisRules.js';

const expenses = [100, 400, 100, 100, 110, 110].map((amount, index) => ({
  id: `saving-${index}`, label: `Épargne ${index}`, amount, day: 1,
  direct_debit_reference: `1883800${index}`, category: 'epargne',
}));
const bankRows = expenses.map(expense => ({ date: '2026-09-04', amount: -expense.amount,
  details: `ORDRE PERMANENT INSTANTANE ${expense.direct_debit_reference}` }));
const pending = (bank = bankRows, extra = {}) => findOutstandingRecurringExpenses({
  recurringExpenses: expenses, selectedMonth: '2026-09', currentDate: '2026-09-16',
  bankRows: bank, ...extra,
});

test('six savings present in CSV remove the 920 euro pending forecast regardless of day', () => {
  assert.equal(pending([]).reduce((sum, row) => sum + row.amount, 0), 920);
  assert.deepEqual(pending(), []);
});
test('other month, wrong amount, unknown OP and duplicate execution remain unresolved', () => {
  for (const replacement of [
    { ...bankRows[0], date: '2026-08-04' },
    { ...bankRows[0], amount: -99 },
    { ...bankRows[0], details: 'ORDRE PERMANENT 99999999' },
  ]) assert.equal(pending([replacement, ...bankRows.slice(1)])[0].recurringExpenseId, expenses[0].id);
  assert.equal(pending([...bankRows, bankRows[0]])[0].recurringExpenseId, expenses[0].id);
});
test('an unrelated equal amount expense does not stand in for a missing savings OP', () => {
  assert.equal(pending([], { operations: [{ date: '2026-09-01', type: 'variable',
    label: 'Courses', amount: 100 }] }).length, 6);
});
