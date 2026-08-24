import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATION_REVIEW_STATUSES,
  normalizeReviewStatus,
  reviewReasonsForOperation,
  reviewStatusLabel,
} from './operationReviewRules.js';

test('une opération vérifiée disparaît des anomalies sans changer ses données', () => {
  const operation = { reviewStatus: 'verified', amount: 2792.50 };
  assert.deepEqual(reviewReasonsForOperation(operation, ['montant élevé']), []);
  assert.equal(operation.amount, 2792.50);
});

test('une contestation reste visible jusqu’à sa résolution', () => {
  assert.deepEqual(
    reviewReasonsForOperation({ reviewStatus: 'disputed' }, ['montant élevé']),
    ['paiement contesté auprès de la banque'],
  );
  assert.deepEqual(reviewReasonsForOperation({ reviewStatus: 'resolved' }, ['montant élevé']), []);
});

test('les statuts inconnus redeviennent à vérifier', () => {
  assert.equal(normalizeReviewStatus('inconnu'), OPERATION_REVIEW_STATUSES.UNREVIEWED);
  assert.equal(reviewStatusLabel('inconnu'), 'À vérifier');
});

