import { useMemo, useState } from 'react';
import { CheckCircle2, FileSearch, Upload, AlertTriangle } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('fr-BE', {
  style: 'currency', currency: 'EUR',
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

function possibleSplit(bankRow, appRows) {
  const candidates = appRows.filter((row) => row.date === bankRow.date && row.type !== 'income').slice(0, 12);
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
    if (selected.length > 1 && Math.abs(total - target) < 0.01) return selected;
  }
  return null;
}

function reconcile(bankRows, operations) {
  const appRows = operations
    .filter((row) => (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius')
    .map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
  const used = new Set();
  const matched = [];
  const missing = [];
  const splits = [];

  bankRows.forEach((bankRow) => {
    const candidates = appRows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => !used.has(index)
        && row.date === bankRow.date
        && Math.abs(Math.abs(row.amount) - Math.abs(bankRow.amount)) < 0.01
        && ((bankRow.amount > 0) === (row.type === 'income')));

    let selected = candidates.find(({ row }) => {
      const bankLabel = normalize(`${bankRow.label} ${bankRow.details}`);
      const appLabel = normalize(`${row.label} ${row.store || ''}`);
      return appLabel && bankLabel.includes(appLabel);
    }) || candidates[0];

    if (selected) {
      used.add(selected.index);
      matched.push({ bank: bankRow, app: selected.row });
      return;
    }

    if (bankRow.amount < 0) {
      const split = possibleSplit(bankRow, appRows.filter((_, index) => !used.has(index)));
      if (split) {
        split.forEach((row) => used.add(appRows.indexOf(row)));
        splits.push({ bank: bankRow, app: split });
        return;
      }
    }
    missing.push(bankRow);
  });

  const extra = appRows.filter((_, index) => !used.has(index));
  return { matched, splits, missing, extra };
}

export default function BelfiusAudit({ operations, appBelfiusBalance }) {
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const result = useMemo(() => audit ? reconcile(audit.rows, operations) : null, [audit, operations]);

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
  const isBalanced = audit && Math.abs(difference) < 0.01 && result?.missing.length === 0 && result?.extra.length === 0;

  return (
    <section className="panel belfius-audit">
      <div className="section-title">
        <h2><FileSearch size={22} /> Audit bancaire Belfius</h2>
        {audit && <span>{audit.rows.length} opérations bancaires</span>}
      </div>
      <p className="hint">Le fichier est analysé dans votre appareil. Il n'est pas conservé.</p>
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
            <div><span>Correspondances exactes</span><strong>{result.matched.length}</strong></div>
            <div><span>Ventilations possibles</span><strong>{result.splits.length}</strong></div>
            <div><span>Absentes de Mon Foyer</span><strong>{result.missing.length}</strong></div>
            <div><span>En trop dans Mon Foyer</span><strong>{result.extra.length}</strong></div>
          </div>

          {result.splits.length > 0 && (
            <details className="audit-details" open>
              <summary>Ventilations détectées ({result.splits.length})</summary>
              {result.splits.map(({ bank, app }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {money(bank.amount)}</strong>
                  <span>{app.map((row) => `${row.label} (${money(row.amount)})`).join(' + ')}</span>
                </article>
              ))}
            </details>
          )}

          {result.missing.length > 0 && (
            <details className="audit-details">
              <summary>Opérations Belfius absentes ({result.missing.length})</summary>
              {result.missing.map((row) => (
                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.amount)}</span></article>
              ))}
            </details>
          )}

          {result.extra.length > 0 && (
            <details className="audit-details">
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
