export const LEISURE_OUTBOX_KEY = 'mon-foyer-leisure-outbox-v1';

export function compactLeisureOutbox(queue = [], mutation) {
  if (!mutation?.recordId || !mutation?.action) return [...queue];
  return [...queue.filter((item) => item.recordId !== mutation.recordId), mutation];
}

export function readLeisureOutbox(storage = globalThis.localStorage) {
  try {
    const rows = JSON.parse(storage?.getItem(LEISURE_OUTBOX_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function writeLeisureOutbox(queue, storage = globalThis.localStorage) {
  storage?.setItem(LEISURE_OUTBOX_KEY, JSON.stringify(queue));
  return queue;
}

export function enqueueLeisureMutation(mutation, storage = globalThis.localStorage) {
  return writeLeisureOutbox(
    compactLeisureOutbox(readLeisureOutbox(storage), mutation),
    storage,
  );
}
