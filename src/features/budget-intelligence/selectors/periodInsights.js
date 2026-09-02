const PERIOD_MONTHS = Object.freeze({ monthly: 1, quarterly: 3, semiannual: 6 });

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function certifiedPeriods(analysis, requestedMonths) {
  const history = Array.isArray(analysis.history) ? analysis.history : [];
  const current = analysis.current?.month
    ? analysis.current
    : { ...analysis.current, month: analysis.selectedMonth };
  return [...history, current].filter((period) => period?.month).slice(-requestedMonths);
}

export function selectPeriodInsights(certifiedData, period = 'monthly') {
  const requestedMonths = PERIOD_MONTHS[period] || PERIOD_MONTHS.monthly;
  const analysis = certifiedData.budgetAnalysis;
  const periods = certifiedPeriods(analysis, requestedMonths);
  const latest = periods.at(-1) || {};
  const first = periods.at(0) || {};
  const latestExpenses = safeNumber(latest.expenses);
  const firstExpenses = safeNumber(first.expenses);
  const expenseChange = periods.length > 1 ? latestExpenses - firstExpenses : null;

  return Object.freeze({
    period,
    requestedMonths,
    availableMonths: periods.length,
    complete: periods.length >= requestedMonths,
    monthKeys: Object.freeze(periods.map((item) => item.month)),
    latestMonth: latest.month || analysis.selectedMonth || '',
    latestExpenses,
    latestIncome: safeNumber(latest.assignedIncome ?? latest.income),
    latestBalance: safeNumber(latest.surplus ?? analysis.forecastBalance),
    expenseChange,
    forecastBalance: safeNumber(analysis.forecastBalance),
    status: analysis.status || {},
    anomalyCount: safeNumber(certifiedData.anomalySummary.total),
    auditStatus: certifiedData.monthlyAudit?.status || 'pending',
  });
}
