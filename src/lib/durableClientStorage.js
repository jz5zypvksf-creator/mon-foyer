const DATABASE_NAME = 'mon-foyer-client-v1';
const DATABASE_VERSION = 1;
const STATE_STORE = 'state';
const IMPORT_STORE = 'belfius-imports';
const DURABLE_KEY_PREFIX = 'mon-foyer-';
const LOCAL_REVISIONS_KEY = '__mon-foyer-durable-revisions-v1';

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

function parseTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function valueTimestamp(key, value) {
  try {
    const parsed = JSON.parse(value);
    if (key === 'mon-foyer-belfius-audit-v1' || key === 'mon-foyer-belfius-snapshot-v1') {
      return parseTimestamp(parsed?.importedAt);
    }
    if (key === 'mon-foyer-belfius-confirmations-v1' && Array.isArray(parsed)) {
      return parsed.reduce(
        (latest, confirmation) => Math.max(latest, parseTimestamp(confirmation?.confirmedAt)),
        Number.NEGATIVE_INFINITY,
      );
    }
  } catch {
    // Les valeurs non JSON utilisent uniquement la révision technique locale.
  }
  return Number.NEGATIVE_INFINITY;
}

function readLocalRevisions(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(LOCAL_REVISIONS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalRevisions(storage, revisions) {
  try {
    storage?.setItem(LOCAL_REVISIONS_KEY, JSON.stringify(revisions));
  } catch {
    // IndexedDB et le cache mémoire restent disponibles si localStorage est plein.
  }
}

export function createClientPersistence({
  database = createIndexedDbBackend(),
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
} = {}) {
  const memory = new Map();
  const pendingWrites = new Set();
  const stateWriteChains = new Map();
  const localRevisions = readLocalRevisions(storage);

  const enqueue = (promise) => {
    if (!promise?.then) return;
    const guarded = Promise.resolve(promise).catch(() => undefined);
    pendingWrites.add(guarded);
    guarded.finally(() => pendingWrites.delete(guarded));
  };

  const writeLocal = (key, value, updatedAt = now()) => {
    try {
      storage?.setItem(key, value);
      localRevisions[key] = updatedAt;
      writeLocalRevisions(storage, localRevisions);
      memory.delete(key);
    } catch {
      memory.set(key, value);
    }
  };

  const enqueueStateMutation = (key, mutation) => {
    if (!database) return;
    const previous = stateWriteChains.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(mutation);
    stateWriteChains.set(key, next);
    enqueue(next.finally(() => {
      if (stateWriteChains.get(key) === next) stateWriteChains.delete(key);
    }));
  };

  return {
    async hydrate() {
      if (!database) {
        return { mode: 'localStorage', restored: 0 };
      }
      try {
        const records = await database.getAllState();
        const localEntries = new Map(durableEntries(storage));
        const indexedKeys = new Set();
        let restored = 0;
        let preserved = 0;

        records.forEach(({ key, value, updatedAt }) => {
          if (!key?.startsWith(DURABLE_KEY_PREFIX) || typeof value !== 'string') return;
          indexedKeys.add(key);
          const localValue = localEntries.get(key);
          if (typeof localValue !== 'string') {
            writeLocal(key, value, updatedAt || now());
            restored += 1;
            return;
          }
          if (localValue === value) {
            const latestRevision = parseTimestamp(localRevisions[key]) >= parseTimestamp(updatedAt)
              ? localRevisions[key]
              : updatedAt;
            if (latestRevision) {
              localRevisions[key] = latestRevision;
              writeLocalRevisions(storage, localRevisions);
            }
            return;
          }

          const localBusinessTime = valueTimestamp(key, localValue);
          const indexedBusinessTime = valueTimestamp(key, value);
          const hasComparableBusinessTimes = Number.isFinite(localBusinessTime)
            && Number.isFinite(indexedBusinessTime);
          const localTime = hasComparableBusinessTimes
            ? localBusinessTime
            : parseTimestamp(localRevisions[key]);
          const indexedTime = hasComparableBusinessTimes
            ? indexedBusinessTime
            : parseTimestamp(updatedAt);

          // Une valeur locale différente sans révision est une écriture antérieure à
          // l'introduction des métadonnées. Elle reste prioritaire afin qu'un CSV
          // réellement importé ne soit jamais remplacé par un ancien snapshot.
          if (indexedTime > localTime && Number.isFinite(localTime)) {
            writeLocal(key, value, updatedAt || now());
            restored += 1;
            return;
          }

          const localUpdatedAt = localRevisions[key] || now();
          writeLocal(key, localValue, localUpdatedAt);
          enqueueStateMutation(key, () => database.putState({
            key,
            value: localValue,
            updatedAt: localUpdatedAt,
          }));
          preserved += 1;
        });

        let migrated = 0;
        localEntries.forEach((value, key) => {
          if (!indexedKeys.has(key) && typeof value === 'string') {
            migrated += 1;
            const updatedAt = localRevisions[key] || now();
            writeLocal(key, value, updatedAt);
            enqueueStateMutation(key, () => database.putState({ key, value, updatedAt }));
          }
        });
        await this.flush();
        return { mode: 'indexedDB', restored, migrated, preserved };
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
      const updatedAt = now();
      writeLocal(key, serialized, updatedAt);
      enqueueStateMutation(key, () => database.putState({ key, value: serialized, updatedAt }));
      return serialized;
    },

    remove(key) {
      memory.delete(key);
      delete localRevisions[key];
      try { storage?.removeItem(key); } catch { /* IndexedDB reste supprimable. */ }
      writeLocalRevisions(storage, localRevisions);
      enqueueStateMutation(key, () => database.deleteState(key));
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
