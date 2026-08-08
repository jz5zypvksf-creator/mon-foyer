import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, RefreshCw, Upload } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('fr-BE', {
  style: 'currency', currency: 'EUR',
}).format(Number(value) || 0);

const AMOUNT_TOLERANCE = 0.05;
const DATE_TOLERANCE_DAYS = 2;
const DAY_MS = 86400000;

function parseAmount(value) {
  return Number(String(value || '')
    .replace(/\s/g, '')
    .replace(/EUR/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')) || 0;
}

function parseDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function parseBalanceMonth(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}` : '';
}

function dateDistance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs(Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) / DAY_MS;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ';' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

function parseBelfius(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const balanceLine = lines.find((line) => normalize(line).startsWith('dernier solde'));
  const balanceDateLine = lines.find((line) => normalize(line).startsWith('date heure du dernier solde'));
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalize(line);
    return normalized.includes('date de comptabilisation') && normalized.includes('montant') && normalized.includes('compte contrepartie');
  });
  if (headerIndex < 0) throw new Error("Le format du fichier Belfius n'a pas été reconnu.");

  const headers = parseCsvLine(lines[headerIndex]).map(normalize);
  const dateIndex = headers.findIndex((header) => header === 'date de comptabilisation');
  const amountIndex = headers.findIndex((header) => header === 'montant');
  const nameIndex = headers.findIndex((header) => header.includes('nom contrepartie'));
  const transactionIndex = headers.findIndex((header) => header === 'transaction');
  const communicationIndex = headers.findIndex((header) => header === 'communications');

  const rows = lines.slice(headerIndex + 1)
    .filter((line) => line.trim())
    .map(parseCsvLine)
    .map((cells, index) => ({
      id: `bank-${index}`,
      date: parseDate(cells[dateIndex]),
      amount: parseAmount(cells[amountIndex]),
      label: cells[nameIndex] || cells[transactionIndex] || cells[communicationIndex] || 'Opération Belfius',
      details: cells[communicationIndex] || cells[transactionIndex] || '',
    }))
    .filter((row) => row.date && row.amount !== 0);

  return {
    balance: parseAmount(balanceLine?.split(';')[1]),
    balanceDate: balanceDateLine?.split(';')[1] || '',
    rows,
  };
}

function labelsLikelyMatch(bankRow, appRow) {
  const bankLabel = normalize(`${bankRow.label} ${bankRow.details}`);
  const appLabel = normalize(`${appRow.label} ${appRow.store || ''}`);
  if (!appLabel || !bankLabel) return false;
  const tokens = appLabel.split(' ').filter((token) => token.length >= 5);
  return bankLabel.includes(appLabel)
    || appLabel.includes(bankLabel)
    || tokens.some((token) => bankLabel.includes(token));
}

function findRecurringMatch(bankRow, appRow, recurringExpenses) {
  if (bankRow.amount >= 0 || appRow.type === 'income') return null;
  const operationAmount = Math.abs(Number(appRow.amount) || 0);
  const day = Number(appRow.date?.slice(8, 10));
  return (recurringExpenses || []).find((expense) => {
    const recurringAmount = Math.abs(Number(expense.amount) || 0);
    const recurringDay = Number(expense.day) || 1;
    return Math.abs(recurringAmount - operationAmount) <= AMOUNT_TOLERANCE
      && Math.abs(recurringDay - day) <= DATE_TOLERANCE_DAYS;
  }) || null;
}

function matchScore(bankRow, appRow, recurringExpenses) {
  const amountDelta = Math.abs(Math.abs(Number(appRow.amount) || 0) - Math.abs(bankRow.amount));
  const dayDelta = dateDistance(bankRow.date, appRow.date);
  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income');
  if (!directionMatches || amountDelta > AMOUNT_TOLERANCE || dayDelta > DATE_TOLERANCE_DAYS) return null;

  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);
  const labelMatch = labelsLikelyMatch(bankRow, appRow);
  let confidence = 94;
  let reason = 'Même montant et date compatible';

  if (dayDelta === 0) {
    confidence = 98;
    reason = 'Même montant et même date';
  }
  if (labelMatch) {
    confidence = Math.max(confidence, 99);
    reason = 'Montant, date et libellé concordants';
  }
  if (recurring) {
    confidence = 100;
    reason = `Frais récurrent reconnu : ${recurring.label}`;
  }

  return { confidence, reason, recurring };
}

function possibleSplit(bankRow, indexedAppRows) {
  if (bankRow.amount >= 0) return null;
  const candidates = indexedAppRows
    .filter(({ row }) => row.type !== 'income')
    .filter(({ row }) => dateDistance(row.date, bankRow.date) <= DATE_TOLERANCE_DAYS)
    .slice(0, 14);
  const target = Math.abs(bankRow.amount);

  for (let mask = 1; mask < (1 << candidates.length); mask += 1) {
    const selected = [];
    let total = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      if (mask & (1 << index)) {
        selected.push(candidates[index]);
        total += Math.abs(Number(candidates[index].row.amount) || 0);
      }
    }
    if (selected.length > 1 && Math.abs(total - target) <= AMOUNT_TOLERANCE) {
      return selected;
    }
  }
  return null;
}

function reconcile(bankRows, operations, selectedMonth, recurringExpenses) {
  const auditMonth = selectedMonth || new Date().toISOString().slice(0, 7);
  const monthBankRows = bankRows.filter((row) => row.date.startsWith(auditMonth));
  const appRows = operations
    .filter((row) => (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius')
    .filter((row) => !String(row.label || '').startsWith('Ajustement Belfius'))
    .filter((row) => String(row.date || '').startsWith(auditMonth))
    .map((row) => ({ ...row, amount: Number(row.amount) || 0 }));

  const used = new Set();
  const matched = [];
  const missing = [];
  const splits = [];

  monthBankRows.forEach((bankRow) => {
    const candidates = appRows
      .map((row, index) => ({ row, index, match: used.has(index) ? null : matchScore(bankRow, row, recurringExpenses) }))
      .filter(({ match }) => match)
      .sort((left, right) => right.match.confidence - left.match.confidence
        || dateDistance(left.row.date, bankRow.date) - dateDistance(right.row.date, bankRow.date));

    const selected = candidates[0];
    if (selected) {
      used.add(selected.index);
      matched.push({ bank: bankRow, app: selected.row, ...selected.match });
      return;
    }

    const available = appRows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !used.has(index));
    const split = possibleSplit(bankRow, available);
    if (split) {
      split.forEach(({ index }) => used.add(index));
      splits.push({
        bank: bankRow,
        app: split.map(({ row }) => row),
        confidence: 97,
        reason: 'Montant bancaire retrouvé par ventilation',
      });
      return;
    }

    missing.push(bankRow);
  });

  const extra = appRows.filter((_, index) => !used.has(index));
  return { matched, splits, missing, extra, bankRows: monthBankRows, appRows, auditMonth };
}

export default function BelfiusAudit({
  operations,
  appBelfiusBalance,
  selectedMonth,
  recurringExpenses = [],
  onSynchronizeBelfiusBalance,
}) {
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const synchronizationKey = useRef('');
  const result = useMemo(
    () => audit ? reconcile(audit.rows, operations, selectedMonth, recurringExpenses) : null,
    [audit, operations, recurringExpenses, selectedMonth],
  );

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    synchronizationKey.current = '';
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('windows-1252').decode(buffer);
      setAudit(parseBelfius(text));
    } catch (exception) {
      setAudit(null);
      setError(exception.message || "Le fichier n'a pas pu être analysé.");
    }
  };

  const difference = audit ? Number(appBelfiusBalance || 0) - audit.balance : 0;
  const auditIsClean = Boolean(audit && result && result.missing.length === 0 && result.extra.length === 0);
  const balanceMonth = parseBalanceMonth(audit?.balanceDate);
  const canSynchronize = auditIsClean
    && Math.abs(difference) >= 0.01
    && balanceMonth === result?.auditMonth
    && typeof onSynchronizeBelfiusBalance === 'function';
  const isBalanced = auditIsClean && Math.abs(difference) < 0.01;

  useEffect(() => {
    if (!canSynchronize || !audit) return;
    const key = `${audit.balance}|${audit.balanceDate}|${result.auditMonth}`;
    if (synchronizationKey.current === key) return;
    synchronizationKey.current = key;
    onSynchronizeBelfiusBalance({
      balance: audit.balance,
      balanceDate: audit.balanceDate,
      month: result.auditMonth,
    });
  }, [audit, canSynchronize, onSynchronizeBelfiusBalance, result]);

  return (
    <section className="panel belfius-audit">
      <div className="section-title">
        <h2><FileSearch size={22} /> Audit bancaire Belfius</h2>
        {audit && <span>{result?.bankRows.length || 0} opérations · {result?.auditMonth}</span>}
      </div>
      <p className="hint">Le fichier complet est lu, mais l'audit porte uniquement sur le mois sélectionné.</p>
      <label className="belfius-upload">
        <Upload size={20} />
        <span>Choisir un fichier CSV Belfius</span>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} />
      </label>
      {error && <p className="hint status-error">{error}</p>}

      {audit && result && (
        <div className="audit-results">
          <div className={`audit-verdict ${isBalanced ? 'ok' : 'warning'}`}>
            {isBalanced ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
            <div>
              <strong>{isBalanced ? 'Comptabilité conforme' : auditIsClean ? 'Rapprochement conforme · synchronisation du solde' : 'Écart ou opérations à vérifier'}</strong>
              <span>Solde bancaire relevé le {audit.balanceDate || 'jour de l’export'}</span>
            </div>
          </div>

          <div className="audit-summary-grid">
            <div><span>Solde Belfius réel</span><strong>{money(audit.balance)}</strong></div>
            <div><span>Solde Mon Foyer</span><strong>{money(appBelfiusBalance)}</strong></div>
            <div><span>Écart</span><strong className={Math.abs(difference) < 0.01 ? 'positive' : 'negative'}>{money(difference)}</strong></div>
            <div><span>Opérations du mois</span><strong>{result.bankRows.length}</strong></div>
            <div><span>Correspondances</span><strong>{result.matched.length}</strong></div>
            <div><span>Ventilations reconnues</span><strong>{result.splits.length}</strong></div>
            <div><span>Absentes de Mon Foyer</span><strong>{result.missing.length}</strong></div>
            <div><span>En trop dans Mon Foyer</span><strong>{result.extra.length}</strong></div>
          </div>

          {canSynchronize && (
            <p className="hint"><RefreshCw size={16} /> Rapprochement terminé : le solde Belfius de Mon Foyer est synchronisé automatiquement.</p>
          )}

          {result.matched.length > 0 && (
            <details className="audit-details">
              <summary>Correspondances validées ({result.matched.length})</summary>
              {result.matched.map(({ bank, app, confidence, reason }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {money(bank.amount)}</strong>
                  <span>→ {app.label} · confiance {confidence}% · {reason}</span>
                </article>
              ))}
            </details>
          )}

          {result.splits.length > 0 && (
            <details className="audit-details" open>
              <summary>Ventilations reconnues ({result.splits.length})</summary>
              {result.splits.map(({ bank, app, confidence }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {money(bank.amount)}</strong>
                  <span>{app.map((row) => `${row.label} (${money(row.amount)})`).join(' + ')} · confiance {confidence}%</span>
                </article>
              ))}
            </details>
          )}

          {result.missing.length > 0 && (
            <details className="audit-details" open>
              <summary>Opérations Belfius absentes ({result.missing.length})</summary>
              {result.missing.map((row) => (
                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.amount)}</span></article>
              ))}
            </details>
          )}

          {result.extra.length > 0 && (
            <details className="audit-details" open>
              <summary>Opérations Mon Foyer sans correspondance ({result.extra.length})</summary>
              {result.extra.map((row) => (
                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.type === 'income' ? row.amount : -row.amount)}</span></article>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
