import {
  readDurableLocalValue,
  persistDurableLocalValue,
  recordDurableBelfiusImport,
  removeDurableLocalValue,
} from './durableClientStorage.js';

const AUDIT_STORAGE_KEY = 'mon-foyer-belfius-audit-v1';
const SNAPSHOT_STORAGE_KEY = 'mon-foyer-belfius-snapshot-v1';

export function loadPersistedAudit() {
  try {
    const parsed = JSON.parse(readDurableLocalValue(AUDIT_STORAGE_KEY) || 'null');
    return Array.isArray(parsed?.rows) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistAudit(audit) {
  try {
    if (audit) {
      persistDurableLocalValue(AUDIT_STORAGE_KEY, JSON.stringify(audit));
      recordDurableBelfiusImport(audit);
    } else removeDurableLocalValue(AUDIT_STORAGE_KEY);
  } catch {
    // A storage failure must not block the current import.
  }
}

export function loadPersistedBelfiusSnapshot() {
  try {
    const parsed = JSON.parse(readDurableLocalValue(SNAPSHOT_STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function persistBelfiusSnapshotLocally(snapshot) {
  try {
    if (snapshot) persistDurableLocalValue(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    else removeDurableLocalValue(SNAPSHOT_STORAGE_KEY);
  } catch {
    // La synchronisation distante et l'état en mémoire restent opérationnels.
  }
}
