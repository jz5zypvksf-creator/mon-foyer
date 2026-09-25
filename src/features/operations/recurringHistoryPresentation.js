import {
  isMastercardPaymentMethod,
  mastercardSettlementDate,
  recurringSourceMonthForBudget,
} from '../../lib/cardPaymentRules.js';

export const AWAITING_CSV_DISPLAY_STATUS = 'En attente fichier CSV';
export const CONFIRMED_CSV_DISPLAY_STATUS = 'Confirmé par import CSV';

function dateInMonth(month, day) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (!year || !monthNumber) return '';
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(Number(day) || 1, 1), lastDay);
  return `${month}-${String(safeDay).padStart(2, '0')}`;
}

function isDueInMonth(expense, month) {
  const intervals = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
  const interval = intervals[expense.frequency || 'monthly'] || 1;
  const start = expense.startDate || expense.start_date || `${month}-01`;
  const [startYear, startMonth] = start.slice(0, 7).split('-').map(Number);
  const [year, monthNumber] = month.split('-').map(Number);
  const distance = (year - startYear) * 12 + (monthNumber - startMonth);
  return distance >= 0 && distance % interval === 0;
}

function fixedExpenseSignature(operation) {
  return [
    operation.date,
    operation.person,
    operation.category,
    operation.paymentMethod || operation.payment_method || 'Compte Belfius',
    String(operation.label || '').trim().toLowerCase(),
    Number(operation.amount).toFixed(2),
  ].join('|');
}

export function buildRecurringHistoryPresentationRows({
  recurringExpenses = [],
  outstandingRecurringExpenses = [],
  monthOperations = [],
  selectedMonth = '',
  balanceCutoff = '',
  hasImportedCsv = false,
} = {}) {
  const outstandingIds = new Set(
    outstandingRecurringExpenses.map((operation) => String(operation.recurringExpenseId || '')),
  );
  const existingFixedSignatures = new Set(
    monthOperations
      .filter((operation) => operation.type === 'fixed')
      .map(fixedExpenseSignature),
  );

  return recurringExpenses.flatMap((expense) => {
    const paymentMethod = expense.paymentMethod || expense.payment_method || 'Compte Belfius';
    const sourceMonth = recurringSourceMonthForBudget(paymentMethod, selectedMonth);
    if (!isDueInMonth(expense, sourceMonth)) return [];

    const purchaseDate = dateInMonth(sourceMonth, expense.day);
    const settlementDate = isMastercardPaymentMethod(paymentMethod)
      ? mastercardSettlementDate(purchaseDate)
      : '';
    const displayDate = settlementDate || purchaseDate;
    if (!displayDate || displayDate.slice(0, 7) !== selectedMonth) return [];

    const row = {
      id: `recurring-display-${expense.id}-${selectedMonth}`,
      date: displayDate,
      person: expense.person || 'Foyer',
      type: 'fixed',
      category: expense.category || 'divers',
      store: '',
      paymentMethod,
      settlementDate,
      label: expense.label,
      amount: Number(expense.amount) || 0,
      projectedRecurring: true,
      virtualRecurring: true,
      recurringExpenseId: expense.id,
      frequency: expense.frequency || 'monthly',
      accountingNature: expense.accountingNature || expense.accounting_nature,
      displayOnlyRecurring: true,
    };

    if (existingFixedSignatures.has(fixedExpenseSignature({ ...row, date: purchaseDate }))) return [];
    if (outstandingIds.has(String(expense.id || ''))) return [];

    if (displayDate > balanceCutoff) return [row];
    if (!hasImportedCsv) return [];

    return [{
      ...row,
      csvConfirmedByImport: true,
      statusLabel: CONFIRMED_CSV_DISPLAY_STATUS,
    }];
  });
}
