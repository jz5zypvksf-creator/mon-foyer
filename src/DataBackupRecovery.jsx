import { useMemo, useRef, useState } from 'react';
import { DatabaseBackup, Download, FileCheck2, RotateCcw, Upload } from 'lucide-react';
import { householdId, isSupabaseConfigured, supabase } from './lib/supabase';
import {
  BACKUP_TABLES,
  backupCounts,
  createBackupEnvelope,
  parseBackup,
  rowsForCurrentHousehold,
} from './lib/backupRules.js';
import './DataBackupRecovery.css';

function dateLabel(value) {
  return new Date(value).toLocaleString('fr-BE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function safeFilenameDate(value) {
  return value.replace(/[:.]/g, '-');
}

function downloadEnvelope(envelope, prefix = 'mon-foyer-sauvegarde') {
  const blob = new Blob(
    [JSON.stringify(envelope, null, 2)],
    { type: 'application/json;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = prefix + '-' + safeFilenameDate(envelope.payload.createdAt) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function collectCurrentBackup() {
  if (!navigator.onLine) {
    throw new Error('Reconnectez Internet pour sauvegarder les données Supabase.');
  }

  const results = await Promise.all(BACKUP_TABLES.map(async ({ name, label }) => {
    const { data, error } = await supabase
      .from(name)
      .select('*')
      .eq('household_id', householdId);

    if (error) throw new Error(label + ' : ' + error.message);
    return [name, data || []];
  }));

  return createBackupEnvelope({
    createdAt: new Date().toISOString(),
    householdId,
    source: 'Supabase',
    tables: Object.fromEntries(results),
  });
}

export default function DataBackupRecovery() {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState('');

  const candidateTotal = useMemo(() => (
    candidate
      ? Object.values(candidate.counts).reduce((sum, count) => sum + count, 0)
      : 0
  ), [candidate]);

  const exportBackup = async () => {
    setBusy(true);
    setStatus('Création de la sauvegarde complète…');
    setStatusKind('');
    try {
      const envelope = await collectCurrentBackup();
      downloadEnvelope(envelope);
      localStorage.setItem('mon-foyer-last-backup-at', envelope.payload.createdAt);
      const total = Object.values(backupCounts(envelope.payload.tables))
        .reduce((sum, count) => sum + count, 0);
      setStatus(total + ' élément(s) sauvegardé(s). Conservez le fichier dans un endroit sûr.');
      setStatusKind('success');
    } catch (error) {
      setStatus('Sauvegarde impossible : ' + error.message);
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  };

  const inspectBackup = async (event) => {
    const file = event.target.files?.[0];
    setCandidate(null);
    setStatus('');
    setStatusKind('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setStatus('Ce fichier dépasse la taille maximale de 10 Mo.');
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const parsed = await parseBackup(await file.text(), householdId);
      setCandidate({ ...parsed, filename: file.name });
      setStatus('Sauvegarde vérifiée : le fichier est intact et appartient à ce foyer.');
      setStatusKind('success');
    } catch (error) {
      setStatus(error.message);
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async () => {
    if (!candidate || busy) return;
    const confirmed = window.confirm(
      'Restaurer cette sauvegarde en fusionnant son contenu avec les données actuelles ? '
      + 'Aucune donnée actuelle ne sera supprimée.',
    );
    if (!confirmed) return;

    setBusy(true);
    setStatus('Création du point de sécurité avant restauration…');
    setStatusKind('');

    try {
      const safetyBackup = await collectCurrentBackup();
      try {
        localStorage.setItem(
          'mon-foyer-last-pre-restore-backup',
          JSON.stringify(safetyBackup),
        );
      } catch {
        // Le téléchargement reste la protection principale si le stockage local est plein.
      }
      downloadEnvelope(safetyBackup, 'mon-foyer-avant-restauration');

      let restored = 0;
      for (const table of BACKUP_TABLES) {
        const rows = rowsForCurrentHousehold(
          candidate.payload.tables[table.name],
          householdId,
        );
        if (!rows.length) continue;

        setStatus('Restauration : ' + table.label + '…');
        const { error } = await supabase
          .from(table.name)
          .upsert(rows, { onConflict: table.onConflict });

        if (error) throw new Error(table.label + ' : ' + error.message);
        restored += rows.length;
      }

      setStatus(
        restored + ' élément(s) restauré(s) par fusion. '
        + 'Actualisation de Mon Foyer…',
      );
      setStatusKind('success');
      window.setTimeout(() => window.location.reload(), 1800);
    } catch (error) {
      setStatus('Restauration interrompue : ' + error.message);
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  };

  if (!isSupabaseConfigured || !supabase || !householdId) return null;

  return (
    <section className="panel backup-panel">
      <div className="section-title">
        <h2><DatabaseBackup size={20} /> Sauvegarde et récupération</h2>
        <span>Supabase · fichier JSON</span>
      </div>

      <p className="hint">
        La sauvegarde contient les données financières, Loisirs, messages et dernier audit Belfius.
        Elle ne contient aucun mot de passe ni donnée de Chronologie biblique.
      </p>

      <div className="backup-actions">
        <button
          className="primary-button"
          type="button"
          onClick={exportBackup}
          disabled={busy}
        >
          <Download size={18} />
          Télécharger une sauvegarde
        </button>

        <button
          className="secondary-button"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload size={18} />
          Choisir une sauvegarde
        </button>
        <input
          ref={inputRef}
          className="backup-file-input"
          type="file"
          accept="application/json,.json"
          onChange={inspectBackup}
        />
      </div>

      {candidate && (
        <div className="backup-preview">
          <div className="backup-preview-head">
            <FileCheck2 size={20} />
            <div>
              <strong>{candidate.filename}</strong>
              <span>
                Créée le {dateLabel(candidate.payload.createdAt)} · {candidateTotal} élément(s)
              </span>
            </div>
          </div>

          <div className="backup-counts">
            {BACKUP_TABLES.map((table) => (
              <span key={table.name}>
                {table.label} <strong>{candidate.counts[table.name]}</strong>
              </span>
            ))}
          </div>

          <button
            className="backup-restore-button"
            type="button"
            onClick={restoreBackup}
            disabled={busy}
          >
            <RotateCcw size={18} />
            Restaurer en fusionnant
          </button>
          <p className="hint">
            Un point de sécurité est téléchargé automatiquement avant la restauration.
            Les données actuelles ne sont jamais supprimées.
          </p>
        </div>
      )}

      {status && (
        <p className={'backup-status ' + (statusKind ? 'is-' + statusKind : '')} role="status">
          {status}
        </p>
      )}
    </section>
  );
}
