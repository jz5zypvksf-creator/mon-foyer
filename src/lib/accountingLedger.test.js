import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySavingsOperationChange,
  calculateLiveBankSnapshot,
  calculatePaymentMethodBalances,
  capturePaymentOperationState,
  matchesRecordedSavingsDeposit,
} from './accountingLedger.js';

const closeTo = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) < 0.005, `${actual} != ${expected}`);
};

test('chaque dépense réduit uniquement son moyen de paiement', () => {
  const balances = calculatePaymentMethodBalances([
    { type: 'income', paymentMethod: 'Compte Belfius', amount: 103.75 },
    { type: 'variable', paymentMethod: 'Compte Belfius', amount: 24.79 },
    { type: 'income', paymentMethod: 'Chèques repas Alain', amount: 50 },
    { type: 'variable', paymentMethod: 'Chèques repas Alain', amount: 12.30 },
    { type: 'income', paymentMethod: 'Chèques repas Esther', amount: 40 },
    { type: 'fixed', paymentMethod: 'Chèques repas Esther', amount: 9.25 },
  ], ['Compte Belfius', 'Chèques repas Alain', 'Chèques repas Esther']);

  closeTo(balances['Compte Belfius'], 78.96);
  closeTo(balances['Chèques repas Alain'], 37.70);
  closeTo(balances['Chèques repas Esther'], 30.75);
});

test('un remboursement crédite le moyen de paiement', () => {
  const balances = calculatePaymentMethodBalances([
    { type: 'income', paymentMethod: 'Compte Belfius', amount: 100 },
    { type: 'reimbursement', paymentMethod: 'Compte Belfius', amount: 18.78 },
  ], ['Compte Belfius']);
  closeTo(balances['Compte Belfius'], 118.78);
});

test('le solde Belfius vivant ajoute les mouvements postérieurs au dernier audit', () => {
  const auditedOperations = [
    { id: 'old', date: '2026-08-17', type: 'variable', paymentMethod: 'Compte Belfius', amount: 66.45 },
  ];
  const snapshot = {
    balance: 103.75,
    pendingAmount: -66.45,
    operationState: capturePaymentOperationState(auditedOperations, 'Compte Belfius', '2026-08-17'),
  };
  const live = calculateLiveBankSnapshot(snapshot, [
    ...auditedOperations,
    { id: 'new', date: '2026-08-17', type: 'variable', paymentMethod: 'Compte Belfius', amount: 24.79 },
  ], '2026-08-17');
  closeTo(live.pendingAmount, -91.24);
  closeTo(live.expectedBalance, 12.51);
});

test('modifier ou supprimer une dépense recalcule le solde sans double mouvement', () => {
  const baselineOperation = { id: 'expense', date: '2026-08-17', type: 'variable', paymentMethod: 'Compte Belfius', amount: 20 };
  const snapshot = {
    balance: 80,
    pendingAmount: -20,
    operationState: capturePaymentOperationState([baselineOperation], 'Compte Belfius', '2026-08-17'),
  };
  closeTo(calculateLiveBankSnapshot(snapshot, [{ ...baselineOperation, amount: 25 }], '2026-08-17').expectedBalance, 55);
  closeTo(calculateLiveBankSnapshot(snapshot, [], '2026-08-17').expectedBalance, 80);
});

test('un transfert modifié puis supprimé ajuste exactement l’épargne', () => {
  const goals = [{ id: 'taxes', saved: 500 }];
  const first = { amount: 100, savingsGoalId: 'taxes', savingsDirection: 'out' };
  const edited = { amount: 80, savingsGoalId: 'taxes', savingsDirection: 'out' };
  const afterCreate = applySavingsOperationChange(goals, null, first);
  const afterEdit = applySavingsOperationChange(afterCreate, first, edited);
  const afterDelete = applySavingsOperationChange(afterEdit, edited, null);
  closeTo(afterCreate[0].saved, 400);
  closeTo(afterEdit[0].saved, 420);
  closeTo(afterDelete[0].saved, 500);
});

test('un versement Belfius crédite l’épargne et débite Belfius une seule fois', () => {
  const goals = [{ id: 'urgence', saved: 0 }];
  const transfer = {
    id: 'deposit', date: '2026-08-17', type: 'savings_transfer', amount: 50,
    paymentMethod: 'Compte Belfius', savingsGoalId: 'urgence', savingsDirection: 'in',
  };
  closeTo(applySavingsOperationChange(goals, null, transfer)[0].saved, 50);
  closeTo(calculatePaymentMethodBalances([transfer], ['Compte Belfius'])['Compte Belfius'], -50);
  assert.equal(matchesRecordedSavingsDeposit(transfer, {
    date: '2026-08-17', amount: -50, bucket: 'urgence',
  }, 'urgence'), true);
});
