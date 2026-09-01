function number(value) {
  return Number(value) || 0;
}

export function nextMonthKey(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (!year || !monthNumber) return '';
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function incomeReceivedForNextMonth(operations = [], selectedMonth = '') {
  const followingMonth = nextMonthKey(selectedMonth);
  return operations
    .filter((operation) => operation.type === 'income'
      && (operation.budgetMonth || operation.budget_month) === followingMonth
      && String(operation.date || '').slice(0, 7) === selectedMonth)
    .reduce((sum, operation) => sum + number(operation.amount), 0);
}

export function monthlyAccountingPresentation(audit = {}, nextMonthIncome = 0) {
  const source = audit || {};
  const assignedIncome = number(source.assigned_income);
  const reimbursements = number(source.reimbursements);
  const expenses = number(source.expenses);
  const savingsTransfers = number(source.savings_transfers);
  const savingsWithdrawals = number(source.savings_withdrawals);
  const budgetResources = assignedIncome + reimbursements;
  const budgetResult = budgetResources - expenses;

  return {
    assignedIncome,
    reimbursements,
    expenses,
    budgetResources,
    budgetResult,
    savingsTransfers,
    savingsWithdrawals,
    netSavingsEffort: savingsTransfers - savingsWithdrawals,
    cashAfterSavings: budgetResult - savingsTransfers + savingsWithdrawals,
    openingBalance: number(source.opening_balance),
    incomeReceivedDuringMonth: number(source.income),
    nextMonthIncome: number(nextMonthIncome),
    bankBalance: source.bank_balance == null ? null : number(source.bank_balance),
  };
}
