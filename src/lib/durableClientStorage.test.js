import assert from 'node:assert/strict';
import test from 'node:test';
import { createClientPersistence } from './durableClientStorage.js';

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function createMemoryDatabase(initialState = []) {
  const state = new Map(initialState.map((record) => [record.key, structuredClone(record)]));
  const imports = new Map();
  return {
    async getAllState() { return [...state.values()]; },
    async putState(record) { state.set(record.key, structuredClone(record)); },
    async deleteState(key) { state.delete(key); },
    async putImport(record) { imports.set(record.id, structuredClone(record)); },
    async getAllImports() { return [...imports.values()].map((record) => structuredClone(record)); },
  };
}

test('la première hydratation migre les anciennes données locales vers IndexedDB', async () => {
  const storage = createMemoryStorage({
    'mon-foyer-v1': '{"operations":[{"reviewStatus":"dismissed"}]}',
    'unrelated-key': 'ignored',
  });
  const database = createMemoryDatabase();
  const persistence = createClientPersistence({ database, storage });

  const result = await persistence.hydrate();
  assert.equal(result.migrated, 1);
  assert.equal((await database.getAllState()).length, 1);
});

test('IndexedDB restaure les données critiques avant le chargement de l’application', async () => {
  const database = createMemoryDatabase();
  const first = createClientPersistence({ database, storage: createMemoryStorage() });
  first.write('mon-foyer-belfius-confirmations-v1', '[{"bankFingerprint":"stable"}]');
  first.write('mon-foyer-v1', '{"operations":[{"reviewStatus":"dismissed"}]}');
  await first.flush();

  const emptyStorage = createMemoryStorage();
  const restored = createClientPersistence({ database, storage: emptyStorage });
  const result = await restored.hydrate();

  assert.equal(result.restored, 2);
  assert.equal(restored.read('mon-foyer-belfius-confirmations-v1'), '[{"bankFingerprint":"stable"}]');
  assert.equal(JSON.parse(restored.read('mon-foyer-v1')).operations[0].reviewStatus, 'dismissed');
});

test('chaque import Belfius est conservé dans un historique durable', async () => {
  const persistence = createClientPersistence({
    database: createMemoryDatabase(),
    storage: createMemoryStorage(),
  });
  persistence.recordBelfiusImport({ importedAt: '2026-09-24T08:00:00.000Z', fileName: 'belfius-1.csv', rows: [{ amountCents: -35000 }] });
  persistence.recordBelfiusImport({ importedAt: '2026-09-25T08:00:00.000Z', fileName: 'belfius-2.csv', rows: [{ amountCents: -4178 }] });
  await persistence.flush();

  const history = await persistence.listBelfiusImports();
  assert.deepEqual(history.map((entry) => entry.fileName), ['belfius-2.csv', 'belfius-1.csv']);
  assert.equal(history[0].audit.rows[0].amountCents, -4178);
});

test('une panne IndexedDB ne bloque jamais la sauvegarde localStorage', async () => {
  const storage = createMemoryStorage();
  const database = {
    async getAllState() { throw new Error('blocked'); },
    async putState() { throw new Error('blocked'); },
    async deleteState() { throw new Error('blocked'); },
    async putImport() { throw new Error('blocked'); },
    async getAllImports() { throw new Error('blocked'); },
  };
  const persistence = createClientPersistence({ database, storage });
  assert.equal((await persistence.hydrate()).mode, 'localStorage');

  persistence.write('mon-foyer-belfius-audit-v1', '{"rows":[]}');
  await persistence.flush();
  assert.equal(storage.getItem('mon-foyer-belfius-audit-v1'), '{"rows":[]}');
});

test('un CSV local plus récent remplace le vieux snapshot IndexedDB pendant l’hydratation', async () => {
  const key = 'mon-foyer-belfius-audit-v1';
  const oldAudit = JSON.stringify({ importedAt: '2026-09-20T08:00:00.000Z', rows: [{ amountCents: -4178 }] });
  const freshAudit = JSON.stringify({ importedAt: '2026-09-24T10:00:00.000Z', rows: [{ amountCents: -65197 }] });
  const storage = createMemoryStorage({ [key]: freshAudit });
  const database = createMemoryDatabase([{
    key,
    value: oldAudit,
    updatedAt: '2026-09-20T08:00:01.000Z',
  }]);
  const persistence = createClientPersistence({
    database,
    storage,
    now: () => '2026-09-24T10:00:01.000Z',
  });

  const result = await persistence.hydrate();

  assert.equal(result.preserved, 1);
  assert.equal(persistence.read(key), freshAudit);
  assert.equal((await database.getAllState())[0].value, freshAudit);
});

test('les écritures d’une même clé restent ordonnées afin que le dernier import gagne', async () => {
  const values = new Map();
  const database = {
    async getAllState() { return []; },
    async putState(record) {
      if (record.value === 'ancien') await new Promise((resolve) => setTimeout(resolve, 10));
      values.set(record.key, structuredClone(record));
    },
    async deleteState(key) { values.delete(key); },
    async putImport() {},
    async getAllImports() { return []; },
  };
  const timestamps = ['2026-09-24T10:00:00.000Z', '2026-09-24T10:00:01.000Z'];
  const persistence = createClientPersistence({
    database,
    storage: createMemoryStorage(),
    now: () => timestamps.shift(),
  });

  persistence.write('mon-foyer-belfius-audit-v1', 'ancien');
  persistence.write('mon-foyer-belfius-audit-v1', 'nouveau');
  await persistence.flush();

  assert.equal(values.get('mon-foyer-belfius-audit-v1').value, 'nouveau');
});
