import test from 'node:test';
import assert from 'node:assert/strict';
import { compactLeisureOutbox } from './leisureOutbox.js';

test('la dernière modification Loisirs remplace la précédente', () => {
  const queue = compactLeisureOutbox([
    { recordId: 'expense-a', action: 'upsert', balance: 100 },
  ], { recordId: 'expense-a', action: 'upsert', balance: 80 });
  assert.deepEqual(queue, [{ recordId: 'expense-a', action: 'upsert', balance: 80 }]);
});

test('une mise à jour de solde Beobank reste indépendante des dépenses', () => {
  const queue = compactLeisureOutbox([
    { recordId: 'expense-a', action: 'upsert' },
  ], { recordId: 'balance-goal-a', action: 'balance', balance: 6157.99 });
  assert.equal(queue.length, 2);
});
