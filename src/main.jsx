import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import OfflineStatus from './OfflineStatus.jsx';
import NotificationReminders from './NotificationReminders.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OfflineStatus />
    <App />
    <NotificationReminders />
  </React.StrictMode>,
);

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

function setReactSelectValue(select, value) {
  if (!select || !value) return;
  const optionExists = Array.from(select.options || []).some((option) => option.value === value);
  if (!optionExists) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function openQuickAdd(person = '') {
  let attempts = 0;
  const tryOpen = () => {
    attempts += 1;
    const addButton = Array.from(document.querySelectorAll('.bottom-nav button'))
      .find((button) => button.textContent?.trim().includes('Ajouter'));
    if (!addButton) {
      if (attempts < 25) window.setTimeout(tryOpen, 120);
      return;
    }

    addButton.click();
    window.setTimeout(() => {
      const personLabel = Array.from(document.querySelectorAll('.form-panel label'))
        .find((label) => label.textContent?.trim().startsWith('Personne'));
      setReactSelectValue(personLabel?.querySelector('select'), person);
      const form = document.querySelector('.form-panel');
      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form?.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    }, 100);

    const url = new URL(window.location.href);
    url.searchParams.delete('quickAdd');
    url.searchParams.delete('person');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };
  tryOpen();
}

const initialUrl = new URL(window.location.href);
if (initialUrl.searchParams.get('quickAdd') === '1') {
  window.setTimeout(() => openQuickAdd(initialUrl.searchParams.get('person') || ''), 50);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'OPEN_QUICK_ADD') openQuickAdd(event.data.person || '');
  });
}

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
