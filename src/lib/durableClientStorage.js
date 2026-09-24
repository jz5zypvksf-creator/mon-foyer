const DATABASE_NAME = 'mon-foyer-client-v1';
const DATABASE_VERSION = 1;
const STATE_STORE = 'state';
const IMPORT_STORE = 'belfius-imports';
const DURABLE_KEY_PREFIX = 'mon-foyer-';

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB indisponible'));
  });
}

export function createIndexedDbBackend(indexedDb = globalThis.indexedDB) {
  if (!indexedDb?.open) return null;
  let databasePromise;

  const open = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STATE_STORE)) {
          database.createObjectStore(STATE_STORE, { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains(IMPORT_STORE)) {
          database.createObjectStore(IMPORT_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Ouverture IndexedDB impossible'));
      request.onblocked = () => reject(new Error('Mise à niveau IndexedDB bloquée'));
    });
    return databasePromise;
  };

  const store = async (name, mode = 'readonly') => {
    const database = await open();
    return database.transaction(name, mode).objectStore(name);
  };

  return {
    async getAllState() {
      return requestValue((await store(STATE_STORE)).getAll());
    },
    async putState(record) {
      await requestValue((await store(STATE_STORE, 'readwrite')).put(record));
    },
    async deleteState(key) {
      await requestValue((await store(STATE_STORE, 'readwrite')).delete(key));
    },
    async putImport(record) {
      await requestValue((await store(IMPORT_STORE, 'readwrite')).put(record));
    },
    async getAllImports() {
      return requestValue((await store(IMPORT_STORE)).getAll());
    },
  };
}

function durableEntries(storage) {
  const entries = [];
  if (!storage) return entries;
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(DURABLE_KEY_PREFIX)) entries.push([key, storage.getItem(key)]);
    }
  } catch {
    // Le cache mémoire et IndexedDB restent utilisables si localStorage est refusé.
  }
  return entries;
}

export function createClientPersistence({
  database = createIndexedDbBackend(),
  storage = globalThis.localStorage,
} = {}) {
  const memory = new Map();
  const pendingWrites = new Set();

  const enqueue = (promise) => {
    if (!promise?.then) return;
    const guarded = Promise.resolve(promise).catch(() => undefined);
    pendingWrites.add(guarded);
    guarded.finally(() => pendingWrites.delete(guarded));
  };

  const writeLocal = (key, value) => {
    try {
      storage?.setItem(key, value);
      memory.delete(key);
    } catch {
      memory.set(key, value);
    }
  };

  return {
    async hydrate() {
      if (!database) {
        return { mode: 'localStorage', restored: 0 };
      }
      try {
        const records = await database.getAllState();
        const indexedKeys = new Set();
        records.forEach(({ key, value }) => {
          if (!key?.startsWith(DURABLE_KEY_PREFIX) || typeof value !== 'string') return;
          indexedKeys.add(key);
          writeLocal(key, value);
        });

        let migrated = 0;
        durableEntries(storage).forEach(([key, value]) => {
          if (!indexedKeys.has(key) && typeof value === 'string') {
            migrated += 1;
            enqueue(database.putState({ key, value, updatedAt: new Date().toISOString() }));
          }
        });
        await this.flush();
        return { mode: 'indexedDB', restored: records.length, migrated };
      } catch {
        return { mode: 'localStorage', restored: 0 };
      }
    },

    read(key) {
      try {
        const value = storage?.getItem(key) ?? null;
        return value === null && memory.has(key) ? memory.get(key) : value;
      } catch {
        return memory.get(key) ?? null;
      }
    },

    write(key, value) {
      const serialized = String(value);
      writeLocal(key, serialized);
      if (database) {
        enqueue(database.putState({ key, value: serialized, updatedAt: new Date().toISOString() }));
      }
      return serialized;
    },

    remove(key) {
      memory.delete(key);
      try { storage?.removeItem(key); } catch { /* IndexedDB reste supprimable. */ }
      if (database) enqueue(database.deleteState(key));
    },

    recordBelfiusImport(audit) {
      if (!audit || !database) return;
      const importedAt = String(audit.importedAt || new Date().toISOString());
      const fileName = String(audit.fileName || 'Export Belfius.csv');
      enqueue(database.putImport({
        id: `${importedAt}|${fileName}`,
        importedAt,
        fileName,
        audit,
      }));
    },

    async listBelfiusImports() {
      if (!database) return [];
      try {
        const imports = await database.getAllImports();
        return imports.sort((left, right) => String(right.importedAt).localeCompare(String(left.importedAt)));
      } catch {
        return [];
      }
    },

    async flush() {
      await Promise.all([...pendingWrites]);
    },
  };
}

const clientPersistence = createClientPersistence();

export function hydrateDurableClientState() {
  const persistenceRequest = globalThis.navigator?.storage?.persist?.();
  if (persistenceRequest?.catch) persistenceRequest.catch(() => undefined);
  return clientPersistence.hydrate();
}

export function readDurableLocalValue(key) {
  return clientPersistence.read(key);
}

export function persistDurableLocalValue(key, value) {
  return clientPersistence.write(key, value);
}

export function removeDurableLocalValue(key) {
  clientPersistence.remove(key);
}

export function recordDurableBelfiusImport(audit) {
  clientPersistence.recordBelfiusImport(audit);
}

export function listDurableBelfiusImports() {
  return clientPersistence.listBelfiusImports();
}

export function flushDurableClientWrites() {
  return clientPersistence.flush();
}
