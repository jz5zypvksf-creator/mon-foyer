export const MASTERCARD_PAYMENT_METHOD = 'Mastercard Platinum •••• 4397';
export const MASTERCARD_MASKED_NUMBER = '•••• 4397';

function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function nextBusinessDay(date) {
  const result = new Date(date);
  while (result.getUTCDay() === 0 || result.getUTCDay() === 6) {
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
  // Cycle clôturé le 7 : prélèvement le 16, reporté au lundi si nécessaire.
  const settlementMonth = day <= 7 ? monthIndex : monthIndex + 1;
  return nextBusinessDay(isoDate(year, settlementMonth, 16)).toISOString().slice(0, 10);
}

export function isMastercardPaymentMethod(value) {
  return String(value || '') === MASTERCARD_PAYMENT_METHOD;
}
