import React from 'react';
import { createRoot } from 'react-dom/client';
import AppWithReconciliation from './AppWithReconciliation.jsx';
import OfflineStatus from './OfflineStatus.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OfflineStatus />
    <AppWithReconciliation />
  </React.StrictMode>,
);

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await registration.update();
    } catch {
      // L'application reste utilisable en ligne si le cache hors connexion échoue.
    }
  });
}
