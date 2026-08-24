const amount = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const paymentMethod = (operation) => operation?.paymentMethod || operation?.payment_method || 'Compte Belfius';
const settlementDate = (operation) => operation?.settlementDate || operation?.settlement_date || '';
const budgetMonth = (operation) => operation?.budgetMonth || operation?.budget_month || '';

export function operationAccountingMonth(operation) {
  if (paymentMethod(operation).toLowerCase().includes('mastercard') && settlementDate(operation)) {
    return settlementDate(operation).slice(0, 7);
  }
  return budgetMonth(operation) || String(operation?.date || '').slice(0, 7);
}

export function operationDashboardDate(operation, selectedMonth) {
  const settlement = settlementDate(operation);
  const rawDate = paymentMethod(operation).toLowerCase().includes('mastercard') && settlement
    ? settlement
    : String(operation?.date || '');
  if (rawDate < `${selectedMonth}-01`) return `${selectedMonth}-01`;
  if (rawDate > `${selectedMonth}-31`) return `${selectedMonth}-31`;
  return rawDate;
}

export function buildDailyBudgetSeries({
  operations = [], selectedMonth, openingBalance = 0, throughDate = '', forecastBalance = null,
} = {}) {
  const [year, month] = String(selectedMonth || '').split('-').map(Number);
  if (!year || !month) return [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const cutoff = throughDate?.startsWith(selectedMonth)
    ? Math.min(Number(throughDate.slice(8, 10)) || daysInMonth, daysInMonth)
    : daysInMonth;
  const daily = Array.from({ length: cutoff }, (_, index) => ({
    day: index + 1,
    date: `${selectedMonth}-${String(index + 1).padStart(2, '0')}`,
    income: 0,
    expenses: 0,
  }));

  operations.forEach((operation) => {
    if (operationAccountingMonth(operation) !== selectedMonth) return;
    if (String(operation?.label || '').toLowerCase().startsWith('ajustement belfius')) return;
    const dashboardDate = operationDashboardDate(operation, selectedMonth);
    const day = Math.min(Math.max(Number(dashboardDate.slice(8, 10)) || 1, 1), cutoff);
    const row = daily[day - 1];
    if (!row) return;
    if (operation.type === 'income') row.income += amount(operation.amount);
    if (operation.type === 'fixed' || operation.type === 'variable') row.expenses += amount(operation.amount);
  });

  let resources = amount(openingBalance);
  let expenses = 0;
  const series = daily.map((row) => {
    resources += row.income;
    expenses += row.expenses;
    return {
      ...row,
      cumulativeExpenses: expenses,
      available: resources - expenses,
    };
  });

  if (forecastBalance !== null && series.length && cutoff < daysInMonth) {
    series.push({
      day: daysInMonth,
      date: `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`,
      income: 0,
      expenses: 0,
      cumulativeExpenses: expenses,
      available: amount(forecastBalance),
      projected: true,
    });
  }
  return series;
}

export function mastercardReconciliation(operations = [], selectedMonth = '') {
  const cardPurchases = operations.filter((operation) => (
    paymentMethod(operation).toLowerCase().includes('mastercard')
    && operationAccountingMonth(operation) === selectedMonth
    && (operation.type === 'fixed' || operation.type === 'variable')
  ));
  const purchases = cardPurchases.reduce((sum, operation) => sum + amount(operation.amount), 0);
  const settlements = operations
    .filter((operation) => operation.type === 'card_settlement' && String(operation.date || '').startsWith(selectedMonth))
    .reduce((sum, operation) => sum + amount(operation.amount), 0);
  return {
    purchases,
    settlements,
    difference: settlements - purchases,
    reconciled: purchases === 0 || Math.abs(settlements - purchases) < 0.005,
  };
}

export function buildMonthClosingChecks({
  operations = [], selectedMonth = '', snapshot = null, reviewCount = 0,
  scheduledCount = 0, lastBackupAt = '', now = new Date(),
} = {}) {
  const reconciliation = mastercardReconciliation(operations, selectedMonth);
  const backupTime = Date.parse(lastBackupAt || '');
  const nowTime = now instanceof Date ? now.getTime() : Date.parse(now);
  const backupDays = Number.isFinite(backupTime) && Number.isFinite(nowTime)
    ? Math.max(0, Math.floor((nowTime - backupTime) / 86_400_000))
    : null;
  const csvDate = String(snapshot?.balanceDate || snapshot?.balance_date || '');
  const csvImported = Boolean(snapshot?.balance != null && csvDate);

  return [
    {
      id: 'csv',
      label: 'Dernier relevé Belfius',
      detail: csvImported ? `Importé le ${csvDate}` : 'Aucun relevé CSV disponible',
      status: csvImported ? 'done' : 'warning',
    },
    {
      id: 'mastercard',
      label: 'Ventilation Mastercard',
      detail: reconciliation.purchases === 0
        ? 'Aucun règlement à rapprocher pour ce mois'
        : reconciliation.reconciled
          ? `${reconciliation.purchases.toFixed(2).replace('.', ',')} € entièrement rapprochés`
          : `Écart de ${Math.abs(reconciliation.difference).toFixed(2).replace('.', ',')} € à contrôler`,
      status: reconciliation.reconciled ? 'done' : 'warning',
    },
    {
      id: 'review',
      label: 'Opérations à vérifier',
      detail: reviewCount ? `${reviewCount} écriture(s) demandent un contrôle` : 'Aucune anomalie de saisie détectée',
      status: reviewCount ? 'warning' : 'done',
    },
    {
      id: 'scheduled',
      label: 'Échéances restantes',
      detail: scheduledCount ? `${scheduledCount} dépense(s) encore programmée(s)` : 'Toutes les échéances sont exécutées',
      status: scheduledCount ? 'info' : 'done',
    },
    {
      id: 'backup',
      label: 'Sauvegarde',
      detail: backupDays === null ? 'Aucune sauvegarde enregistrée sur cet appareil' : `Dernière sauvegarde il y a ${backupDays} jour(s)`,
      status: backupDays !== null && backupDays <= 7 ? 'done' : 'warning',
    },
  ];
}
