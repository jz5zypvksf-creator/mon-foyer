const amount = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export const isCreditOperation = (operation) => (
  operation?.type === 'income' || operation?.type === 'reimbursement'
);

export const signedPaymentAmount = (operation) => {
  const value = amount(operation?.amount);
  return isCreditOperation(operation) ? value : -value;
};

export function calculatePaymentMethodBalances(
  operations = [],
  methods = [],
  throughDate = '',
) {
  const balances = Object.fromEntries(methods.map((method) => [method, 0]));
  operations.forEach((operation) => {
    if (throughDate && String(operation?.date || '') > throughDate) return;
    const method = operation?.paymentMethod || operation?.payment_method || 'Compte Belfius';
    if (!Object.hasOwn(balances, method)) return;
    balances[method] += signedPaymentAmount(operation);
  });
  return balances;
}

export function capturePaymentOperationState(
  operations = [],
  paymentMethod = 'Compte Belfius',
  throughDate = '',
) {
  return operations.reduce((state, operation) => {
    const method = operation?.paymentMethod || operation?.payment_method || 'Compte Belfius';
    const id = String(operation?.id || '');
    const date = String(operation?.date || '');
    if (!id || method !== paymentMethod || (throughDate && date > throughDate)) return state;
    state[id] = {
      amount: signedPaymentAmount(operation),
      date,
      paymentMethod: method,
    };
    return state;
  }, {});
}

const stateTotal = (state = {}) => Object.values(state || {})
  .reduce((sum, entry) => sum + amount(entry?.amount ?? entry), 0);

export function calculateLiveBankSnapshot(snapshot, operations = [], throughDate = '') {
  if (!snapshot) return null;
  const baseline = snapshot.operationState || snapshot.operation_state || {};
  const current = capturePaymentOperationState(operations, 'Compte Belfius', throughDate);
  const movementDelta = stateTotal(current) - stateTotal(baseline);
  const pendingAmount = amount(snapshot.pendingAmount ?? snapshot.pending_amount) + movementDelta;
  const balance = amount(snapshot.balance);
  return {
    ...snapshot,
    pendingAmount,
    expectedBalance: balance + pendingAmount,
    movementDelta,
    operationState: baseline,
  };
}

export function savingsEffect(operation) {
  const goalId = operation?.savingsGoalId || operation?.savings_goal_id || '';
  const direction = operation?.savingsDirection || operation?.savings_direction || '';
  if (!goalId || !['in', 'out'].includes(direction)) return null;
  return {
    goalId,
    amount: direction === 'in' ? amount(operation.amount) : -amount(operation.amount),
  };
}

export function applySavingsOperationChange(goals = [], previousOperation, nextOperation) {
  const changes = new Map();
  const previous = savingsEffect(previousOperation);
  const next = savingsEffect(nextOperation);
  if (previous) changes.set(previous.goalId, (changes.get(previous.goalId) || 0) - previous.amount);
  if (next) changes.set(next.goalId, (changes.get(next.goalId) || 0) + next.amount);
  if (!changes.size) return goals;
  return goals.map((goal) => {
    const delta = changes.get(goal.id) || 0;
    return delta ? { ...goal, saved: Number(goal.saved || 0) + delta } : goal;
  });
}

export function matchesRecordedSavingsDeposit(operation, transfer, goalBucket = '') {
  const direction = operation?.savingsDirection || operation?.savings_direction || '';
  if (direction !== 'in' || !goalBucket || goalBucket !== transfer?.bucket) return false;
  if (String(operation?.date || '') !== String(transfer?.date || '')) return false;
  return Math.abs(amount(operation?.amount) - Math.abs(amount(transfer?.amount))) < 0.005;
}
