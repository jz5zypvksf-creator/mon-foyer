// Registre métier des ordres permanents affectés à l'épargne.
// Le numéro d'OP est l'identifiant bancaire stable; le montant peut varier.
import matchingConfig from './matchingConfig.json' with { type: 'json' };

export const SAVINGS_ORDER_RULES = matchingConfig.savingsOrders;

export function savingsRuleForText(value) {
  const text = String(value || '');
  return SAVINGS_ORDER_RULES.find((rule) => text.includes(rule.op)) || null;
}

export function savingsRuleForBucket(bucket) {
  return SAVINGS_ORDER_RULES.find((rule) => rule.bucket === bucket) || null;
}

function normalizedLabel(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function savingsRuleForExpense(expense = {}) {
  const explicit = savingsRuleForText(`${expense.directDebitReference || expense.direct_debit_reference || ''}`);
  if (explicit) return explicit;
  const byBucket = savingsRuleForBucket(expense.bucket || expense.savingsBucket || expense.savings_bucket || '');
  if (byBucket) return byBucket;
  const label = normalizedLabel(expense.label);
  return SAVINGS_ORDER_RULES.find((rule) => (rule.labelKeywords || [])
    .some((keyword) => label.includes(normalizedLabel(keyword)))) || null;
}

export function savingsTransferSourceLabel(bucket) {
  const rule = savingsRuleForBucket(bucket);
  return rule ? `Épargne ${rule.label.replace(/^Épargne\s+/i, '')}` : '';
}
