// Registre métier des ordres permanents affectés à l'épargne.
// Le numéro d'OP est l'identifiant bancaire stable; le montant peut varier.
export const SAVINGS_ORDER_RULES = [
  { op: '18833987', bucket: 'vacances', label: 'Vacances / Loisirs', expectedMonthly: 100 },
  { op: '18833985', bucket: 'frais_maison', label: 'Frais divers maison / foyer', expectedMonthly: 100 },
  { op: '18838193', bucket: 'garage', label: 'Garage / Entretien véhicule', expectedMonthly: 100 },
  { op: '19776928', bucket: 'taxes', label: 'Taxes / Impôts', expectedMonthly: 300 },
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

export function savingsTransferSourceLabel(bucket) {
  const rule = savingsRuleForBucket(bucket);
  return rule ? `Épargne ${rule.label.replace(/^Épargne\s+/i, '')}` : '';
}
