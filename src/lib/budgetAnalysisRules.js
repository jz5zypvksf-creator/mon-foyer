import { ACCOUNTING_NATURES, accountingNature } from './accountingClassification.js';

function amount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function isExcludedFromBudget(operation) {
  const label = String(operation?.label || '').trim().toLowerCase();
  return label.startsWith('ajustement belfius');
}

function previousMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
}

function isSalary(operation) {
  return operation?.incomeKind === 'salary'
    || operation?.income_kind === 'salary'
    || String(operation?.label || '').toLowerCase().includes('salaire');
}

function assignedBudgetMonth(operation) {
  return operation?.budgetMonth || operation?.budget_month || '';
}

function expenseBudgetMonth(operation) {
  return assignedBudgetMonth(operation) || String(operation?.date || '').slice(0, 7);
}

function summarizeBudgetMonth(operations, month, throughDate = '', useOpeningBalance = false) {
  const salaryMonth = previousMonth(month);
  return operations.reduce((summary, operation) => {
    if (isExcludedFromBudget(operation)) return summary;
    const date = String(operation?.date || '');
    const value = amount(operation.amount);
    const isWithinCutoff = !throughDate || date <= throughDate;

    // Les salaires reçus en fin de mois financent le mois suivant. Ils sont donc
    // exclus de leur mois bancaire et rattachés une seule fois au mois budgétaire suivant.
    const nature = accountingNature(operation);
    if (nature === ACCOUNTING_NATURES.SAVINGS_WITHDRAWAL && expenseBudgetMonth(operation) === month && isWithinCutoff) {
      summary.savingsFunding += value;
    } else if (nature === ACCOUNTING_NATURES.INCOME) {
      const assignedMonth = assignedBudgetMonth(operation);
      if (!useOpeningBalance && assignedMonth === month) summary.income += value;
      else if (!useOpeningBalance && !assignedMonth && date.startsWith(salaryMonth) && isSalary(operation)) summary.income += value;
      else if (date.startsWith(month) && !isSalary(operation) && isWithinCutoff) summary.income += value;

      if (assignedMonth === month) summary.assignedIncome += value;
      else if (!assignedMonth && ((date.startsWith(salaryMonth) && isSalary(operation)) || (date.startsWith(month) && !isSalary(operation)))) summary.assignedIncome += value;
    }
    if (expenseBudgetMonth(operation) === month && isWithinCutoff) {
      if (nature === ACCOUNTING_NATURES.REIMBURSEMENT) summary.reimbursements += value;
      if (nature === ACCOUNTING_NATURES.INTERNAL_TRANSFER) summary.savingsTransfers += value;
      if (nature === ACCOUNTING_NATURES.EXPENSE || nature === ACCOUNTING_NATURES.CARD_PURCHASE) summary.expenses += value;
    }
    return summary;
  }, { month, income: 0, assignedIncome: 0, reimbursements: 0, savingsFunding: 0, savingsTransfers: 0, expenses: 0, surplus: 0 });
}

function completedMonthsWithData(operations, selectedMonth, todayMonth) {
  const cutoff = selectedMonth < todayMonth ? selectedMonth : previousMonth(todayMonth);
  return [...new Set(operations
    .map((operation) => expenseBudgetMonth(operation))
    .filter((month) => /^\d{4}-\d{2}$/.test(month) && month <= cutoff))]
    .sort()
    .slice(-3);
}

function roundDownFive(value) {
  return Math.floor(Math.max(0, value) / 5) * 5;
}

export function analyzeBudget({
  operations = [], selectedMonth, currentDate,
  scheduledExpenseTotal = 0, scheduledSavingsTransferTotal = 0, remainingFoodBudget = 0, emergencyFundSaved = 0,
  openingBalance = null,
} = {}) {
  const todayMonth = String(currentDate || '').slice(0, 7);
  const completedMonths = completedMonthsWithData(operations, selectedMonth, todayMonth);
  const history = completedMonths.map((month) => {
    const summary = summarizeBudgetMonth(operations, month);
    return { ...summary, surplus: summary.income - summary.expenses };
  });
  const currentCutoff = selectedMonth === todayMonth ? String(currentDate || '') : '';
  const hasOpeningBalance = openingBalance !== null && Number.isFinite(Number(openingBalance));
  const current = summarizeBudgetMonth(operations, selectedMonth, currentCutoff, hasOpeningBalance);
  current.openingBalance = hasOpeningBalance ? amount(openingBalance) : 0;
  current.resources = current.openingBalance + current.income + current.reimbursements;
  current.cashResources = current.resources + current.savingsFunding;
  current.surplus = current.resources - current.expenses;
  current.cashAfterSavings = current.surplus + current.savingsFunding - current.savingsTransfers;

  const calculatedForecastBalance = current.surplus - amount(scheduledExpenseTotal);
  const cashForecastBalance = calculatedForecastBalance + current.savingsFunding
    - current.savingsTransfers - amount(scheduledSavingsTransferTotal);

  const forecastRatio = current.income > 0 ? calculatedForecastBalance / current.income : null;
  const status = calculatedForecastBalance < 0
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
    forecastBalance: calculatedForecastBalance, scheduledExpenseTotal: amount(scheduledExpenseTotal),
    scheduledSavingsTransferTotal: amount(scheduledSavingsTransferTotal), cashForecastBalance,
    remainingFoodBudget: amount(remainingFoodBudget), history, trend, emergency,
  };
}
