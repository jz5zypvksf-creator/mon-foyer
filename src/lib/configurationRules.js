export const DEFAULT_FOOD_BUDGET = 500;
export const DEFAULT_CARE_PEOPLE = ['Papa', 'Nonna'];

export function foodBudgetForMonth(settings = [], monthKey = '', fallback = DEFAULT_FOOD_BUDGET) {
  const applicable = settings
    .filter((setting) => String(setting.effectiveMonth || setting.effective_month || '') <= monthKey)
    .sort((left, right) => String(right.effectiveMonth || right.effective_month || '')
      .localeCompare(String(left.effectiveMonth || left.effective_month || '')));
  const value = Number(applicable[0]?.foodBudget ?? applicable[0]?.food_budget ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function annualFoodBudget(settings = [], year = '', fallback = DEFAULT_FOOD_BUDGET) {
  return Array.from({ length: 12 }, (_, index) => (
    foodBudgetForMonth(settings, `${year}-${String(index + 1).padStart(2, '0')}`, fallback)
  )).reduce((sum, value) => sum + value, 0);
}

export function activeCarePeople(rows = []) {
  const source = rows.length
    ? rows.filter((row) => row.active !== false && row.tracksReimbursements !== false && row.tracks_reimbursements !== false)
      .map((row) => String(row.name || '').trim())
    : DEFAULT_CARE_PEOPLE;
  return [...new Set(source.filter(Boolean))];
}

export function configuredCarePeople(rows = []) {
  const source = rows.length
    ? rows.map((row) => String(row.name || '').trim())
    : DEFAULT_CARE_PEOPLE;
  return [...new Set(source.filter(Boolean))];
}

export function reimbursementTrackedPeople(rows = []) {
  const source = rows.length
    ? rows.filter((row) => row.tracksReimbursements !== false && row.tracks_reimbursements !== false)
      .map((row) => String(row.name || '').trim())
    : DEFAULT_CARE_PEOPLE;
  return [...new Set(source.filter(Boolean))];
}

export function foodBudgetExcludedPeople(rows = []) {
  const source = rows.length
    ? rows.filter((row) => row.excludeFromFoodBudget !== false && row.exclude_from_food_budget !== false)
      .map((row) => String(row.name || '').trim())
    : DEFAULT_CARE_PEOPLE;
  return [...new Set(source.filter(Boolean))];
}

export function peopleOptions(carePeople = []) {
  return [...new Set(['Foyer', 'Alain', 'Esther', ...carePeople])];
}

export function normalizeStandingOrderReference(value) {
  return String(value || '').replace(/\D/g, '');
}

export function standingOrderAlreadyAssigned(reference, goals = [], currentGoalId = null) {
  const normalized = normalizeStandingOrderReference(reference);
  if (!normalized) return false;
  return goals.some((goal) => goal.id !== currentGoalId
    && normalizeStandingOrderReference(goal.standing_order_reference || goal.standingOrderReference) === normalized);
}
