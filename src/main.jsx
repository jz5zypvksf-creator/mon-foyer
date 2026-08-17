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

function waitForActivation(registration) {
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) return Promise.reject(new Error('Service worker introuvable.'));
  if (worker.state === 'activated') return Promise.resolve(worker);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('Activation du mode hors connexion trop longue.')),
      15000,
    );
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeout);
        resolve(worker);
      } else if (worker.state === 'redundant') {
        window.clearTimeout(timeout);
        reject(new Error('Installation du cache hors connexion refusée.'));
      }
    });
  });
}

function verifyOfflineCache(worker) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(
      () => reject(new Error('Le cache hors connexion ne répond pas.')),
      5000,
    );
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      if (event.data?.type === 'OFFLINE_READY' && event.data.ready) {
        resolve(event.data);
      } else {
        reject(new Error('Le cache hors connexion est incomplet.'));
      }
    };
    worker.postMessage({ type: 'CHECK_OFFLINE_READY' }, [channel.port2]);
  });
}

if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      await registration.update();
      const worker = await waitForActivation(registration);
      const detail = await verifyOfflineCache(worker);
      window.dispatchEvent(new CustomEvent('mon-foyer-offline-ready', { detail }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('mon-foyer-offline-error', {
        detail: { message: String(error?.message || error) },
      }));
    }
  });
}
