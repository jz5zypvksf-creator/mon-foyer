function amount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function signedOperationAmount(operation) {
  const value = amount(operation?.amount);
  return operation?.type === 'income' ? value : -value;
}

export function calculateBankAuditSummary({
  bankBalance = 0,
  pendingRows = [],
  missingBankRows = [],
  reviewRows = [],
} = {}) {
  const pendingAmount = pendingRows.reduce(
    (sum, row) => sum + signedOperationAmount(row),
    0,
  );
  const unexplainedAmount = [
    ...missingBankRows,
    ...reviewRows.map((item) => item?.bank || item),
  ].reduce((sum, row) => sum + amount(row?.amount), 0);

  return {
    bankBalance: amount(bankBalance),
    pendingAmount,
    expectedBankBalance: amount(bankBalance) + pendingAmount,
    unexplainedAmount,
  };
}

export function calculateScheduledTotal(rows = []) {
  return rows.reduce((sum, row) => sum + amount(row?.amount ?? row), 0);
}

export function calculateEndOfMonthForecast(currentBudgetBalance, scheduledRows = []) {
  return amount(currentBudgetBalance) - calculateScheduledTotal(scheduledRows);
}
