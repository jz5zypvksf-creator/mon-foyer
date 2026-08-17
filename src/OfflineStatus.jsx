import { useEffect, useRef, useState } from 'react';
import './OfflineStatus.css';

export default function OfflineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [restored, setRestored] = useState(false);
  const [offlineCache, setOfflineCache] = useState('checking');
  const [showReady, setShowReady] = useState(false);
  const wasOffline = useRef(!navigator.onLine);

  useEffect(() => {
    let restoredTimer;
    let readyTimer;

    const handleOffline = () => {
      wasOffline.current = true;
      setRestored(false);
      setOnline(false);
    };

    const handleOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        wasOffline.current = false;
        setRestored(true);
        restoredTimer = window.setTimeout(() => setRestored(false), 3500);
      }
    };

    const handleCacheReady = () => {
      setOfflineCache('ready');
      setShowReady(true);
      readyTimer = window.setTimeout(() => setShowReady(false), 6000);
    };

    const handleCacheError = () => {
      setOfflineCache('error');
      setShowReady(false);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('mon-foyer-offline-ready', handleCacheReady);
    window.addEventListener('mon-foyer-offline-error', handleCacheError);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('mon-foyer-offline-ready', handleCacheReady);
      window.removeEventListener('mon-foyer-offline-error', handleCacheError);
      window.clearTimeout(restoredTimer);
      window.clearTimeout(readyTimer);
    };
  }, []);

  let kind = '';
  let message = '';

  if (!online) {
    kind = 'offline';
    message = 'Mode hors connexion · les modifications restent sur cet appareil';
  } else if (restored) {
    kind = 'restored';
    message = 'Connexion rétablie · synchronisation automatique en cours';
  } else if (showReady && offlineCache === 'ready') {
    kind = 'ready';
    message = 'Mode hors connexion prêt · l’application peut maintenant démarrer en mode avion';
  } else if (offlineCache === 'error') {
    kind = 'error';
    message = 'Mode hors connexion non installé · actualisez cette page en restant connecté';
  } else {
    return null;
  }

  return (
    <div
      className={'connection-status is-' + kind}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">{kind === 'offline' || kind === 'error' ? '!' : '✓'}</span>
      {message}
    </div>
  );
}
