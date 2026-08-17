import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_TABLES,
  createBackupEnvelope,
  parseBackup,
  rowsForCurrentHousehold,
} from './backupRules.js';

function emptyTables() {
  return Object.fromEntries(BACKUP_TABLES.map(({ name }) => [name, []]));
}

test('une sauvegarde intacte est acceptée et comptée', async () => {
  const payload = {
    createdAt: '2026-08-17T12:00:00.000Z',
    householdId: 'foyer-a',
    tables: { ...emptyTables(), operations: [{ id: 'op-1', household_id: 'foyer-a' }] },
  };
  const envelope = await createBackupEnvelope(payload);
  const parsed = await parseBackup(JSON.stringify(envelope), 'foyer-a');

  assert.equal(parsed.counts.operations, 1);
  assert.equal(parsed.counts.leisure_expenses, 0);
});

test('une sauvegarde altérée est refusée', async () => {
  const payload = {
    createdAt: '2026-08-17T12:00:00.000Z',
    householdId: 'foyer-a',
    tables: emptyTables(),
  };
  const envelope = await createBackupEnvelope(payload);
  envelope.payload.tables.messages.push({ id: 'message-ajoute-apres-signature' });

  await assert.rejects(
    parseBackup(JSON.stringify(envelope), 'foyer-a'),
    /modifié ou endommagé/,
  );
});

test('une sauvegarde d’un autre foyer est refusée', async () => {
  const envelope = await createBackupEnvelope({
    createdAt: '2026-08-17T12:00:00.000Z',
    householdId: 'foyer-b',
    tables: emptyTables(),
  });

  await assert.rejects(
    parseBackup(JSON.stringify(envelope), 'foyer-a'),
    /autre foyer/,
  );
});

test('la restauration force toujours le foyer connecté', () => {
  assert.deepEqual(
    rowsForCurrentHousehold([{ id: 'op-1', household_id: 'foyer-injecte' }], 'foyer-a'),
    [{ id: 'op-1', household_id: 'foyer-a' }],
  );
});
