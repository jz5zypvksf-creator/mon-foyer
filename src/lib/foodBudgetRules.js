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

export function foodBudgetVisualStatus(spent = 0, budget = 0) {
  const safeSpent = Math.max(Number(spent) || 0, 0);
  const safeBudget = Math.max(Number(budget) || 0, 0);
  const ratio = safeBudget > 0
    ? safeSpent / safeBudget
    : safeSpent > 0 ? Number.POSITIVE_INFINITY : 0;

  if (ratio < 0.8) return { key: 'green', ratio };
  if (ratio < 0.95) return { key: 'orange', ratio };
  if (ratio <= 1) return { key: 'red', ratio };
  if (ratio <= 1.1) return { key: 'dark-red', ratio };
  return { key: 'black', ratio };
}
