// V32 — règles de rapprochement bancaire déterministes.
// Les preuves fortes (mandat, communication, OP) restent prioritaires sur montant/date.
import { savingsRuleForText } from './savingsOrderRules.js';

export function normalizeBankText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeStructuredCommunication(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeDirectDebitReference(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function bankHaystack(row) {
  return `${row?.directDebitReference || ''} ${row?.label || ''} ${row?.communication || ''} ${row?.details || ''} ${row?.rawDetails || ''}`;
}

export function isBeobankTransfer(row) {
  if (!row || Number(row.amount) >= 0) return false;
  return normalizeBankText(bankHaystack(row)).includes('beobank');
}

export function strongCommunicationMatch(bankRow, recurringExpense) {
  if (!bankRow || !recurringExpense) return null;

  // Le champ accepte une référence de domiciliation / mandat / ordre permanent.
  const expectedDirectDebit = normalizeDirectDebitReference(
    recurringExpense.directDebitReference
      || recurringExpense.direct_debit_reference
      || recurringExpense.mandateReference
      || recurringExpense.mandate_reference
      || recurringExpense.orderReference
      || recurringExpense.order_reference
      || '',
  );
  const actualDirectDebitHaystack = normalizeDirectDebitReference(bankHaystack(bankRow));
  if (expectedDirectDebit && actualDirectDebitHaystack.includes(expectedDirectDebit)) {
    return { kind: 'bank-reference', confidence: 100 };
  }

  const expectedStructured = normalizeStructuredCommunication(
    recurringExpense.structuredCommunication
      || recurringExpense.structured_communication
      || recurringExpense.communication
      || recurringExpense.ocr
      || '',
  );
  const actualStructured = normalizeStructuredCommunication(
    bankRow.structuredCommunication || bankRow.communication || '',
  );
  if (expectedStructured && actualStructured
    && (actualStructured.includes(expectedStructured) || expectedStructured.includes(actualStructured))) {
    return { kind: 'structured', confidence: 100 };
  }

  const expectedFree = normalizeBankText(
    recurringExpense.freeCommunication || recurringExpense.free_communication || '',
  );
  const actualFree = normalizeBankText(bankHaystack(bankRow));
  if (!expectedFree || !actualFree) return null;
  const mode = recurringExpense.freeCommunicationMode
    || recurringExpense.free_communication_mode
    || 'contains';
  const matches = mode === 'exact' ? actualFree === expectedFree : actualFree.includes(expectedFree);
  return matches ? { kind: 'free', confidence: 100 } : null;
}

export function hasStrongCommunicationFingerprint(bankRow, recurringExpenses = []) {
  return recurringExpenses.some((expense) => strongCommunicationMatch(bankRow, expense));
}

export function classifyBankBusinessRule(row) {
  if (!row || Number(row.amount) >= 0) return null;
  const savingsRule = savingsRuleForText(bankHaystack(row));
  if (savingsRule) {
    return {
      key: `op-${savingsRule.op}`,
      destination: savingsRule.label,
      bucket: savingsRule.bucket,
      orderReference: savingsRule.op,
      expectedMonthly: savingsRule.expectedMonthly,
      kind: 'internal-savings-transfer',
      auto: true,
      excludeFromExpenseMatching: true,
    };
  }
  // Compatibilité historique : tout transfert Beobank non encore porteur d'un OP connu
  // reste affecté à Vacances / Loisirs.
  if (isBeobankTransfer(row)) {
    return {
      key: 'beobank',
      destination: 'Vacances / Loisirs',
      bucket: 'vacances',
      kind: 'internal-savings-transfer',
      auto: true,
      excludeFromExpenseMatching: true,
    };
  }
  return null;
}

export function shouldOfferAmountDateFallback(bankRow, recurringExpenses = []) {
  return !hasStrongCommunicationFingerprint(bankRow, recurringExpenses)
    && !classifyBankBusinessRule(bankRow)?.excludeFromExpenseMatching;
}

export function isTrueOrphanAppOperation(appRow, context = {}) {
  if (!appRow) return false;
  const {
    cutoffDate = '', pendingAppIds = new Set(), matchedAppIds = new Set(),
    groupedAppIds = new Set(), splitAppIds = new Set(),
  } = context;
  if (cutoffDate && String(appRow.date || '') > cutoffDate) return false;
  if (pendingAppIds.has(appRow.id)) return false;
  if (matchedAppIds.has(appRow.id)) return false;
  if (groupedAppIds.has(appRow.id)) return false;
  if (splitAppIds.has(appRow.id)) return false;
  return true;
}

export function explainOrphanAppOperation(appRow, cutoffDate = '') {
  if (!appRow) return '';
  if (cutoffDate && String(appRow.date || '') > cutoffDate) {
    return 'Opération programmée : postérieure au dernier solde Belfius importé.';
  }
  return 'Écriture Mon Foyer sans correspondance bancaire après rapprochement complet.';
}

export const BELFIUS_BUSINESS_RULES = Object.freeze({
  beobank: {
    destination: 'Vacances / Loisirs', bucket: 'vacances',
    kind: 'internal-savings-transfer', auto: true, excludeFromExpenseMatching: true,
  },
});
