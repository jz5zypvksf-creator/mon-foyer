import test from 'node:test';
import assert from 'node:assert/strict';
import { findPotentialOperationDuplicate } from './operationDuplicateRules.js';

const recorded = {
  id: 'old', date: '2026-08-24', amount: 24.79, type: 'variable',
  person: 'Foyer', category: 'nourriture', store: 'Delhaize Liège',
  label: 'Courses Delhaize', paymentMethod: 'Compte Belfius',
};

test('détecte un doublon exact avant son enregistrement', () => {
  const duplicate = findPotentialOperationDuplicate({ ...recorded, id: 'new' }, [recorded]);
  assert.equal(duplicate.confidence, 'exact');
  assert.equal(duplicate.operation.id, 'old');
});

test('détecte un doublon probable par bénéficiaire, date et montant', () => {
  const candidate = { ...recorded, id: 'new', label: 'Achat nourriture' };
  const duplicate = findPotentialOperationDuplicate(candidate, [recorded]);
  assert.equal(duplicate.confidence, 'probable');
});

test('autorise deux montants ou bénéficiaires différents', () => {
  assert.equal(findPotentialOperationDuplicate({ ...recorded, amount: 24.80 }, [recorded]), null);
  assert.equal(findPotentialOperationDuplicate({ ...recorded, store: 'Colruyt', label: 'Colruyt' }, [recorded]), null);
});

test('ignore la ligne en cours de modification', () => {
  assert.equal(findPotentialOperationDuplicate(recorded, [recorded], 'old'), null);
});

