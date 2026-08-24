import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recurringRecognitionPresentation,
  recurringStructuredCommunication,
  sortedBeneficiaryOptions,
} from './recurringExpenseRules.js';

test('les bénéficiaires sont uniques et classés alphabétiquement', () => {
  assert.deepEqual(
    sortedBeneficiaryOptions(['Colruyt', 'aldi', 'Delhaize', ' Aldi ', '', 'Colruyt']),
    ['aldi', 'Colruyt', 'Delhaize'],
  );
});

test('un frais Mastercard reçoit une règle de reconnaissance dédiée', () => {
  const copy = recurringRecognitionPresentation('Mastercard Platinum •••• 4397');
  assert.match(copy.legend, /Mastercard/);
  assert.match(copy.fieldLabel, /relevé Mastercard/);
  assert.match(copy.hint, /prélèvement Belfius suivant/);
});

test('la communication structurée Belfius est neutralisée pour Mastercard', () => {
  assert.equal(recurringStructuredCommunication('Mastercard Platinum •••• 4397', '+++123/4567/89012+++'), '');
  assert.equal(recurringStructuredCommunication('Compte Belfius', ' +++123/4567/89012+++ '), '+++123/4567/89012+++');
});
