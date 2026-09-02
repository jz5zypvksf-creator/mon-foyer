import test from 'node:test';
import assert from 'node:assert/strict';
import {
  operationRequiresStore,
  operationStoreValue,
  replaceOperationById,
} from './operationFormRules.js';

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

test('une modification confirmée remplace immédiatement la bonne ligne de l’historique', () => {
  const original = [
    { id: 'other', label: 'Dépense', amount: 20 },
    { id: 'edited', label: 'Transfert depuis épargne', amount: 100 },
  ];
  const updated = { ...original[1], amount: 125 };

  const result = replaceOperationById(original, 'edited', updated);

  assert.notEqual(result, original);
  assert.equal(result[0], original[0]);
  assert.equal(result[1], updated);
  assert.equal(result[1].amount, 125);
  assert.equal(original[1].amount, 100);
});
