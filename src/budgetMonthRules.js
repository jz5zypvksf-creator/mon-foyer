// V32.0 RC2.4.6 — lecture budgétaire distincte de la date bancaire.
// Les salaires versés en fin de mois précédent financent le mois suivant,
// sans déplacer ni dupliquer leur écriture bancaire réelle.

export const CARE_TRACKING_START_DATE = '2026-08-01';

export function previousMonthKey(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return '';
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isSalaryIncome(operation) {
  if (!operation || operation.type !== 'income') return false;
  const label = String(operation.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return label.includes('salaire');
}

export function budgetIncomeOperationsForMonth(operations = [], monthKey = '') {
  const explicitlyAssigned = operations.filter((operation) => operation.type === 'income'
    && (operation.budgetMonth || operation.budget_month) === monthKey
    && !String(operation.label || '').toLowerCase().includes('transfert depuis épargne'));
  const explicitlyAssignedIds = new Set(explicitlyAssigned.map((operation) => operation.id));
  const previous = previousMonthKey(monthKey);
  const currentIncome = operations.filter((operation) => operation.type === 'income'
    && !(operation.budgetMonth || operation.budget_month)
    && String(operation.date || '').startsWith(monthKey)
    && !String(operation.label || '').toLowerCase().includes('transfert depuis épargne'));
  const currentSalaryPersons = new Set(currentIncome.filter(isSalaryIncome).map((operation) => operation.person || 'Foyer'));

  const carriedSalaries = operations.filter((operation) => {
    if (!isSalaryIncome(operation) || !String(operation.date || '').startsWith(previous)) return false;
    const day = Number(String(operation.date || '').slice(8, 10));
    if (day < 24) return false;
    return !currentSalaryPersons.has(operation.person || 'Foyer');
  });

  return [...explicitlyAssigned, ...currentIncome, ...carriedSalaries.filter((operation) => !explicitlyAssignedIds.has(operation.id))];
}

export function budgetIncomeTotalForMonth(operations = [], monthKey = '') {
  return budgetIncomeOperationsForMonth(operations, monthKey)
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
}

export function forecastBalances({ appAvailable = 0, appBelfiusBalance = 0, realBelfiusBalance = null, remainingToCover = 0 } = {}) {
  const appForecast = Number(appAvailable || 0) - Number(remainingToCover || 0);
  if (realBelfiusBalance == null || !Number.isFinite(Number(realBelfiusBalance))) {
    return { appForecast, belfiusForecast: null };
  }
  const bankAdjustedAvailable = Number(appAvailable || 0)
    - Number(appBelfiusBalance || 0)
    + Number(realBelfiusBalance || 0);
  return { appForecast, belfiusForecast: bankAdjustedAvailable - Number(remainingToCover || 0) };
}

function careRowsFromStart(operations = [], person = '') {
  return operations.filter((operation) => (
    operation.person === person
    && String(operation.date || '') >= CARE_TRACKING_START_DATE
  ));
}

export function careBalanceForPerson(operations = [], person = '') {
  const rows = careRowsFromStart(operations, person);
  const expenses = rows
    .filter((operation) => operation.type === 'fixed' || operation.type === 'variable')
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const reimbursed = rows
    .filter((operation) => operation.type === 'reimbursement')
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  return { person, expenses, reimbursed, balance: Math.max(0, expenses - reimbursed) };
}

export function careBalanceForMonth(operations = [], person = '', monthKey = '') {
  const rows = careRowsFromStart(operations, person);
  const beforeMonth = rows.filter((operation) => String(operation.date || '').slice(0, 7) < monthKey);
  const inMonth = rows.filter((operation) => String(operation.date || '').startsWith(monthKey));

  const previousExpenses = beforeMonth
    .filter((operation) => operation.type === 'fixed' || operation.type === 'variable')
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const previousReimbursements = beforeMonth
    .filter((operation) => operation.type === 'reimbursement')
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const carriedBalance = Math.max(0, previousExpenses - previousReimbursements);

  const expenses = inMonth
    .filter((operation) => operation.type === 'fixed' || operation.type === 'variable')
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const reimbursed = inMonth
    .filter((operation) => operation.type === 'reimbursement')
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const balance = Math.max(0, carriedBalance + expenses - reimbursed);

  return { person, carriedBalance, expenses, reimbursed, balance };
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function careBalances(operations = [], monthKey = currentMonthKey(), people = ['Papa', 'Nonna']) {
  return people.map((person) => careBalanceForMonth(operations, person, monthKey));
}
