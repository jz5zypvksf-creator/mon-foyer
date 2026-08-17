import test from 'node:test';
import assert from 'node:assert/strict';
import { compactOperationOutbox, isRetryableSyncError } from './syncOutbox.js';

test('une nouvelle mutation remplace l’ancienne pour la même opération', () => {
  const queue = compactOperationOutbox([
    { recordId: 'a', action: 'upsert', payload: { amount: 10 } },
    { recordId: 'b', action: 'upsert', payload: { amount: 20 } },
  ], { recordId: 'a', action: 'upsert', payload: { amount: 15 } });

  assert.equal(queue.length, 2);
  assert.deepEqual(queue.find((item) => item.recordId === 'a').payload, { amount: 15 });
});

test('une suppression hors connexion remplace l’envoi en attente', () => {
  const queue = compactOperationOutbox([
    { recordId: 'a', action: 'upsert', payload: { amount: 10 } },
  ], { recordId: 'a', action: 'delete' });

  assert.deepEqual(queue, [{ recordId: 'a', action: 'delete' }]);
});

test('les erreurs réseau ordinateur et téléphone sont réessayables', () => {
  assert.equal(isRetryableSyncError({ message: 'Failed to fetch' }), true);
  assert.equal(isRetryableSyncError({ message: 'Load failed' }), true);
  assert.equal(isRetryableSyncError({ message: 'Network request timed out' }), true);
  assert.equal(isRetryableSyncError({ message: 'duplicate key value' }), false);
});
