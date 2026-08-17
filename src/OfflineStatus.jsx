import { useEffect, useRef, useState } from 'react';
import './OfflineStatus.css';

export default function OfflineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [restored, setRestored] = useState(false);
  const wasOffline = useRef(!navigator.onLine);

  useEffect(() => {
    let restoredTimer;

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

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.clearTimeout(restoredTimer);
    };
  }, []);

  if (online && !restored) return null;

  return (
    <div
      className={online ? 'connection-status is-restored' : 'connection-status is-offline'}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">{online ? '✓' : '!'}</span>
      {online
        ? 'Connexion rétablie · synchronisation automatique en cours'
        : 'Mode hors connexion · les modifications restent sur cet appareil'}
    </div>
  );
}
