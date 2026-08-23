const DEFAULT_REIMBURSABLE_CARE_PEOPLE = ['Papa', 'Nonna'];

export function belongsToHouseholdFoodBudget(operation, reimbursablePeople = DEFAULT_REIMBURSABLE_CARE_PEOPLE) {
  const excluded = new Set(reimbursablePeople);
  return operation?.category === 'nourriture'
    && !excluded.has(operation?.person);
}

export function householdFoodTotal(operations = [], reimbursablePeople = DEFAULT_REIMBURSABLE_CARE_PEOPLE) {
  return operations
    .filter((operation) => belongsToHouseholdFoodBudget(operation, reimbursablePeople))
    .reduce((sum, operation) => sum + Number(operation?.amount || 0), 0);
}
