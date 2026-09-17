const AUDIT_STORAGE_KEY = 'mon-foyer-belfius-audit-v1';

export function loadPersistedAudit() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || 'null');
    return Array.isArray(parsed?.rows) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistAudit(audit) {
  try {
    if (audit) localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(audit));
    else localStorage.removeItem(AUDIT_STORAGE_KEY);
  } catch {
    // A storage failure must not block the current import.
  }
}
