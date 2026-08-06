import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Split,
  Upload,
} from 'lucide-react';

const AMOUNT_TOLERANCE = 0.05;
const DATE_TOLERANCE_DAYS = 2;

const money = (value) => new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
}).format(Number(value) || 0);

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
      } else {
        quoted = !quoted;
      }
    } else if (char === ';' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
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
    return normalized.includes('date de comptabilisation')
      && normalized.includes('montant')
      && normalized.includes('compte contrepartie');
  });

  if (headerIndex < 0) {
    throw new Error("Le format du fichier Belfius n'a pas été reconnu.");
  }

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

function dateSerial(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function dayDistance(left, right) {
  return Math.abs(dateSerial(left) - dateSerial(right));
}

function sameDirection(bankRow, appRow) {
  return (bankRow.amount > 0) === (appRow.type === 'income');
}

function amountDistance(bankRow, appRow) {
  return Math.abs(Math.abs(Number(bankRow.amount)) - Math.abs(Number(appRow.amount)));
}

function labelSimilarity(bankRow, appRow) {
  const bankLabel = normalize(`${bankRow.label} ${bankRow.details}`);
  const appLabel = normalize(`${appRow.label} ${appRow.store || ''}`);
  if (!bankLabel || !appLabel) return 0;
  if (bankLabel.includes(appLabel) || appLabel.includes(bankLabel)) return 1;

  const bankTokens = new Set(bankLabel.split(' ').filter((token) => token.length >= 4));
  const appTokens = appLabel.split(' ').filter((token) => token.length >= 4);
  if (!appTokens.length) return 0;
  const common = appTokens.filter((token) => bankTokens.has(token)).length;
  return common / appTokens.length;
}

function scoreCandidate(bankRow, appRow) {
  if (!sameDirection(bankRow, appRow)) return null;

  const amountGap = amountDistance(bankRow, appRow);
  const dateGap = dayDistance(bankRow.date, appRow.date);
  if (amountGap > AMOUNT_TOLERANCE || dateGap > DATE_TOLERANCE_DAYS) return null;

  const labelScore = labelSimilarity(bankRow, appRow);
  const confidence = amountGap < 0.005 && dateGap === 0
    ? 100
    : amountGap <= AMOUNT_TOLERANCE && dateGap === 0
      ? 99
      : amountGap < 0.005 && dateGap === 1
        ? 98
        : 96;

  return {
    confidence,
    amountGap,
    dateGap,
    labelScore,
    rank: confidence * 100 + labelScore * 10 - dateGap - amountGap,
  };
}

function possibleSplit(bankRow, availableRows) {
  const candidates = availableRows
    .filter((row) => row.type !== 'income')
    .filter((row) => dayDistance(row.date, bankRow.date) <= DATE_TOLERANCE_DAYS)
    .slice(0, 14);
  const target = Math.abs(bankRow.amount);

  for (let mask = 1; mask < (1 << candidates.length); mask += 1) {
    const selected = [];
    let total = 0;

    for (let index = 0; index < candidates.length; index += 1) {
      if (mask & (1 << index)) {
        selected.push(candidates[index]);
        total += Math.abs(Number(candidates[index].amount) || 0);
      }
    }

    if (selected.length > 1 && Math.abs(total - target) <= AMOUNT_TOLERANCE) {
      return {
        rows: selected,
        confidence: Math.abs(total - target) < 0.005 ? 100 : 98,
      };
    }
  }

  return null;
}

function reconcile(bankRows, operations, selectedMonth) {
  const monthBankRows = bankRows.filter((row) => row.date.startsWith(selectedMonth));
  const appRows = operations
    .filter((row) => (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius')
    .filter((row) => !String(row.label || '').startsWith('Ajustement Belfius'))
    .filter((row) => row.date?.startsWith(selectedMonth))
    .map((row) => ({ ...row, amount: Number(row.amount) || 0 }));

  const used = new Set();
  const matched = [];
  const missing = [];
  const splits = [];

  monthBankRows.forEach((bankRow) => {
    const candidates = appRows
      .map((row, index) => ({ row, index, score: scoreCandidate(bankRow, row) }))
      .filter(({ index, score }) => !used.has(index) && score)
      .sort((left, right) => right.score.rank - left.score.rank);

    if (candidates.length) {
      const selected = candidates[0];
      used.add(selected.index);
      matched.push({ bank: bankRow, app: selected.row, confidence: selected.score.confidence });
      return;
    }

    if (bankRow.amount < 0) {
      const available = appRows.filter((_, index) => !used.has(index));
      const split = possibleSplit(bankRow, available);
      if (split) {
        split.rows.forEach((row) => used.add(appRows.indexOf(row)));
        splits.push({ bank: bankRow, app: split.rows, confidence: split.confidence });
        return;
      }
    }

    missing.push(bankRow);
  });

  return {
    matched,
    splits,
    missing,
    extra: appRows.filter((_, index) => !used.has(index)),
    bankRows: monthBankRows,
    appRows,
  };
}

function ConfidenceBadge({ value }) {
  return <em className={value >= 98 ? 'positive' : ''}>Confiance {value}%</em>;
}

export default function BelfiusAudit({ operations, appBelfiusBalance, selectedMonth }) {
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const result = useMemo(
    () => audit ? reconcile(audit.rows, operations, selectedMonth) : null,
    [audit, operations, selectedMonth],
  );

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
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
  const isBalanced = Boolean(
    audit
    && Math.abs(difference) < 0.01
    && result?.missing.length === 0
    && result?.extra.length === 0,
  );

  return (
    <section className="panel belfius-audit">
      <div className="section-title">
        <h2><FileSearch size={22} /> Audit bancaire Belfius</h2>
        {audit && <span>{result?.bankRows.length || 0} opérations · {selectedMonth}</span>}
      </div>

      <p className="hint">
        Le fichier complet est lu, mais seules les opérations du mois sélectionné sont rapprochées.
      </p>

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
              <strong>{isBalanced ? 'Comptabilité conforme' : 'Écart ou opérations à vérifier'}</strong>
              <span>Solde bancaire relevé le {audit.balanceDate || 'jour de l’export'}</span>
            </div>
          </div>

          <div className="audit-summary-grid">
            <div><span>Solde Belfius réel</span><strong>{money(audit.balance)}</strong></div>
            <div><span>Solde Mon Foyer</span><strong>{money(appBelfiusBalance)}</strong></div>
            <div><span>Écart</span><strong className={Math.abs(difference) < 0.01 ? 'positive' : 'negative'}>{money(difference)}</strong></div>
            <div><span>Opérations du mois</span><strong>{result.bankRows.length}</strong></div>
            <div><span>Correspondances validées</span><strong>{result.matched.length}</strong></div>
            <div><span>Ventilations reconnues</span><strong>{result.splits.length}</strong></div>
            <div><span>Absentes de Mon Foyer</span><strong>{result.missing.length}</strong></div>
            <div><span>En trop dans Mon Foyer</span><strong>{result.extra.length}</strong></div>
          </div>

          {result.matched.length > 0 && (
            <details className="audit-details">
              <summary>Correspondances validées ({result.matched.length})</summary>
              {result.matched.map(({ bank, app, confidence }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {money(bank.amount)}</strong>
                  <span>Mon Foyer : {app.label} · {money(app.type === 'income' ? app.amount : -app.amount)}</span>
                  <ConfidenceBadge value={confidence} />
                </article>
              ))}
            </details>
          )}

          {result.splits.length > 0 && (
            <details className="audit-details" open>
              <summary><Split size={16} /> Ventilations reconnues ({result.splits.length})</summary>
              {result.splits.map(({ bank, app, confidence }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {money(bank.amount)}</strong>
                  <span>{app.map((row) => `${row.label} (${money(row.amount)})`).join(' + ')}</span>
                  <ConfidenceBadge value={confidence} />
                </article>
              ))}
            </details>
          )}

          {result.missing.length > 0 && (
            <details className="audit-details">
              <summary>Opérations Belfius absentes ({result.missing.length})</summary>
              {result.missing.map((row) => (
                <article key={row.id}>
                  <strong>{row.date} · {row.label}</strong>
                  <span>{money(row.amount)}</span>
                </article>
              ))}
            </details>
          )}

          {result.extra.length > 0 && (
            <details className="audit-details">
              <summary>Opérations Mon Foyer sans correspondance ({result.extra.length})</summary>
              {result.extra.map((row) => (
                <article key={row.id}>
                  <strong>{row.date} · {row.label}</strong>
                  <span>{money(row.type === 'income' ? row.amount : -row.amount)}</span>
                </article>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
