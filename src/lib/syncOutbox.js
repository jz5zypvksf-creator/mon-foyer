export const OPERATION_OUTBOX_KEY = 'mon-foyer-operation-outbox-v1';

export function compactOperationOutbox(queue = [], mutation) {
  if (!mutation?.recordId || !mutation?.action) return [...queue];
  return [
    ...queue.filter((item) => item.recordId !== mutation.recordId),
    mutation,
  ];
}

export function readOperationOutbox(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(OPERATION_OUTBOX_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeOperationOutbox(queue, storage = globalThis.localStorage) {
  storage?.setItem(OPERATION_OUTBOX_KEY, JSON.stringify(queue));
  return queue;
}

export function enqueueOperationMutation(mutation, storage = globalThis.localStorage) {
  return writeOperationOutbox(
    compactOperationOutbox(readOperationOutbox(storage), mutation),
    storage,
  );
}

export function isRetryableSyncError(error) {
  const message = String(error?.message || '').toLowerCase();
  const isOffline = typeof globalThis.navigator !== 'undefined'
    && globalThis.navigator.onLine === false;
  return isOffline
    || message.includes('failed to fetch')
    || message.includes('load failed')
    || message.includes('network')
    || message.includes('timeout');
}
