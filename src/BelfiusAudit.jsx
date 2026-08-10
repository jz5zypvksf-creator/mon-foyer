import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('fr-BE', {
  style: 'currency', currency: 'EUR',
}).format(Number(value) || 0);

const AMOUNT_TOLERANCE = 0.05;
const DATE_TOLERANCE_DAYS = 2;
const DAY_MS = 86400000;

// RC2.1 — référentiel explicite des principaux libellés bancaires.
// Les termes d'application sont volontairement larges uniquement lorsque le bénéficiaire
// permet d'identifier une famille fiable. Un alias ne valide jamais le montant à lui seul.
const BELFIUS_ALIASES = [
  { bank: ['donate jw org', 'donate jw'], app: ['jw donate', 'donate jw'] },
  { bank: ['setca'], app: ['syndicat'] },
  { bank: ['ag insurance'], app: ['ag assurance', 'remboursement maison esther'] },
  { bank: ['sd worx'], app: ['salaire alain'] },
  { bank: ['rexel belgium'], app: ['salaire esther'] },
  { bank: ['stellantis financial', 'psa finance'], app: ['psa finance'] },
  { bank: ['mega power online', 'mega'], app: ['mega'] },
  { bank: ['proximus'], app: ['proximus', 'tv internet', 'gsm'] },
  { bank: ['test achats', 'test aankoop'], app: ['test achats'] },
  { bank: ['dats24', 'q8 easy', 'total'], app: ['carburant', 'essence', 'diesel'] },
  {
    bank: ['delhaize', 'lidl', 'carrefour', 'colruyt'],
    app: ['courses', 'nourriture', 'alimentaire', 'produits menagers', 'sanitaire', 'hygiene'],
  },
  { bank: ['pluxee'], app: ['cheques repassage', 'cheques repas', 'pluxee'] },
  { bank: ['ethias'], app: ['ethias maison', 'emprunt maison'] },
  { bank: ['lanza michel'], app: ['coiffeur', 'soins personnels'] },
];

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

function parseBalanceDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? match[3] + '-' + match[2] + '-' + match[1] : '';
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


function extractStructuredCommunication(value) {
  const raw = String(value || '');
  const formatted = raw.match(/\+{3}\s*\d{3}\/\d{4}\/\d{5}\s*\+{3}/);
  if (formatted) return formatted[0].replace(/\s/g, '');
  const digits = raw.replace(/\D/g, '');
  return digits.length === 12 ? digits : '';
}

function normalizedCommunication(value) {
  return String(value || '').replace(/\D/g, '');
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
      communication: cells[communicationIndex] || '',
      structuredCommunication: extractStructuredCommunication(cells[communicationIndex] || ''),
    }))
    .filter((row) => row.date && row.amount !== 0);

  return {
    balance: parseAmount(balanceLine?.split(';')[1]),
    balanceDate: balanceDateLine?.split(';')[1] || '',
    rows,
  };
}

function detectSavingsTransfers(rows) {
  const totals = {};
  const add = (key, amount) => { totals[key] = (totals[key] || 0) + Math.abs(Number(amount) || 0); };

  (rows || []).forEach((row) => {
    if (row.amount >= 0) return;
    const text = normalize(`${row.label || ''} ${row.communication || ''} ${row.details || ''}`);
    const amount = Math.abs(Number(row.amount) || 0);

    if (text.includes('pour voiture') || text.includes('epargne voiture')) { add('voiture', amount); return; }
    if (text.includes('vacances') || text.includes('epargne vacances')) { add('vacances', amount); return; }
    if (text.includes('fonds urgence') || text.includes('fonds d urgence') || text.includes('epargne urgence')) { add('urgence', amount); return; }
    if (text.includes('epargne maison') || text.includes('reserve maison')) { add('maison', amount); return; }
    if (text.includes('pension') || (text.includes('ethias') && Math.abs(amount - 110) <= AMOUNT_TOLERANCE)) { add('pension', amount); return; }
  });

  return totals;
}

function labelText(bankRow) {
  return normalize(`${bankRow.label} ${bankRow.details}`);
}

function appText(appRow) {
  return normalize(`${appRow.label} ${appRow.store || ''}`);
}

function labelsLikelyMatch(bankRow, appRow) {
  const bankLabel = labelText(bankRow);
  const appLabel = appText(appRow);
  if (!appLabel || !bankLabel) return false;
  const tokens = appLabel.split(' ').filter((token) => token.length >= 5);
  return bankLabel.includes(appLabel)
    || appLabel.includes(bankLabel)
    || tokens.some((token) => bankLabel.includes(token));
}

function aliasMatch(bankRow, appRow) {
  const bankLabel = labelText(bankRow);
  const applicationLabel = appText(appRow);
  return BELFIUS_ALIASES.some((alias) => (
    alias.bank.some((needle) => bankLabel.includes(needle))
    && alias.app.some((needle) => applicationLabel.includes(needle))
  ));
}

function bankHasKnownAlias(bankRow) {
  const bankLabel = labelText(bankRow);
  return BELFIUS_ALIASES.some((alias) => alias.bank.some((needle) => bankLabel.includes(needle)));
}


function recurringCommunication(expense) {
  return normalizedCommunication(
    expense?.structuredCommunication
    || expense?.structured_communication
    || expense?.communication
    || expense?.ocr
    || '',
  );
}

function recurringBelongsToAppRow(expense, appRow) {
  if (!expense || !appRow) return false;
  const expenseLabel = normalize(expense.label);
  const operationLabel = normalize(appRow.label);
  const labelCompatible = expenseLabel && operationLabel
    && (expenseLabel.includes(operationLabel) || operationLabel.includes(expenseLabel));
  const categoryCompatible = expense.category && appRow.category && expense.category === appRow.category;
  const personCompatible = expense.person && appRow.person && expense.person === appRow.person;
  return labelCompatible || (categoryCompatible && personCompatible);
}

function findRecurringMatch(bankRow, appRow, recurringExpenses) {
  if (bankRow.amount >= 0 || appRow.type === 'income') return null;
  const operationAmount = Math.abs(Number(appRow.amount) || 0);
  const day = Number(appRow.date?.slice(8, 10));
  const bankCommunication = normalizedCommunication(bankRow.structuredCommunication || bankRow.communication);
  const candidates = (recurringExpenses || []).filter((expense) => {
    const recurringAmount = Math.abs(Number(expense.amount) || 0);
    const recurringDay = Number(expense.day) || 1;
    return recurringBelongsToAppRow(expense, appRow)
      && Math.abs(recurringAmount - operationAmount) <= AMOUNT_TOLERANCE
      && Math.abs(recurringDay - day) <= DATE_TOLERANCE_DAYS;
  });
  if (bankCommunication) {
    const exactCommunication = candidates.find((expense) => recurringCommunication(expense) === bankCommunication);
    if (exactCommunication) return { ...exactCommunication, __communicationMatch: true };
  }
  return candidates[0] || null;
}

function matchEvidence(bankRow, appRow, recurringExpenses) {
  const amountDelta = Math.abs(Math.abs(Number(appRow.amount) || 0) - Math.abs(bankRow.amount));
  const dayDelta = dateDistance(bankRow.date, appRow.date);
  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income');
  if (!directionMatches || amountDelta > AMOUNT_TOLERANCE || dayDelta > DATE_TOLERANCE_DAYS) return null;

  const directLabel = labelsLikelyMatch(bankRow, appRow);
  const alias = aliasMatch(bankRow, appRow);
  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);

  if (recurring && recurring.__communicationMatch) {
    return {
      auto: true,
      confidence: 100,
      reason: `Communication structurée + frais récurrent : ${recurring.label}`,
      recurring,
    };
  }
  if (recurring && (directLabel || alias || !bankHasKnownAlias(bankRow))) {
    return {
      auto: true,
      confidence: directLabel || alias ? 100 : 96,
      reason: `Frais récurrent réellement lié : ${recurring.label}`,
      recurring,
    };
  }
  if (alias) {
    return {
      auto: true,
      confidence: dayDelta === 0 ? 99 : 97,
      reason: 'Montant, date et alias Belfius concordants',
      recurring: null,
    };
  }
  if (directLabel) {
    return {
      auto: true,
      confidence: dayDelta === 0 ? 99 : 97,
      reason: 'Montant, date et libellé concordants',
      recurring: null,
    };
  }

  // Montant/date seuls ne sont plus une preuve suffisante : ils deviennent une proposition.
  return {
    auto: false,
    confidence: dayDelta === 0 ? 82 : 74,
    reason: dayDelta === 0
      ? 'Même montant et même date, mais bénéficiaire non confirmé'
      : 'Même montant et date proche, mais bénéficiaire non confirmé',
    recurring: null,
  };
}

function findSubsetByAmount(candidates, target, amountSelector, maxCandidates = 14) {
  const safeCandidates = candidates.slice(0, maxCandidates);
  for (let mask = 1; mask < (1 << safeCandidates.length); mask += 1) {
    const selected = [];
    let total = 0;
    for (let index = 0; index < safeCandidates.length; index += 1) {
      if (mask & (1 << index)) {
        selected.push(safeCandidates[index]);
        total += Math.abs(Number(amountSelector(safeCandidates[index])) || 0);
      }
    }
    if (selected.length > 1 && Math.abs(total - target) <= AMOUNT_TOLERANCE) return selected;
  }
  return null;
}

function possibleSplit(bankRow, indexedAppRows, recurringExpenses) {
  if (bankRow.amount >= 0) return null;
  const candidates = indexedAppRows
    .filter(({ row }) => row.type !== 'income')
    .filter(({ row }) => dateDistance(row.date, bankRow.date) <= DATE_TOLERANCE_DAYS)
    .filter(({ row }) => {
      // Un bénéficiaire connu ne peut être ventilé que vers une famille compatible.
      if (bankHasKnownAlias(bankRow)) return aliasMatch(bankRow, row) || labelsLikelyMatch(bankRow, row);
      const recurring = findRecurringMatch(bankRow, row, recurringExpenses);
      return labelsLikelyMatch(bankRow, row) || Boolean(recurring);
    });
  return findSubsetByAmount(candidates, Math.abs(bankRow.amount), ({ row }) => row.amount);
}

function bankBeneficiaryKey(row) {
  return normalize(row.label);
}

function possibleBankGroup(appRow, indexedBankRows) {
  const directionIsIncome = appRow.type === 'income';
  const target = Math.abs(Number(appRow.amount) || 0);
  const compatible = indexedBankRows
    .filter(({ row }) => ((row.amount > 0) === directionIsIncome))
    .filter(({ row }) => dateDistance(row.date, appRow.date) <= DATE_TOLERANCE_DAYS)
    .filter(({ row }) => aliasMatch(row, appRow) || labelsLikelyMatch(row, appRow));

  const byBeneficiary = new Map();
  compatible.forEach((candidate) => {
    const key = bankBeneficiaryKey(candidate.row);
    if (!key) return;
    const bucket = byBeneficiary.get(key) || [];
    bucket.push(candidate);
    byBeneficiary.set(key, bucket);
  });

  for (const candidates of byBeneficiary.values()) {
    if (candidates.length < 2) continue;
    const subset = findSubsetByAmount(candidates, target, ({ row }) => row.amount, 12);
    if (subset) return subset;
  }
  return null;
}

function reconcile(bankRows, operations, selectedMonth, recurringExpenses) {
  const auditMonth = selectedMonth || new Date().toISOString().slice(0, 7);
  const monthBankRows = bankRows
    .filter((row) => String(row.date || '').slice(0, 7) === auditMonth)
    .map((row) => ({ ...row }));
  const appRows = operations
    .filter((row) => (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius')
    .filter((row) => !String(row.label || '').startsWith('Ajustement Belfius'))
    .filter((row) => String(row.date || '').slice(0, 7) === auditMonth)
    .map((row) => ({ ...row, amount: Number(row.amount) || 0 }));

  const usedBank = new Set();
  const usedApp = new Set();
  const pendingBank = new Set();
  const pendingApp = new Set();
  const matched = [];
  const review = [];
  const splits = [];
  const groups = [];

  // 1) Correspondances 1 ↔ 1 : seules les preuves sémantiques fortes sont auto-validées.
  monthBankRows.forEach((bankRow, bankIndex) => {
    const candidates = appRows
      .map((row, index) => ({
        row,
        index,
        evidence: usedApp.has(index) ? null : matchEvidence(bankRow, row, recurringExpenses),
      }))
      .filter(({ evidence }) => evidence)
      .sort((left, right) => right.evidence.confidence - left.evidence.confidence
        || dateDistance(left.row.date, bankRow.date) - dateDistance(right.row.date, bankRow.date));

    const automatic = candidates.filter(({ evidence }) => evidence.auto);
    if (automatic.length === 1) {
      const selected = automatic[0];
      usedBank.add(bankIndex);
      usedApp.add(selected.index);
      matched.push({ bank: bankRow, app: selected.row, ...selected.evidence });
      return;
    }

    if (automatic.length > 1) {
      // Plusieurs candidats forts : ne pas choisir arbitrairement.
      pendingBank.add(bankIndex);
      automatic.forEach(({ index }) => pendingApp.add(index));
      review.push({
        bank: bankRow,
        candidates: automatic.map(({ row, evidence }) => ({ app: row, ...evidence })),
        reason: 'Plusieurs correspondances fiables possibles',
      });
      return;
    }

    // Montant/date seuls : proposition visible, jamais validation automatique.
    const proposals = candidates.filter(({ evidence }) => !evidence.auto);
    if (proposals.length > 0) {
      pendingBank.add(bankIndex);
      proposals.slice(0, 3).forEach(({ index }) => pendingApp.add(index));
      review.push({
        bank: bankRow,
        candidates: proposals.slice(0, 3).map(({ row, evidence }) => ({ app: row, ...evidence })),
        reason: proposals.length === 1
          ? 'Correspondance probable à confirmer'
          : 'Montant/date ambigus : confirmation nécessaire',
      });
    }
  });

  // 2) Regroupements n opérations Belfius → 1 opération Mon Foyer.
  // Ils exigent désormais une cohérence de bénéficiaire/alias.
  appRows.forEach((appRow, appIndex) => {
    if (usedApp.has(appIndex)) return;
    const availableBank = monthBankRows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !usedBank.has(index));
    const group = possibleBankGroup(appRow, availableBank);
    if (!group) return;

    group.forEach(({ index }) => usedBank.add(index));
    usedApp.add(appIndex);
    groups.push({
      bank: group.map(({ row }) => row),
      app: appRow,
      confidence: 99,
      reason: 'Regroupement validé par bénéficiaire/alias et total exact',
    });
  });

  // 3) Ventilations 1 opération Belfius → n opérations Mon Foyer.
  // Le total seul ne suffit plus : chaque ligne doit être cohérente avec le bénéficiaire.
  monthBankRows.forEach((bankRow, bankIndex) => {
    if (usedBank.has(bankIndex)) return;
    const availableApp = appRows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !usedApp.has(index));
    const split = possibleSplit(bankRow, availableApp, recurringExpenses);
    if (!split) return;

    usedBank.add(bankIndex);
    split.forEach(({ index }) => usedApp.add(index));
    splits.push({
      bank: bankRow,
      app: split.map(({ row }) => row),
      confidence: 98,
      reason: 'Ventilation validée par cohérence et total exact',
    });
  });

  const missing = monthBankRows
    .filter((row, index) => !usedBank.has(index) && !pendingBank.has(index))
    .filter((row) => String(row.date || '').slice(0, 7) === auditMonth);
  const extra = appRows
    .filter((row, index) => !usedApp.has(index) && !pendingApp.has(index))
    .filter((row) => String(row.date || '').slice(0, 7) === auditMonth);

  return {
    matched,
    review,
    splits,
    groups,
    missing,
    extra,
    bankRows: monthBankRows,
    appRows,
    auditMonth,
  };
}

export default function BelfiusAudit({
  operations,
  appBelfiusBalance,
  selectedMonth,
  recurringExpenses = [],
  onSynchronizeBelfiusBalance,
  onAddBankOperation,
  onSavingsDetected,
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
      const parsedAudit = parseBelfius(text);
      setAudit(parsedAudit);
      if (typeof onSavingsDetected === 'function') {
        onSavingsDetected(detectSavingsTransfers(parsedAudit.rows));
      }
    } catch (exception) {
      setAudit(null);
      setError(exception.message || "Le fichier n'a pas pu être analysé.");
    }
  };

  const safeMonth = result?.auditMonth || selectedMonth || '';
  const monthMissing = (result?.missing || []).filter((row) => String(row.date || '').slice(0, 7) === safeMonth);
  const monthExtra = (result?.extra || []).filter((row) => String(row.date || '').slice(0, 7) === safeMonth);
  const cutoffDate = parseBalanceDate(audit?.balanceDate);
  const futureExtra = monthExtra.filter((row) => cutoffDate && String(row.date || '') > cutoffDate);
  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate);
  const difference = audit ? Number(appBelfiusBalance || 0) - audit.balance : 0;
  const auditIsClean = Boolean(
    audit
    && result
    && monthMissing.length === 0
    && actionableExtra.length === 0
    && result.review.length === 0,
  );
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
            <div className="audit-kpi safe"><span><i className="audit-dot" />Correspondances sûres</span><strong>{result.matched.length}</strong></div>
            <div className="audit-kpi review"><span><i className="audit-dot" />À confirmer</span><strong>{result.review.length}</strong></div>
            <div className="audit-kpi split"><span><i className="audit-dot" />Ventilations</span><strong>{result.splits.length}</strong></div>
            <div className="audit-kpi group"><span><i className="audit-dot" />Regroupements</span><strong>{result.groups.length}</strong></div>
            <div className="audit-kpi future"><span><i className="audit-dot" />À venir</span><strong>{futureExtra.length}</strong></div>
            <div className="audit-kpi danger"><span><i className="audit-dot" />Anomalies Belfius</span><strong>{monthMissing.length}</strong></div>
            <div className="audit-kpi danger"><span><i className="audit-dot" />À vérifier Mon Foyer</span><strong>{actionableExtra.length}</strong></div>
          </div>

          {canSynchronize && (
            <p className="hint"><RefreshCw size={16} /> Rapprochement terminé : le solde Belfius de Mon Foyer est synchronisé automatiquement.</p>
          )}

          {result.matched.length > 0 && (
            <details className="audit-details status-safe">
              <summary><span className="audit-dot" />Correspondances sûres ({result.matched.length})</summary>
              {result.matched.map(({ bank, app, confidence, reason }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {money(bank.amount)}</strong>
                  <span>→ {app.label} · confiance {confidence}% · {reason}</span>
                </article>
              ))}
            </details>
          )}

          {result.review.length > 0 && (
            <details className="audit-details status-review" open>
              <summary><span className="audit-dot" />Correspondances à confirmer ({result.review.length})</summary>
              {result.review.map(({ bank, candidates, reason }) => (
                <article key={`review-${bank.id}`}>
                  <strong>{bank.date} · {bank.label} · {money(bank.amount)}</strong>
                  <span>
                    {reason} → {candidates.map(({ app, confidence }) => `${app.label} (${confidence}%)`).join(' / ')}
                  </span>
                </article>
              ))}
            </details>
          )}

          {result.groups.length > 0 && (
            <details className="audit-details status-group" open>
              <summary><span className="audit-dot" />Regroupements reconnus ({result.groups.length})</summary>
              {result.groups.map(({ bank, app, confidence, reason }) => (
                <article key={`${app.id}-${bank.map((row) => row.id).join('-')}`}>
                  <strong>{bank[0]?.date} · {bank[0]?.label} · {bank.map((row) => money(row.amount)).join(' + ')}</strong>
                  <span>→ {app.label} ({money(app.amount)}) · confiance {confidence}% · {reason}</span>
                </article>
              ))}
            </details>
          )}

          {result.splits.length > 0 && (
            <details className="audit-details status-split" open>
              <summary><span className="audit-dot" />Ventilations reconnues ({result.splits.length})</summary>
              {result.splits.map(({ bank, app, confidence, reason }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {money(bank.amount)}</strong>
                  <span>{app.map((row) => `${row.label} (${money(row.amount)})`).join(' + ')} · confiance {confidence}% · {reason}</span>
                </article>
              ))}
            </details>
          )}

          {monthMissing.length > 0 && (
            <details className="audit-details status-danger" open>
              <summary><span className="audit-dot" />Opérations Belfius absentes ({monthMissing.length})</summary>
              {monthMissing.map((row) => (
                <article key={row.id} className="audit-missing-row">
                  <strong>{row.date} · {row.label}</strong>
                  <span className="audit-missing-actions">
                    <b>{money(row.amount)}</b>
                    {typeof onAddBankOperation === 'function' && (
                      <button type="button" className="audit-pencil" title="Enregistrer dans Mon Foyer" aria-label={`Enregistrer ${row.label} dans Mon Foyer`} onClick={() => onAddBankOperation(row)}>
                        <Pencil size={17} />
                      </button>
                    )}
                  </span>
                </article>
              ))}
            </details>
          )}

          {futureExtra.length > 0 && (
            <details className="audit-details status-future" open>
              <summary><span className="audit-dot" />Opérations programmées — en attente du prochain relevé ({futureExtra.length})</summary>
              <p className="audit-section-note">Déjà enregistrées dans Mon Foyer, mais postérieures au dernier solde Belfius importé.</p>
              {futureExtra.map((row) => (
                <article key={row.id}><strong>{row.date} · {row.label}</strong><span className="audit-badge future">À venir · {money(row.type === 'income' ? row.amount : -row.amount)}</span></article>
              ))}
            </details>
          )}

          {actionableExtra.length > 0 && (
            <details className="audit-details status-danger" open>
              <summary><span className="audit-dot" />Opérations Mon Foyer à vérifier ({actionableExtra.length})</summary>
              {actionableExtra.map((row) => (
                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.type === 'income' ? row.amount : -row.amount)}</span></article>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
