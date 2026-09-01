const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const ACCOUNTING_NATURES = Object.freeze({
  INCOME: 'income',
  REIMBURSEMENT: 'reimbursement',
  EXPENSE: 'expense',
  INTERNAL_TRANSFER: 'internal_transfer',
  SAVINGS_WITHDRAWAL: 'savings_withdrawal',
  CARD_PURCHASE: 'card_purchase',
  CARD_SETTLEMENT: 'card_settlement',
  ADJUSTMENT: 'adjustment',
});

const LEGACY_INTERNAL_TRANSFER_LABELS = [
  'prime',
  'argent de poche (beobank)',
  'epargne solde peugeot',
  'epargne cadastre & contributions',
  'taxes / impots',
  'epargne pension alain',
  'epargne pension esther',
  'epargne loisirs',
  'frais divers foyer',
  'frais divers vehicule',
];

export function accountingNature(operation = {}) {
  const explicit = operation.accountingNature || operation.accounting_nature;
  if (Object.values(ACCOUNTING_NATURES).includes(explicit)) return explicit;

  const type = normalize(operation.type);
  const direction = normalize(operation.savingsDirection || operation.savings_direction);
  const label = normalize(operation.label);
  const category = normalize(operation.category);
  const paymentMethod = normalize(operation.paymentMethod || operation.payment_method);

  if (label.startsWith('ajustement belfius')) return ACCOUNTING_NATURES.ADJUSTMENT;
  if (type === 'card settlement' || type === 'card_settlement') return ACCOUNTING_NATURES.CARD_SETTLEMENT;
  if (direction === 'out' || label.startsWith('transfert depuis epargne')) return ACCOUNTING_NATURES.SAVINGS_WITHDRAWAL;
  if (type === 'savings transfer' || type === 'savings_transfer' || direction === 'in') return ACCOUNTING_NATURES.INTERNAL_TRANSFER;
  if (type === 'income') return ACCOUNTING_NATURES.INCOME;
  if (type === 'reimbursement') return ACCOUNTING_NATURES.REIMBURSEMENT;

  const isLegacySavingsTransfer = category.startsWith('epargne')
    || label.startsWith('epargne ')
    || LEGACY_INTERNAL_TRANSFER_LABELS.includes(label)
    || (normalize(operation.store).includes('beobank') && category.includes('epargne'));
  if (isLegacySavingsTransfer) return ACCOUNTING_NATURES.INTERNAL_TRANSFER;

  if (paymentMethod.includes('mastercard')) return ACCOUNTING_NATURES.CARD_PURCHASE;
  return ACCOUNTING_NATURES.EXPENSE;
}

export const isBudgetExpense = (operation) => [
  ACCOUNTING_NATURES.EXPENSE,
  ACCOUNTING_NATURES.CARD_PURCHASE,
].includes(accountingNature(operation));

export const isInternalTransfer = (operation) => accountingNature(operation) === ACCOUNTING_NATURES.INTERNAL_TRANSFER;
export const isSavingsWithdrawal = (operation) => accountingNature(operation) === ACCOUNTING_NATURES.SAVINGS_WITHDRAWAL;
export const isBudgetResource = (operation) => [
  ACCOUNTING_NATURES.INCOME,
  ACCOUNTING_NATURES.REIMBURSEMENT,
  ACCOUNTING_NATURES.SAVINGS_WITHDRAWAL,
].includes(accountingNature(operation));

