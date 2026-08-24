import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, CheckCircle2, DatabaseBackup, FileSpreadsheet, X } from 'lucide-react';
import { LAST_BACKUP_STORAGE_KEY, LAST_BELFIUS_AUDIT_STORAGE_KEY } from './lib/backupRules.js';
import './NotificationReminders.css';

const SETTINGS_KEY = 'mon-foyer-reminder-settings-v1';
const AUDIT_STORAGE_KEY = 'mon-foyer-belfius-audit-v1';
const NOTICE_KEY = 'mon-foyer-reminder-last-notices-v1';
const DAY_MS = 86_400_000;

const DEFAULT_SETTINGS = {
  backupEnabled: true,
  backupEveryDays: 7,
  csvEnabled: true,
  csvEveryDays: 7,
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
}

function readLastCsvImport() {
  const direct = localStorage.getItem(LAST_BELFIUS_AUDIT_STORAGE_KEY) || '';
  const audit = readJson(AUDIT_STORAGE_KEY, null);
  const importedAt = audit?.importedAt || '';
  if (!direct) return importedAt;
  if (!importedAt) return direct;
  return Date.parse(direct) >= Date.parse(importedAt) ? direct : importedAt;
}

function daysSince(value, now = Date.now()) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

function formatDate(value) {
  if (!value) return 'Jamais';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Jamais';
  return date.toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' });
}

function noticeToken(kind, reference) {
  return `${kind}:${reference || 'none'}:${new Date().toISOString().slice(0, 10)}`;
}

async function showSystemNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        tag,
        renotify: false,
        icon: '/icon.svg',
        data: { url: '/' },
      });
      return true;
    }
    new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}

export default function NotificationReminders() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [permission, setPermission] = useState(() => (
    'Notification' in window ? Notification.permission : 'unsupported'
  ));
  const [now, setNow] = useState(Date.now());

  const snapshot = useMemo(() => {
    const lastBackup = localStorage.getItem(LAST_BACKUP_STORAGE_KEY) || '';
    const lastCsv = readLastCsvImport();
    const backupDays = daysSince(lastBackup, now);
    const csvDays = daysSince(lastCsv, now);
    const auditAfterBackup = Boolean(
      lastCsv
      && (!lastBackup || Date.parse(lastCsv) > Date.parse(lastBackup)),
    );

    const backupDue = settings.backupEnabled && (
      backupDays === null
      || backupDays >= Number(settings.backupEveryDays || 7)
      || auditAfterBackup
    );
    const csvDue = settings.csvEnabled && (
      csvDays === null || csvDays >= Number(settings.csvEveryDays || 7)
    );

    return {
      lastBackup,
      lastCsv,
      backupDays,
      csvDays,
      backupDue,
      csvDue,
      auditAfterBackup,
      dueCount: Number(backupDue) + Number(csvDue),
    };
  }, [now, settings]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 60 * 60 * 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;
    const notices = readJson(NOTICE_KEY, {});

    async function notifyIfNeeded() {
      let changed = false;

      if (snapshot.backupDue) {
        const token = noticeToken('backup', snapshot.lastBackup);
        if (notices.backup !== token) {
          const body = snapshot.auditAfterBackup
            ? 'Un nouvel audit Belfius a été importé depuis la dernière sauvegarde.'
            : snapshot.backupDays === null
              ? 'Aucune sauvegarde récente n’est enregistrée sur cet appareil.'
              : `La dernière sauvegarde date de ${snapshot.backupDays} jour(s).`;
          if (await showSystemNotification('Mon Foyer · Sauvegarde', body, 'mon-foyer-backup-reminder')) {
            notices.backup = token;
            changed = true;
          }
        }
      }

      if (snapshot.csvDue) {
        const token = noticeToken('csv', snapshot.lastCsv);
        if (notices.csv !== token) {
          const body = snapshot.csvDays === null
            ? 'Aucun import CSV Belfius récent n’est enregistré sur cet appareil.'
            : `Le dernier import CSV Belfius date de ${snapshot.csvDays} jour(s).`;
          if (await showSystemNotification('Mon Foyer · Import Belfius', body, 'mon-foyer-csv-reminder')) {
            notices.csv = token;
            changed = true;
          }
        }
      }

      if (changed) localStorage.setItem(NOTICE_KEY, JSON.stringify(notices));
    }

    notifyIfNeeded();
  }, [permission, snapshot]);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    setNow(Date.now());
  };

  const updateSetting = (name, value) => {
    setSettings((current) => ({ ...current, [name]: value }));
  };

  return (
    <>
      <button
        type="button"
        className={`reminder-fab ${snapshot.dueCount ? 'has-due' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Ouvrir les rappels Mon Foyer"
      >
        {snapshot.dueCount ? <BellRing size={20} /> : <Bell size={20} />}
        <span>Rappels</span>
        {snapshot.dueCount > 0 && <b>{snapshot.dueCount}</b>}
      </button>

      {open && (
        <div className="reminder-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="reminder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reminder-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="reminder-kicker">Notifications</p>
                <h2 id="reminder-title">Rappels Mon Foyer</h2>
              </div>
              <button type="button" className="reminder-close" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>

            <div className="reminder-permission">
              {permission === 'granted' ? (
                <span className="is-ok"><CheckCircle2 size={17} /> Notifications système autorisées</span>
              ) : permission === 'unsupported' ? (
                <span>Les notifications système ne sont pas disponibles dans ce navigateur.</span>
              ) : (
                <>
                  <span>Autorise les notifications pour recevoir les rappels sur cet appareil.</span>
                  <button type="button" onClick={requestPermission}>Autoriser</button>
                </>
              )}
            </div>

            <article className={`reminder-card ${snapshot.backupDue ? 'is-due' : ''}`}>
              <div className="reminder-card-title">
                <DatabaseBackup size={20} />
                <div>
                  <strong>Sauvegarde</strong>
                  <span>Dernière : {formatDate(snapshot.lastBackup)}</span>
                </div>
              </div>
              <label className="reminder-toggle">
                <input
                  type="checkbox"
                  checked={settings.backupEnabled}
                  onChange={(event) => updateSetting('backupEnabled', event.target.checked)}
                />
                <span>Activer le rappel</span>
              </label>
              <label>
                Me rappeler après
                <select
                  value={settings.backupEveryDays}
                  onChange={(event) => updateSetting('backupEveryDays', Number(event.target.value))}
                  disabled={!settings.backupEnabled}
                >
                  <option value={3}>3 jours</option>
                  <option value={7}>7 jours</option>
                  <option value={14}>14 jours</option>
                  <option value={30}>30 jours</option>
                </select>
              </label>
              {snapshot.auditAfterBackup && settings.backupEnabled && (
                <small>Un nouvel import Belfius a été effectué depuis la dernière sauvegarde.</small>
              )}
            </article>

            <article className={`reminder-card ${snapshot.csvDue ? 'is-due' : ''}`}>
              <div className="reminder-card-title">
                <FileSpreadsheet size={20} />
                <div>
                  <strong>Import CSV Belfius</strong>
                  <span>Dernier : {formatDate(snapshot.lastCsv)}</span>
                </div>
              </div>
              <label className="reminder-toggle">
                <input
                  type="checkbox"
                  checked={settings.csvEnabled}
                  onChange={(event) => updateSetting('csvEnabled', event.target.checked)}
                />
                <span>Activer le rappel</span>
              </label>
              <label>
                Me rappeler après
                <select
                  value={settings.csvEveryDays}
                  onChange={(event) => updateSetting('csvEveryDays', Number(event.target.value))}
                  disabled={!settings.csvEnabled}
                >
                  <option value={3}>3 jours</option>
                  <option value={7}>7 jours</option>
                  <option value={14}>14 jours</option>
                  <option value={30}>30 jours</option>
                </select>
              </label>
            </article>

            <p className="reminder-note">
              Les rappels sont enregistrés sur cet appareil. Une sauvegarde ou un nouvel import CSV remet automatiquement le délai à zéro.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
