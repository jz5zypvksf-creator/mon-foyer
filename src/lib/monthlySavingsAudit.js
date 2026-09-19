import { normalizeBankText } from '../belfiusMatchingRules.js';
import { amountCents } from '../domain/money/money.js';
import { savingsRuleForExpense } from '../savingsOrderRules.js';

export function savingsOrderReference(row = {}) {
  const explicit = String(row.directDebitReference || row.direct_debit_reference
    || row.standingOrderReference || row.standing_order_reference
    || row.orderReference || row.order_reference || '').trim();
  return explicit || savingsRuleForExpense(row)?.op || '';
}

export function isSavingsAuditEntry(row = {}, goals = []) {
  const reference = savingsOrderReference(row);
  return normalizeBankText(row.label).startsWith('epargne ')
    || normalizeBankText(row.category).startsWith('epargne')
    || row.type === 'savings_transfer'
    || (row.savingsDirection || row.savings_direction) === 'in'
    || Boolean(reference && goals.some(goal => goal.active !== false
      && savingsOrderReference(goal) === reference));
}

export function bankStandingOrderReferences(row = {}) {
  const text = `${row.details || ''} ${row.communication || ''} ${row.rawDetails || ''} ${row.label || ''}`;
  return [...new Set([...text.matchAll(/\bORDRE\s+PERMANENT(?:\s+INSTANTAN[EÉ])?\s+(\d+)\b/gi)]
    .map(match => match[1]))];
}

// One monthly control per OP: dates are informative, amounts remain independently checked.
// No entry is written, and duplicate executions/configurations are never silently accepted.
export function auditMonthlySavings(bankRows, expenses, month) {
  const byReference = new Map();
  expenses.forEach(expense => {
    const reference = savingsOrderReference(expense);
    const key = reference || `unconfigured-${expense.id}`;
    const entry = byReference.get(key) || { reference, expenses: [], bank: [] };
    entry.expenses.push(expense);
    byReference.set(key, entry);
  });
  bankRows.forEach(row => {
    if (String(row.date || '').slice(0, 7) !== month || amountCents(row) >= 0) return;
    const references = bankStandingOrderReferences(row);
    // A malformed row carrying several different OPs requires manual inspection.
    if (references.length === 1 && byReference.has(references[0])) {
      byReference.get(references[0]).bank.push(row);
    }
  });
  return [...byReference.values()].map(entry => {
    const expectedCents = Math.abs(amountCents(entry.expenses[0]));
    const actualCents = entry.bank.reduce((total, row) => total + Math.abs(amountCents(row)), 0);
    const expected = expectedCents / 100;
    const actual = actualCents / 100;
    const status = !entry.reference ? 'unconfigured'
      : entry.expenses.length > 1 || entry.bank.length > 1 ? 'ambiguous'
        : !entry.bank.length ? 'pending'
          : actualCents !== expectedCents ? 'amount-mismatch' : 'matched';
    return { ...entry, expected, actual, expectedCents, actualCents, status, label: entry.expenses[0].label };
  });
}
