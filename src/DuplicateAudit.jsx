import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Trash2 } from 'lucide-react';
import { formatMoney } from './domain/money/money.js';
import './DuplicateAudit.css';

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelSimilarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aw = new Set(a.split(' ').filter((word) => word.length > 2));
  const bw = new Set(b.split(' ').filter((word) => word.length > 2));
  if (!aw.size || !bw.size) return 0;
  const common = [...aw].filter((word) => bw.has(word)).length;
  return common / Math.max(aw.size, bw.size);
}

function groupExact(rows, signature) {
  const map = new Map();
  rows.forEach((row) => {
    const key = signature(row);
    const group = map.get(key) || [];
    group.push(row);
    map.set(key, group);
  });
  return [...map.values()].filter((group) => group.length > 1);
}

function probablePairs(rows, matcher, exactGroups) {
  const exactIds = new Set(exactGroups.flatMap((group) => group.map((row) => row.id)));
  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      if (exactIds.has(left.id) && exactIds.has(right.id)) continue;
      if (!matcher(left, right)) continue;
      const key = [left.id, right.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([left, right]);
    }
  }
  return pairs;
}

function recurringExactSignature(row) {
  return [normalize(row.label), Number(row.amount || 0).toFixed(2), Number(row.day || 0), row.person || 'Foyer', row.category || '', row.frequency || 'monthly'].join('|');
}

function recurringProbable(left, right) {
  if (Math.abs(Number(left.amount || 0) - Number(right.amount || 0)) > 0.01) return false;
  if ((left.person || 'Foyer') !== (right.person || 'Foyer')) return false;
  if ((left.category || '') !== (right.category || '')) return false;
  if ((left.frequency || 'monthly') !== (right.frequency || 'monthly')) return false;
  if (Math.abs(Number(left.day || 0) - Number(right.day || 0)) > 2) return false;
  const sameBankFingerprint = Boolean(
    (left.directDebitReference && right.directDebitReference && normalize(left.directDebitReference) === normalize(right.directDebitReference))
    || (left.structuredCommunication && right.structuredCommunication && normalize(left.structuredCommunication) === normalize(right.structuredCommunication))
    || (left.freeCommunication && right.freeCommunication && normalize(left.freeCommunication) === normalize(right.freeCommunication)),
  );
  return sameBankFingerprint || labelSimilarity(left.label, right.label) >= 0.72;
}

function operationExactSignature(row) {
  return [row.date || '', Number(row.amount || 0).toFixed(2), row.type || '', row.person || 'Foyer', row.paymentMethod || row.payment_method || 'Compte Belfius', normalize(row.label)].join('|');
}

function mentionsDifferentNamedPersons(left, right) {
  const a = normalize(left.label);
  const b = normalize(right.label);
  return (a.includes('alain') && b.includes('esther')) || (a.includes('esther') && b.includes('alain'));
}

function operationProbable(left, right) {
  if ((left.date || '') !== (right.date || '')) return false;
  if (Math.abs(Number(left.amount || 0) - Number(right.amount || 0)) > 0.01) return false;
  if ((left.type || '') !== (right.type || '')) return false;
  if ((left.person || 'Foyer') !== (right.person || 'Foyer')) return false;
  if ((left.paymentMethod || left.payment_method || 'Compte Belfius') !== (right.paymentMethod || right.payment_method || 'Compte Belfius')) return false;
  const savingsLike = String(left.category || '').startsWith('epargne') || String(right.category || '').startsWith('epargne');
  if (savingsLike && mentionsDifferentNamedPersons(left, right)) return false;
  const sameStore = normalize(left.store) && normalize(left.store) === normalize(right.store);
  const sameCategory = left.category && left.category === right.category;
  return labelSimilarity(left.label, right.label) >= 0.66 || (!savingsLike && sameStore && sameCategory);
}

function bankFingerprintText(row) {
  const parts = [];
  const mandate = row.directDebitReference || row.direct_debit_reference;
  const structured = row.structuredCommunication || row.structured_communication;
  const free = row.freeCommunication || row.free_communication;
  if (mandate) parts.push(`Mandat/OP ${mandate}`);
  if (structured) parts.push(`Communication ${structured}`);
  if (free) parts.push(`Motif ${free}`);
  return parts.join(' · ');
}

function DuplicateGroup({ title, groups, kind, onDelete }) {
  if (!groups.length) return null;
  return (
    <details className={`duplicate-section ${kind}`} open={kind === 'exact'}>
      <summary>{title} <strong>{groups.length}</strong></summary>
      <div className="duplicate-groups">
        {groups.map((group, index) => (
          <article className="duplicate-group" key={`${kind}-${index}`}>
            {group.map((row) => {
              const fingerprint = bankFingerprintText(row);
              return (
                <div className="duplicate-row" key={row.id}>
                  <div>
                    <strong>{row.label}</strong>
                    <span>{row.date ? `${row.date} · ` : ''}{row.person || 'Foyer'}{row.day ? ` · jour ${row.day}` : ''}{row.category ? ` · ${row.category}` : ''}</span>
                    {fingerprint && <span className="duplicate-bank-fingerprint">{fingerprint}</span>}
                  </div>
                  <div className="duplicate-row-actions">
                    <strong>{formatMoney(row.amount)}</strong>
                    {onDelete && <button type="button" className="duplicate-delete" title="Supprimer cette ligne" aria-label={`Supprimer ${row.label}`} onClick={() => onDelete(row)}><Trash2 size={16} /></button>}
                  </div>
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </details>
  );
}

export default function DuplicateAudit({ mode, recurringExpenses = [], operations = [], selectedMonth = '', onDeleteOperation, onDeleteRecurring }) {
  const audit = useMemo(() => {
    if (mode === 'recurring') {
      const exact = groupExact(recurringExpenses, recurringExactSignature);
      return { exact, probable: probablePairs(recurringExpenses, recurringProbable, exact) };
    }
    const monthRows = selectedMonth ? operations.filter((row) => String(row.date || '').startsWith(selectedMonth)) : operations;
    const exact = groupExact(monthRows, operationExactSignature);
    return { exact, probable: probablePairs(monthRows, operationProbable, exact) };
  }, [mode, operations, recurringExpenses, selectedMonth]);

  const total = audit.exact.length + audit.probable.length;
  const deleteHandler = mode === 'recurring' ? onDeleteRecurring : onDeleteOperation;

  return (
    <section className={`panel duplicate-audit ${total ? 'has-duplicates' : 'is-clean'}`}>
      <div className="duplicate-head">
        <div className="duplicate-title">{total ? <AlertTriangle size={21} /> : <CheckCircle2 size={21} />}<div><h2>Contrôle des doublons</h2><span>{mode === 'recurring' ? 'Frais fixes récurrents' : `Historique${selectedMonth ? ` · ${selectedMonth}` : ''}`}</span></div></div>
        <div className="duplicate-count"><Copy size={16} /> {total}</div>
      </div>
      {!total ? <p className="duplicate-clean">Aucun doublon exact ou probable détecté avec les données actuellement chargées.</p> : <><p className="duplicate-warning">Tu peux supprimer directement la ligne incorrecte. L’application demandera confirmation avant la suppression réelle.</p><DuplicateGroup title="Doublons exacts" groups={audit.exact} kind="exact" onDelete={deleteHandler || null} /><DuplicateGroup title="Doublons probables" groups={audit.probable} kind="probable" onDelete={deleteHandler || null} /></>}
    </section>
  );
}
