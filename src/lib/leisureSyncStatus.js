import { isRetryableSyncError } from './syncOutbox.js';

export const LOCAL_LEISURE_STATUS =
  'Données locales affichées · synchronisation automatique au retour d’Internet.';

export function leisureSyncFailureMessage(error, fallbackLabel) {
  if (isRetryableSyncError(error)) return LOCAL_LEISURE_STATUS;
  const detail = String(error?.message || 'erreur inconnue');
  return fallbackLabel + ' : ' + detail;
}
