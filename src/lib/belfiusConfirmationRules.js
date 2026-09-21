export const BELFIUS_CONFIRMATIONS_STORAGE_KEY = 'mon-foyer-belfius-confirmations-v1';

function normalizedText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizedCommunication(value) {
  return String(value || '').replace(/\D/g, '');
}

function rowAmountCents(row) {
  const explicit = Number(row?.amountCents ?? row?.amount_cents);
  if (Number.isSafeInteger(explicit)) return explicit;
  return Math.round((Number(row?.amount) || 0) * 100);
}

function bankRowCore(row) {
  const strongReference = normalizedCommunication(
    row?.structuredCommunication || row?.structured_communication || row?.communication || '',
  );
  const textIdentity = normalizedText([
    row?.label,
    row?.beneficiaryRaw,
    row?.directDebitReference,
    row?.transaction,
    row?.communication,
    row?.details,
  ].filter(Boolean).join(' '));
  return [String(row?.date || ''), rowAmountCents(row), strongReference, textIdentity].join('|');
}

export function bankRowFingerprint(row, rows = []) {
  if (!row) return '';
  const core = bankRowCore(row);
  const rowIndex = rows.findIndex((candidate) => (
    candidate === row || (candidate?.id && row?.id && candidate.id === row.id)
  ));
  const occurrence = rowIndex < 0
    ? 0
    : rows.slice(0, rowIndex).filter((candidate) => bankRowCore(candidate) === core).length;
  return `${core}|occurrence:${occurrence}`;
}

function normalizeTarget(target) {
  return {
    recurringExpenseId: String(target?.recurringExpenseId || target?.recurring_expense_id || ''),
    appId: String(target?.appId || target?.app_id || target?.id || ''),
    label: String(target?.label || ''),
    amountCents: Number.isSafeInteger(Number(target?.amountCents ?? target?.amount_cents))
      ? Number(target?.amountCents ?? target?.amount_cents)
      : Math.round(Math.abs(Number(target?.amount) || 0) * 100),
  };
}

export function normalizeBankMatchConfirmation(value) {
  const fingerprint = String(value?.bankFingerprint || value?.bank_fingerprint || '');
  const targets = (Array.isArray(value?.targets) ? value.targets : [])
    .map(normalizeTarget)
    .filter((target) => target.recurringExpenseId || target.appId);
  if (!fingerprint || targets.length === 0) return null;
  return {
    bankFingerprint: fingerprint,
    targets,
    source: String(value?.source || 'manual'),
    confirmedAt: String(value?.confirmedAt || value?.confirmed_at || new Date().toISOString()),
  };
}

export function mergeBankMatchConfirmations(current = [], additions = []) {
  const byFingerprint = new Map();
  [...current, ...additions].forEach((value) => {
    const confirmation = normalizeBankMatchConfirmation(value);
    if (confirmation) byFingerprint.set(confirmation.bankFingerprint, confirmation);
  });
  return [...byFingerprint.values()];
}

export function loadBankMatchConfirmations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BELFIUS_CONFIRMATIONS_STORAGE_KEY) || '[]');
    return mergeBankMatchConfirmations([], Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function persistBankMatchConfirmations(confirmations = []) {
  const normalized = mergeBankMatchConfirmations([], confirmations);
  try {
    localStorage.setItem(BELFIUS_CONFIRMATIONS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Une indisponibilité du stockage ne doit pas bloquer l'audit en cours.
  }
  return normalized;
}

export function confirmationForBankRow(confirmations = [], row, rows = []) {
  const fingerprint = row?.bankFingerprint || bankRowFingerprint(row, rows);
  return confirmations.find((confirmation) => (
    String(confirmation?.bankFingerprint || confirmation?.bank_fingerprint || '') === fingerprint
  )) || null;
}

export function confirmedRecurringIdsForBankRows(confirmations = [], rows = []) {
  const ids = new Set();
  rows.forEach((row) => {
    const confirmation = confirmationForBankRow(confirmations, row, rows);
    (confirmation?.targets || []).forEach((target) => {
      const id = String(target?.recurringExpenseId || target?.recurring_expense_id || '');
      if (id) ids.add(id);
    });
  });
  return ids;
}
