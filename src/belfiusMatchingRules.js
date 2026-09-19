// V32 — règles de rapprochement bancaire déterministes.
// Les preuves fortes (mandat, communication, OP) restent prioritaires sur montant/date.
import { savingsRuleForText } from './savingsOrderRules.js';
import { amountCents } from './domain/money/money.js';

export function normalizeBankText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function normalizeStructuredCommunication(value) { return String(value || '').replace(/\D/g, ''); }
export function normalizeDirectDebitReference(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

export function isBankCreditAppOperation(operation) {
  return operation?.type === 'income' || operation?.type === 'reimbursement';
}

const BANK_PERSON_ALIASES = Object.freeze([
  { bank: ['pluta janina'], app: ['nonna'] },
]);

const RECURRING_BENEFICIARY_ALIASES = Object.freeze([
  { bank: ['stellantis financial', 'psa finance'], app: ['stellantis financial', 'psa finance'] },
  { bank: ['mega power online', 'mega'], app: ['mega', 'electricite', 'gaz', 'energie'] },
  { bank: ['ethias'], app: ['ethias'] },
  { bank: ['proximus'], app: ['proximus', 'tv internet', 'gsm'] },
  { bank: ['test achats', 'test aankoop'], app: ['test achats'] },
  { bank: ['ag insurance'], app: ['ag assurance', 'remboursement maison esther'] },
  { bank: ['setca'], app: ['syndicat'] },
]);

const RECURRING_FAMILIES = Object.freeze([
  { key: 'ethias', bank: ['ethias'], app: ['ethias'] },
  { key: 'test-achats', bank: ['test achats', 'test aankoop'], app: ['test achats', 'test aankoop'] },
]);

export const RECURRING_BANK_DATE_TOLERANCE_DAYS = 5;

export function bankPersonAliasMatch(bankRow, appRow) {
  const bankText = normalizeBankText(bankHaystack(bankRow));
  const appText = normalizeBankText(`${appRow?.person || ''} ${appRow?.label || ''} ${appRow?.store || ''}`);
  return BANK_PERSON_ALIASES.some((alias) => (
    alias.bank.some((needle) => bankText.includes(needle))
    && alias.app.some((needle) => appText.includes(needle))
  ));
}

function bankHaystack(row) {
  return `${row?.directDebitReference || ''} ${row?.label || ''} ${row?.communication || ''} ${row?.details || ''} ${row?.rawDetails || ''}`;
}

function recurringLabelText(expense) {
  return normalizeBankText(`${expense?.label || ''} ${expense?.store || ''}`);
}

export function recurringBeneficiaryMatch(bankRow, expense) {
  const bankText = normalizeBankText(bankHaystack(bankRow));
  const appText = recurringLabelText(expense);
  if (!bankText || !appText) return false;
  const familyMatch = RECURRING_FAMILIES.some((family) => (
    family.bank.some((needle) => bankText.includes(needle))
    && family.app.some((needle) => appText.includes(needle))
  ));
  if (familyMatch) return true;
  if (bankText.includes(appText) || appText.includes(bankText)) return true;

  const meaningfulTokens = appText.split(' ').filter(token => token.length >= 5);
  if (meaningfulTokens.some(token => bankText.includes(token))) return true;

  return RECURRING_BENEFICIARY_ALIASES.some(alias => (
    alias.bank.some(needle => bankText.includes(needle))
    && alias.app.some(needle => appText.includes(needle))
  ));
}

export function recurringBankMatchEvidence(bankRow, expense, expectedDate = '') {
  const bankAmount = amountCents(bankRow);
  const expectedAmount = Math.abs(amountCents(expense));
  if (bankAmount >= 0 || !expectedAmount) return null;
  if (Math.abs(bankAmount) !== expectedAmount) return null;

  const bankDate = String(bankRow?.date || '');
  if (!bankDate || !expectedDate) return null;
  const dayDistance = Math.abs(
    Date.parse(`${bankDate}T12:00:00Z`) - Date.parse(`${expectedDate}T12:00:00Z`),
  ) / 86400000;
  if (!Number.isFinite(dayDistance) || dayDistance > RECURRING_BANK_DATE_TOLERANCE_DAYS) return null;

  const communication = strongCommunicationMatch(bankRow, expense);
  if (communication) return { confidence: 100, dayDistance, reason: communication.kind };
  if (recurringBeneficiaryMatch(bankRow, expense)) {
    return { confidence: 90, dayDistance, reason: 'beneficiary-family' };
  }
  return null;
}

export function isBeobankTransfer(row) {
  return Boolean(row && amountCents(row) < 0 && normalizeBankText(bankHaystack(row)).includes('beobank'));
}

export function strongCommunicationMatch(bankRow, recurringExpense) {
  if (!bankRow || !recurringExpense) return null;
  const expectedReference = normalizeDirectDebitReference(
    recurringExpense.directDebitReference || recurringExpense.direct_debit_reference
      || recurringExpense.mandateReference || recurringExpense.mandate_reference
      || recurringExpense.orderReference || recurringExpense.order_reference || '',
  );
  const actualReferenceText = normalizeDirectDebitReference(bankHaystack(bankRow));
  if (expectedReference && actualReferenceText.includes(expectedReference)) {
    return { kind: 'direct-debit', confidence: 100, reference: expectedReference };
  }

  const expectedStructured = normalizeStructuredCommunication(
    recurringExpense.structuredCommunication || recurringExpense.structured_communication
      || recurringExpense.communication || recurringExpense.ocr || '',
  );
  const actualStructured = normalizeStructuredCommunication(bankRow.structuredCommunication || bankRow.communication || '');
  if (expectedStructured && actualStructured && (actualStructured.includes(expectedStructured) || expectedStructured.includes(actualStructured))) {
    return { kind: 'structured', confidence: 100 };
  }

  const expectedFree = normalizeBankText(recurringExpense.freeCommunication || recurringExpense.free_communication || '');
  const actualFree = normalizeBankText(bankHaystack(bankRow));
  if (!expectedFree || !actualFree) return null;
  const mode = recurringExpense.freeCommunicationMode || recurringExpense.free_communication_mode || 'contains';
  return (mode === 'exact' ? actualFree === expectedFree : actualFree.includes(expectedFree))
    ? { kind: 'free', confidence: 100 } : null;
}

export function hasStrongCommunicationFingerprint(bankRow, recurringExpenses = []) {
  return recurringExpenses.some((expense) => strongCommunicationMatch(bankRow, expense));
}

export function recurringExpenseHasBankMovement(expense, bankRows = []) {
  return Boolean(expense) && bankRows.some((row) => Boolean(strongCommunicationMatch(row, expense)));
}

function configuredSavingsRuleForText(value, savingsGoals = []) {
  const haystack = String(value || '');
  const goal = savingsGoals.find((candidate) => {
    const reference = String(candidate.standing_order_reference || candidate.standingOrderReference || '').trim();
    return candidate.active !== false && reference && haystack.includes(reference);
  });
  if (!goal) return null;
  return {
    op: String(goal.standing_order_reference || goal.standingOrderReference),
    bucket: goal.bucket || goal.id,
    label: goal.label,
    expectedMonthly: Number(goal.monthly_amount ?? goal.monthlyAmount ?? 0),
  };
}

export function classifyBankBusinessRule(row, savingsGoals = []) {
  if (!row || amountCents(row) >= 0) return null;
  const savingsRule = configuredSavingsRuleForText(bankHaystack(row), savingsGoals)
    || savingsRuleForText(bankHaystack(row));
  if (savingsRule) return {
    key: `op-${savingsRule.op}`,
    destination: savingsRule.label,
    bucket: savingsRule.bucket,
    orderReference: savingsRule.op,
    expectedMonthly: savingsRule.expectedMonthly,
    kind: 'internal-savings-transfer',
    auto: true,
    // Les OP d'épargne sont contrôlés dans la rubrique Épargne. Ils ne doivent jamais
    // polluer le rapprochement général ni apparaître comme "opérations Belfius absentes".
    excludeFromExpenseMatching: true,
  };
  if (isBeobankTransfer(row)) return {
    key: 'beobank', destination: 'Vacances / Loisirs', bucket: 'vacances',
    kind: 'internal-savings-transfer', auto: true, excludeFromExpenseMatching: true,
  };
  return null;
}

export function shouldOfferAmountDateFallback(bankRow, recurringExpenses = []) {
  return !hasStrongCommunicationFingerprint(bankRow, recurringExpenses)
    && !classifyBankBusinessRule(bankRow)?.excludeFromExpenseMatching;
}

export function isTrueOrphanAppOperation(appRow, context = {}) {
  if (!appRow) return false;
  const { cutoffDate = '', pendingAppIds = new Set(), matchedAppIds = new Set(), groupedAppIds = new Set(), splitAppIds = new Set() } = context;
  if (cutoffDate && String(appRow.date || '') > cutoffDate) return false;
  return !pendingAppIds.has(appRow.id) && !matchedAppIds.has(appRow.id) && !groupedAppIds.has(appRow.id) && !splitAppIds.has(appRow.id);
}

export function explainOrphanAppOperation(appRow, cutoffDate = '') {
  if (!appRow) return '';
  if (cutoffDate && String(appRow.date || '') > cutoffDate) return 'Opération programmée : postérieure au dernier solde Belfius importé.';
  return 'Écriture Mon Foyer sans correspondance bancaire après rapprochement complet.';
}

export const BELFIUS_BUSINESS_RULES = Object.freeze({
  beobank: { destination: 'Vacances / Loisirs', bucket: 'vacances', kind: 'internal-savings-transfer', auto: true, excludeFromExpenseMatching: true },
});
