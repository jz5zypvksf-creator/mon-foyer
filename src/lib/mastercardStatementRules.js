import { amountCents } from '../domain/money/money.js';

const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const MASTERCARD_STATEMENT_REFERENCE = 'releve mastercard numero';

export function isMastercardStatementCommunication(value) {
  return normalize(value).includes(MASTERCARD_STATEMENT_REFERENCE);
}

export function isMastercardStatementRow(row) {
  return isMastercardStatementCommunication(
    `${row?.label || ''} ${row?.communication || ''} ${row?.details || ''}`,
  );
}

export function isMastercardSettlementOperation(operation) {
  const settledMethod = operation?.settlesPaymentMethod
    || operation?.settles_payment_method
    || '';
  return normalize(settledMethod).includes('mastercard');
}

export function mastercardStatementMatchEvidence(bankRow, operation, options = {}) {
  if (!isMastercardStatementRow(bankRow) || !isMastercardSettlementOperation(operation)) return null;

  const amountToleranceCents = Number(options.amountToleranceCents ?? 5);
  const dateToleranceDays = Number(options.dateToleranceDays ?? 2);
  const bankAmount = Math.abs(amountCents(bankRow));
  const operationAmount = Math.abs(amountCents(operation));
  if (Math.abs(bankAmount - operationAmount) > amountToleranceCents) return null;

  const bankDate = String(bankRow?.date || '');
  const operationDate = String(operation?.date || '');
  if (!bankDate || !operationDate || bankDate.slice(0, 7) !== operationDate.slice(0, 7)) return null;
  const distance = Math.abs(
    Date.parse(`${bankDate}T12:00:00Z`) - Date.parse(`${operationDate}T12:00:00Z`),
  ) / 86400000;
  if (distance > dateToleranceDays) return null;

  return {
    auto: true,
    confidence: 100,
    reason: 'Référence mensuelle « RELEVE MASTERCARD » et montant exact',
    recurring: null,
    mastercardStatement: true,
  };
}
