const normalize = value => String(value || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cents = value => Math.round(Math.abs(Number(value) || 0) * 100);

export function isJwDonation(row = {}) {
  const text = normalize(`${row.label || ''} ${row.store || ''} ${row.details || ''} ${row.communication || ''}`);
  return /\b(?:donate jw|jw donate|jw org)\b/.test(text);
}

export function jwDonationDestination(row = {}) {
  if (!isJwDonation(row)) return '';
  const label = normalize(row.label).replace(/^(?:donate jw org(?: cgjg)?|jw donate|jw org)\b/, '').trim();
  return /^(?:dons?|donations?)?$/.test(label) ? '' : label;
}

export function haveDistinctDonationDestinations(left, right) {
  const a = jwDonationDestination(left);
  const b = jwDonationDestination(right);
  return Boolean(a && b && a !== b);
}

function bankReference(row) {
  const text = `${row.details || ''} ${row.communication || ''}`;
  return [...text.matchAll(/\bREF\.?\s*:\s*([A-Z0-9]+)/gi)].at(-1)?.[1]?.toUpperCase() || '';
}

// Reconcile the whole allocation without inventing a destination for an indistinguishable
// bank debit. A matching total alone is insufficient: counts, amounts and references agree.
export function auditJwDonationAllocation(bankRows, operations, month, recurringExpenses = []) {
  const app = operations.filter(row => String(row.date || '').slice(0, 7) === month
    && (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius'
    && !['income', 'reimbursement'].includes(row.type) && Number(row.amount) > 0 && isJwDonation(row));
  if (!app.some(row => jwDonationDestination(row))) return null;
  const bank = bankRows.filter(row => String(row.date || '').slice(0, 7) === month
    && Number(row.amount) < 0 && isJwDonation(row));
  if (!bank.length) return null;
  const references = bank.map(bankReference);
  const appKeys = app.map(row => [row.date, row.person || 'Foyer', jwDonationDestination(row), cents(row.amount)].join('|'));
  const ambiguous = references.some(reference => !reference)
    || new Set(references).size !== references.length
    || new Set(appKeys).size !== appKeys.length;
  const unallocated = bank.map(row => cents(row.amount));
  const unmatchedApp = [];
  app.forEach(row => {
    const index = unallocated.indexOf(cents(row.amount));
    if (index < 0) unmatchedApp.push(row);
    else unallocated.splice(index, 1);
  });
  const bankTotal = bank.reduce((total, row) => total + cents(row.amount), 0) / 100;
  const appTotal = app.reduce((total, row) => total + cents(row.amount), 0) / 100;
  const expectedRows = recurringExpenses.filter(row => isJwDonation(row));
  const expectedTotal = expectedRows.length ? expectedRows.reduce((total, row) => total + cents(row.amount), 0) / 100 : null;
  const status = ambiguous ? 'ambiguous' : unmatchedApp.length ? 'mismatch'
    : unallocated.length ? 'incomplete' : 'matched';
  return { month, bank, app, bankTotal, appTotal, difference: (Math.round(bankTotal * 100) - Math.round(appTotal * 100)) / 100,
    bankReferences: references, expectedTotal,
    remainingAmounts: unallocated.map(amount => amount / 100),
    status: status === 'matched' && expectedTotal !== null && cents(bankTotal) !== cents(expectedTotal) ? 'expected-mismatch' : status };
}
