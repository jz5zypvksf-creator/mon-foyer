const REIMBURSABLE_CARE_PEOPLE = new Set(['Papa', 'Nonna']);

export function belongsToHouseholdFoodBudget(operation) {
  return operation?.category === 'nourriture'
    && !REIMBURSABLE_CARE_PEOPLE.has(operation?.person);
}

export function householdFoodTotal(operations = []) {
  return operations
    .filter(belongsToHouseholdFoodBudget)
    .reduce((sum, operation) => sum + Number(operation?.amount || 0), 0);
}
