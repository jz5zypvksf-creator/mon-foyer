// Registre métier des ordres permanents affectés à l'épargne.
// Le numéro d'OP est l'identifiant bancaire stable; le montant peut varier.
export const SAVINGS_ORDER_RULES = [
  { op: '18833987', bucket: 'vacances', label: 'Vacances / Loisirs', expectedMonthly: 100 },
  { op: '18833985', bucket: 'frais_maison', label: 'Frais divers maison / foyer', expectedMonthly: 100 },
  { op: '18838193', bucket: 'garage', label: 'Garage / Entretien véhicule', expectedMonthly: 100 },
  { op: '20401142', bucket: 'taxes', label: 'Taxes / Impôts', expectedMonthly: 300 },
  { op: '18893403', bucket: 'solde_peugeot', label: 'Épargne solde Peugeot', expectedMonthly: null },
  { op: '17178591', bucket: 'pension_alain', label: 'Épargne pension Alain', expectedMonthly: 110 },
  { op: '17178594', bucket: 'pension_esther', label: 'Épargne pension Esther', expectedMonthly: 110 },
];

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
  if (label.includes('solde peugeot')) return savingsRuleForBucket('solde_peugeot');
  if (label.includes('loisir') || label.includes('vacance')) return savingsRuleForBucket('vacances');
  if (label.includes('taxe') || label.includes('impot')) return savingsRuleForBucket('taxes');
  if (label.includes('vehicule') || label.includes('garage')) return savingsRuleForBucket('garage');
  if (label.includes('maison') || label.includes('foyer')) return savingsRuleForBucket('frais_maison');
  return null;
}

export function savingsTransferSourceLabel(bucket) {
  const rule = savingsRuleForBucket(bucket);
  return rule ? `Épargne ${rule.label.replace(/^Épargne\s+/i, '')}` : '';
}
