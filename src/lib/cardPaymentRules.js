export const MASTERCARD_PAYMENT_METHOD = 'Mastercard Platinum •••• 4397';
export const MASTERCARD_MASKED_NUMBER = '•••• 4397';

function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month - 1, day);
}

function addUtcDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isBelgianLegalHoliday(value) {
  const date = value instanceof Date ? value : new Date(`${String(value || '')}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const year = date.getUTCFullYear();
  const key = date.toISOString().slice(5, 10);
  const fixedHolidays = new Set(['01-01', '05-01', '07-21', '08-15', '11-01', '11-11', '12-25']);
  if (fixedHolidays.has(key)) return true;

  const easter = easterSunday(year);
  const movableHolidays = [
    addUtcDays(easter, 1),
    addUtcDays(easter, 39),
    addUtcDays(easter, 50),
  ].map((holiday) => holiday.toISOString().slice(0, 10));
  return movableHolidays.includes(date.toISOString().slice(0, 10));
}

function nextBelgianBusinessDay(date) {
  const result = new Date(date);
  while (result.getUTCDay() === 0 || result.getUTCDay() === 6 || isBelgianLegalHoliday(result)) {
    result.setUTCDate(result.getUTCDate() + 1);
  }
  return result;
}

export function mastercardSettlementDate(purchaseDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(purchaseDate || ''));
  if (!match) return '';
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);
  // Cycle clôturé le 7 : prélèvement le 15, reporté au prochain jour ouvrable belge.
  const settlementMonth = day <= 7 ? monthIndex : monthIndex + 1;
  return nextBelgianBusinessDay(isoDate(year, settlementMonth, 15)).toISOString().slice(0, 10);
}

export function isMastercardPaymentMethod(value) {
  return String(value || '') === MASTERCARD_PAYMENT_METHOD;
}

export function previousMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!match) return '';
  const [, yearText, monthText] = match;
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Un achat Mastercard appartient au budget du mois où Belfius prélève le
// décompte. Pour prévoir un mois donné, on lit donc les récurrents carte du
// mois précédent, et non ceux du mois affiché.
export function recurringSourceMonthForBudget(paymentMethod, budgetMonth) {
  return isMastercardPaymentMethod(paymentMethod)
    ? previousMonthKey(budgetMonth)
    : String(budgetMonth || '');
}

const RECURRENCE_INTERVALS = Object.freeze({ monthly: 1, quarterly: 3, semiannual: 6, annual: 12 });

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function shiftMonth(value, offset) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value || ''));
  if (!match) return '';
  return monthKey(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1)));
}

function dateInMonth(month, day) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (!year || !monthNumber) return '';
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(Number(day) || 1, 1), lastDay);
  return `${month}-${String(safeDay).padStart(2, '0')}`;
}

function recurringIsDue(expense, month) {
  const interval = RECURRENCE_INTERVALS[expense?.frequency || 'monthly'] || 1;
  const startMonth = String(expense?.startDate || expense?.start_date || `${month}-01`).slice(0, 7);
  const [startYear, startNumber] = startMonth.split('-').map(Number);
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (![startYear, startNumber, year, monthNumber].every(Number.isFinite)) return false;
  const distance = (year - startYear) * 12 + monthNumber - startNumber;
  return distance >= 0 && distance % interval === 0;
}

function normalizedLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isRecordedCharge(expense, expectedDate, settlementDate, operations) {
  const expectedAmount = Math.abs(Number(expense?.amount) || 0);
  const expectedLabels = [expense?.label, expense?.freeCommunication, expense?.free_communication]
    .map(normalizedLabel)
    .filter(Boolean);

  return operations.some((operation) => {
    if (!isMastercardPaymentMethod(operation?.paymentMethod || operation?.payment_method)) return false;
    if (operation?.type === 'card_settlement') return false;
    const operationDate = String(operation?.date || '');
    const operationSettlement = String(operation?.settlementDate || operation?.settlement_date
      || mastercardSettlementDate(operationDate));
    if (operationSettlement !== settlementDate) return false;
    if (operation?.recurringExpenseId === expense?.id || operation?.recurring_expense_id === expense?.id) return true;
    if (Math.abs(Math.abs(Number(operation?.amount) || 0) - expectedAmount) > 0.01) return false;
    const actualLabel = normalizedLabel(operation?.label);
    const labelMatches = expectedLabels.some((label) => actualLabel === label
      || actualLabel.includes(label) || label.includes(actualLabel));
    return labelMatches && Math.abs(new Date(`${operationDate}T00:00:00Z`) - new Date(`${expectedDate}T00:00:00Z`)) <= 7 * 86400000;
  });
}

export function nextMastercardSettlementDate(asOfDate, operations = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate || ''))) return '';
  const currentMonth = String(asOfDate).slice(0, 7);
  let settlementDate = mastercardSettlementDate(`${currentMonth}-01`);
  const currentSettlementRecorded = operations.some((operation) => (
    operation?.type === 'card_settlement'
    && (operation?.settlesPaymentMethod || operation?.settles_payment_method) === MASTERCARD_PAYMENT_METHOD
    && String(operation?.date || '') === settlementDate
  ));
  if (settlementDate < asOfDate || (settlementDate === asOfDate && currentSettlementRecorded)) {
    settlementDate = mastercardSettlementDate(`${shiftMonth(currentMonth, 1)}-01`);
  }
  return settlementDate;
}

export function mastercardPendingSettlementDate(operations = []) {
  const lastRecordedSettlement = operations
    .filter((operation) => (
      operation?.type === 'card_settlement'
      && (operation?.settlesPaymentMethod || operation?.settles_payment_method) === MASTERCARD_PAYMENT_METHOD
    ))
    .map((operation) => String(operation?.date || ''))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .at(-1) || '';

  return operations
    .filter((operation) => (
      isMastercardPaymentMethod(operation?.paymentMethod || operation?.payment_method)
      && operation?.type !== 'card_settlement'
      && Number(operation?.amount) > 0
    ))
    .map((operation) => String(
      operation?.settlementDate
      || operation?.settlement_date
      || mastercardSettlementDate(operation?.date),
    ))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date > lastRecordedSettlement)
    .sort()[0] || '';
}

/**
 * Projette les récurrences de la période Mastercard encore ouverte. Les achats
 * déjà matérialisés dans les opérations sont exclus pour empêcher tout doublon.
 */
export function mastercardRecurringForecast({ recurringExpenses = [], operations = [], asOfDate = '' } = {}) {
  const nextDebitDate = nextMastercardSettlementDate(asOfDate, operations);
  if (!nextDebitDate) return { nextDebitDate: '', charges: [], total: 0 };
  const debitMonth = nextDebitDate.slice(0, 7);
  const sourceMonths = [shiftMonth(debitMonth, -1), debitMonth];

  const charges = recurringExpenses.flatMap((expense) => {
    const paymentMethod = expense?.paymentMethod || expense?.payment_method || '';
    if (!isMastercardPaymentMethod(paymentMethod) || !(Number(expense?.amount) > 0)) return [];
    return sourceMonths.flatMap((sourceMonth) => {
      if (!recurringIsDue(expense, sourceMonth)) return [];
      const expectedDate = dateInMonth(sourceMonth, expense?.day);
      if (mastercardSettlementDate(expectedDate) !== nextDebitDate) return [];
      if (isRecordedCharge(expense, expectedDate, nextDebitDate, operations)) return [];
      return [{
        id: `mastercard-forecast-${expense.id}-${expectedDate}`,
        recurringExpenseId: expense.id,
        label: expense.label,
        amount: Number(expense.amount),
        expectedDate,
        settlementDate: nextDebitDate,
      }];
    });
  });

  return {
    nextDebitDate,
    charges,
    total: charges.reduce((sum, charge) => sum + charge.amount, 0),
  };
}
