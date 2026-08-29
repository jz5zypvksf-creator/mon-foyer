import test from 'node:test';
import assert from 'node:assert/strict';
import { operationRequiresStore, operationStoreValue } from './operationFormRules.js';

test('un remboursement utilise sa source sans exiger de bénéficiaire ou point de vente', () => {
  assert.equal(operationRequiresStore('reimbursement'), false);
  assert.equal(operationStoreValue('reimbursement', ''), '');
});

test('les dépenses fixes et variables exigent toujours un bénéficiaire ou point de vente', () => {
  assert.equal(operationRequiresStore('fixed'), true);
  assert.equal(operationRequiresStore('variable'), true);
  assert.equal(operationStoreValue('variable', 'Colruyt'), 'Colruyt');
});

test('les mouvements internes et le règlement Mastercard gardent leur règle dédiée', () => {
  assert.equal(operationRequiresStore('income'), false);
  assert.equal(operationRequiresStore('savings_transfer'), false);
  assert.equal(operationRequiresStore('card_settlement'), false);
  assert.equal(operationStoreValue('card_settlement', ''), 'Mastercard');
});
