function amount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function isExcludedFromBudget(operation) {
  const label = String(operation?.label || '').trim().toLowerCase();
  return label.startsWith('ajustement belfius')
    || label.startsWith('transfert depuis épargne')
    || label.startsWith('transfert depuis epargne');
}

function summarizeMonth(operations, month) {
  return operations.reduce((summary, operation) => {
    if (!String(operation?.date || '').startsWith(month) || isExcludedFromBudget(operation)) return summary;
    const value = amount(operation.amount);
    if (operation.type === 'income') summary.income += value;
    if (operation.type === 'fixed' || operation.type === 'variable') summary.expenses += value;
    return summary;
  }, { month, income: 0, expenses: 0, surplus: 0 });
}

function previousMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
}

function completedMonthsWithData(operations, selectedMonth, todayMonth) {
  const cutoff = selectedMonth < todayMonth ? selectedMonth : previousMonth(todayMonth);
  return [...new Set(operations
    .map((operation) => String(operation?.date || '').slice(0, 7))
    .filter((month) => /^\d{4}-\d{2}$/.test(month) && month <= cutoff))]
    .sort()
    .slice(-3);
}

function roundDownFive(value) {
  return Math.floor(Math.max(0, value) / 5) * 5;
}

export function analyzeBudget({
  operations = [], selectedMonth, currentDate, forecastBalance = 0,
  scheduledExpenseTotal = 0, remainingFoodBudget = 0, emergencyFundSaved = 0,
} = {}) {
  const todayMonth = String(currentDate || '').slice(0, 7);
  const completedMonths = completedMonthsWithData(operations, selectedMonth, todayMonth);
  const history = completedMonths.map((month) => {
    const summary = summarizeMonth(operations, month);
    return { ...summary, surplus: summary.income - summary.expenses };
  });
  const current = summarizeMonth(operations, selectedMonth);
  current.surplus = current.income - current.expenses;

  const forecastRatio = current.income > 0 ? forecastBalance / current.income : null;
  const status = forecastBalance < 0
    ? { key: 'danger', label: 'Déficit prévisionnel' }
    : forecastRatio !== null && forecastRatio < 0.05
      ? { key: 'warning', label: 'Équilibre fragile' }
      : { key: 'comfortable', label: 'Budget prévisionnel positif' };

  let trend = null;
  if (history.length >= 2) {
    const previous = history.at(-2);
    const latest = history.at(-1);
    const difference = latest.expenses - previous.expenses;
    trend = {
      previousMonth: previous.month, latestMonth: latest.month,
      previousExpenses: previous.expenses, latestExpenses: latest.expenses, difference,
      percent: previous.expenses > 0 ? (difference / previous.expenses) * 100 : null,
    };
  }

  const emergencySaved = amount(emergencyFundSaved);
  let emergency;
  if (emergencySaved > 0) {
    emergency = { key: 'started', saved: emergencySaved, monthlySuggestion: null, reason: 'Le fonds d’urgence est déjà alimenté.' };
  } else if (history.length < 3) {
    emergency = {
      key: 'insufficient-history', saved: 0, monthlySuggestion: null,
      reason: `Le calcul attend 3 mois terminés avec des données. Historique disponible : ${history.length}.`,
    };
  } else {
    const smallestSurplus = Math.min(...history.map((month) => month.surplus));
    const averageIncome = history.reduce((sum, month) => sum + month.income, 0) / history.length;
    const suggestion = smallestSurplus > 0
      ? roundDownFive(Math.min(averageIncome * 0.10, smallestSurplus * 0.25))
      : 0;
    emergency = {
      key: suggestion >= 5 ? 'recommended' : 'not-recommended', saved: 0,
      monthlySuggestion: suggestion >= 5 ? suggestion : null,
      smallestSurplus, averageIncome,
      reason: suggestion >= 5
        ? 'Montant prudent calculé sur les 3 derniers mois terminés.'
        : 'Aucun versement mensuel n’est conseillé tant qu’une marge positive n’est pas constatée durant chacun des 3 derniers mois.',
    };
  }

  return {
    selectedMonth, isCurrentMonth: selectedMonth === todayMonth, status, current,
    forecastBalance: amount(forecastBalance), scheduledExpenseTotal: amount(scheduledExpenseTotal),
    remainingFoodBudget: amount(remainingFoodBudget), history, trend, emergency,
  };
}
