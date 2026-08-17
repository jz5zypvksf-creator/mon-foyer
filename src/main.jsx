import React from 'react';
import { createRoot } from 'react-dom/client';
import AppWithReconciliation from './AppWithReconciliation.jsx';
import './styles.css';
import './CareCards.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppWithReconciliation />
  </React.StrictMode>,
);

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
