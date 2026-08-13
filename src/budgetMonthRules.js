// V32.0 RC2.4.6 — lecture budgétaire distincte de la date bancaire.
// Les salaires versés en fin de mois précédent financent le mois suivant,
// sans déplacer ni dupliquer leur écriture bancaire réelle.

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
  const previous = previousMonthKey(monthKey);
  const currentIncome = operations.filter((operation) => operation.type === 'income' && String(operation.date || '').startsWith(monthKey));
  const currentSalaryPersons = new Set(currentIncome.filter(isSalaryIncome).map((operation) => operation.person || 'Foyer'));

  const carriedSalaries = operations.filter((operation) => {
    if (!isSalaryIncome(operation) || !String(operation.date || '').startsWith(previous)) return false;
    const day = Number(String(operation.date || '').slice(8, 10));
    if (day < 24) return false;
    return !currentSalaryPersons.has(operation.person || 'Foyer');
  });

  return [...currentIncome, ...carriedSalaries];
}

export function budgetIncomeTotalForMonth(operations = [], monthKey = '') {
  return budgetIncomeOperationsForMonth(operations, monthKey)
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
}

// Deux repères de trésorerie : la projection issue des écritures Mon Foyer et
// la même projection recalée sur le dernier solde Belfius certifié par le CSV.
export function forecastBalances({ appAvailable = 0, appBelfiusBalance = 0, realBelfiusBalance = null, remainingToCover = 0 } = {}) {
  const appForecast = Number(appAvailable || 0) - Number(remainingToCover || 0);
  if (realBelfiusBalance == null || !Number.isFinite(Number(realBelfiusBalance))) {
    return { appForecast, belfiusForecast: null };
  }
  const bankAdjustedAvailable = Number(appAvailable || 0)
    - Number(appBelfiusBalance || 0)
    + Number(realBelfiusBalance || 0);
  return {
    appForecast,
    belfiusForecast: bankAdjustedAvailable - Number(remainingToCover || 0),
  };
}
