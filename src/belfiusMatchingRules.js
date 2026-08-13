// V32.0 RC2.4.6 — règles de rapprochement bancaire déterministes.
// Ce module centralise les preuves fortes afin d'éviter qu'un simple couple
// montant/date ne concurrence une communication ou une domiciliation Belfius connue.

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

export function isBeobankTransfer(row) {
  if (!row || Number(row.amount) >= 0) return false;
  const text = normalizeBankText(`${row.label || ''} ${row.communication || ''} ${row.details || ''} ${row.rawDetails || ''}`);
  return text.includes('beobank');
}

export function strongCommunicationMatch(bankRow, recurringExpense) {
  if (!bankRow || !recurringExpense) return null;

  // Une référence de domiciliation / mandat est l'empreinte la plus spécifique.
  // Elle peut se trouver dans n'importe quelle colonne du CSV Belfius ; rawDetails
  // conserve donc la ligne bancaire complète sous forme textuelle.
  const expectedDirectDebit = normalizeDirectDebitReference(
    recurringExpense.directDebitReference
      || recurringExpense.direct_debit_reference
      || recurringExpense.mandateReference
      || recurringExpense.mandate_reference
      || '',
  );
  const actualDirectDebitHaystack = normalizeDirectDebitReference(
    `${bankRow.directDebitReference || ''} ${bankRow.communication || ''} ${bankRow.details || ''} ${bankRow.rawDetails || ''}`,
  );
  if (expectedDirectDebit && actualDirectDebitHaystack.includes(expectedDirectDebit)) {
    return { kind: 'direct-debit', confidence: 100 };
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
  const actualFree = normalizeBankText(`${bankRow.communication || ''} ${bankRow.details || ''} ${bankRow.rawDetails || ''}`);
  if (!expectedFree || !actualFree) return null;

  const mode = recurringExpense.freeCommunicationMode
    || recurringExpense.free_communication_mode
    || 'contains';
  const matches = mode === 'exact'
    ? actualFree === expectedFree
    : actualFree.includes(expectedFree);

  return matches ? { kind: 'free', confidence: 100 } : null;
}

export function hasStrongCommunicationFingerprint(bankRow, recurringExpenses = []) {
  return recurringExpenses.some((expense) => strongCommunicationMatch(bankRow, expense));
}

export function shouldOfferAmountDateFallback(bankRow, recurringExpenses = []) {
  // Une transaction disposant déjà d'une empreinte forte ne doit jamais recevoir
  // des propositions concurrentes uniquement parce que leur montant/date coïncident.
  return !hasStrongCommunicationFingerprint(bankRow, recurringExpenses) && !isBeobankTransfer(bankRow);
}

export function isTrueOrphanAppOperation(appRow, context = {}) {
  if (!appRow) return false;
  const {
    cutoffDate = '',
    pendingAppIds = new Set(),
    matchedAppIds = new Set(),
    groupedAppIds = new Set(),
    splitAppIds = new Set(),
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

export function classifyBankBusinessRule(row) {
  if (isBeobankTransfer(row)) {
    return {
      key: 'beobank',
      destination: 'Vacances/Loisirs',
      bucket: 'vacances',
      kind: 'internal-savings-transfer',
      auto: true,
      excludeFromExpenseMatching: true,
    };
  }
  return null;
}

export const BELFIUS_BUSINESS_RULES = Object.freeze({
  beobank: {
    destination: 'Vacances/Loisirs',
    bucket: 'vacances',
    kind: 'internal-savings-transfer',
    auto: true,
    excludeFromExpenseMatching: true,
  },
});
