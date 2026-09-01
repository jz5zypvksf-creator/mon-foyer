import test from 'node:test';
import assert from 'node:assert/strict';
import { accountingNature, isBudgetExpense } from './accountingClassification.js';

test('un transfert Belfius vers épargne ne devient jamais une dépense', () => {
  assert.equal(accountingNature({ type: 'savings_transfer', savingsDirection: 'in' }), 'internal_transfer');
  assert.equal(accountingNature({ type: 'fixed', label: 'Épargne pension Alain' }), 'internal_transfer');
  assert.equal(isBudgetExpense({ type: 'fixed', label: 'Épargne loisirs' }), false);
});

test('un retrait d’épargne est une ressource de trésorerie, pas un revenu', () => {
  assert.equal(accountingNature({ type: 'income', savingsDirection: 'out' }), 'savings_withdrawal');
});

test('les remboursements, achats Mastercard et dépenses restent distincts', () => {
  assert.equal(accountingNature({ type: 'reimbursement' }), 'reimbursement');
  assert.equal(accountingNature({ type: 'variable', paymentMethod: 'Mastercard •••• 4397' }), 'card_purchase');
  assert.equal(accountingNature({ type: 'variable', paymentMethod: 'Compte Belfius' }), 'expense');
});
