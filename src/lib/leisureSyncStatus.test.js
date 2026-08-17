import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_LEISURE_STATUS,
  leisureSyncFailureMessage,
} from './leisureSyncStatus.js';

test('une absence de réseau affiche un message local compréhensible', () => {
  assert.equal(
    leisureSyncFailureMessage({ message: 'TypeError: Load failed' }, 'Chargement impossible'),
    LOCAL_LEISURE_STATUS,
  );
});

test('une erreur de données Supabase reste visible pour diagnostic', () => {
  assert.equal(
    leisureSyncFailureMessage({ message: 'duplicate key value' }, 'Synchronisation impossible'),
    'Synchronisation impossible : duplicate key value',
  );
});
