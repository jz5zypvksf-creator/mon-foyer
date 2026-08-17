import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';
import { calculateBankAuditSummary } from './lib/budgetMetrics.js';

const money = (value) => new Intl.NumberFormat('fr-BE', {
  style: 'currency', currency: 'EUR',
}).format(Number(value) || 0);

const AMOUNT_TOLERANCE = 0.05;
const DATE_TOLERANCE_DAYS = 2;
const DAY_MS = 86400000;
const AUDIT_STORAGE_KEY = 'mon-foyer-belfius-audit-v1';
const LEARNING_STORAGE_KEY = 'mon-foyer-belfius-learning-v1';

function loadLearnedRules() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNING_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLearnedRules(rules) {
  localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(rules));
}

function loadPersistedAudit() {
  try {
    const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.rows && Array.isArray(parsed.rows) ? parsed : null;
  } catch {
    return null;
  }
}

function persistAudit(audit) {
  try {
    if (!audit) localStorage.removeItem(AUDIT_STORAGE_KEY);
    else localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(audit));
  } catch {
    // Un échec de stockage local ne doit jamais bloquer l'audit courant.
  }
}

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

function calculateCsvMonthOpening(audit) {
  const month = parseBalanceMonth(audit?.balanceDate);
  const cutoff = parseBalanceDate(audit?.balanceDate);
  if (!month || !cutoff) return { month: '', balance: null };
  const monthMovement = (audit.rows || [])
    .filter((row) => String(row.date || '').startsWith(month) && row.date <= cutoff)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { month, balance: Number(audit.balance || 0) - monthMovement };
}

function detectSavingsTransfers(rows) {
  const totals = {};
  const transfers = [];
  (rows || []).forEach((row) => {
    const rule = classifyBankBusinessRule(row);
    if (!rule || rule.kind !== 'internal-savings-transfer') return;
    const amount = Math.abs(Number(row.amount) || 0);
    totals[rule.bucket] = (totals[rule.bucket] || 0) + amount;
    transfers.push({ bucket: rule.bucket, amount, date: row.date, label: row.label, orderReference: rule.orderReference || '', communication: row.communication || '', fingerprint: [row.date, Number(row.amount).toFixed(2), rule.orderReference || normalize(row.label), normalize(row.communication || row.details)].join('|') });
  });
  return { totals, transfers };
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

function recurringFreeCommunicationMatch(bankRow, expense) {
  const expected = normalize(expense?.freeCommunication || expense?.free_communication || '');
  if (!expected) return false;
  const actual = normalize(bankRow?.communication || bankRow?.details || '');
  if (!actual) return false;
  const mode = expense?.freeCommunicationMode || expense?.free_communication_mode || 'contains';
  return mode === 'exact' ? actual === expected : actual.includes(expected);
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
  const identityCandidates = (recurringExpenses || []).filter((expense) => {
    const recurringAmount = Math.abs(Number(expense.amount) || 0);
    return recurringBelongsToAppRow(expense, appRow)
      && Math.abs(recurringAmount - operationAmount) <= AMOUNT_TOLERANCE;
  });

  // L'empreinte bancaire est prioritaire sur le jour théorique du prélèvement.
  if (bankCommunication) {
    const exactCommunication = identityCandidates.find((expense) => {
      const expected = recurringCommunication(expense);
      return expected && (bankCommunication.includes(expected) || expected.includes(bankCommunication));
    });
    if (exactCommunication) return { ...exactCommunication, __communicationMatch: true };
  }
  const freeCommunication = identityCandidates.find((expense) => recurringFreeCommunicationMatch(bankRow, expense));
  if (freeCommunication) return { ...freeCommunication, __freeCommunicationMatch: true };

  const datedCandidates = identityCandidates.filter((expense) => {
    const recurringDay = Number(expense.day) || 1;
    return Math.abs(recurringDay - day) <= DATE_TOLERANCE_DAYS;
  });
  return datedCandidates[0] || null;
}

function learnedBankIdentityMatches(rule, bankRow) {
  if (!rule || !bankRow) return false;
  if (normalize(rule.bankLabel) !== normalize(bankRow.label)) return false;
  const expectedStructured = normalizedCommunication(rule.structuredCommunication || '');
  if (expectedStructured) {
    const actual = normalizedCommunication(bankRow.structuredCommunication || bankRow.communication);
    return actual.includes(expectedStructured);
  }
  const expectedFree = normalize(rule.freeCommunication || '');
  if (expectedFree) {
    const actualFree = normalize(bankRow.communication || bankRow.details || '');
    return actualFree === expectedFree || actualFree.includes(expectedFree);
  }
  return true;
}

function isBeobankSavingsTransfer(row) {
  if (!row || Number(row.amount) >= 0) return false;
  return normalize(`${row.label || ''} ${row.communication || ''} ${row.details || ''}`).includes('beobank');
}

function isBeobankSavingsAppRow(row) {
  const text = normalize(`${row?.label || ''} ${row?.store || ''}`);
  return text.includes('beobank') || text.includes('epargne loisirs') || text.includes('epargne vacances');
}

function learnedTargetMatches(rule, appRow) {
  if (!rule?.target || !appRow) return false;
  const target = rule.target;
  if (target.label && normalize(target.label) === normalize(appRow.label)) return true;
  if (target.category && target.category === appRow.category) {
    if (!target.store) return true;
    return normalize(target.store) === normalize(appRow.store || '');
  }
  return false;
}

function learnedEvidence(bankRow, appRow, learnedRules) {
  const rule = (learnedRules || []).find((item) => learnedBankIdentityMatches(item, bankRow) && learnedTargetMatches(item, appRow));
  if (!rule) return null;
  return {
    auto: true,
    confidence: 100,
    reason: 'Correspondance apprise et confirmée précédemment',
    recurring: null,
    learned: true,
  };
}

function suggestionForBankRow(bankRow, learnedRules) {
  const rule = (learnedRules || []).find((item) => learnedBankIdentityMatches(item, bankRow));
  return rule?.target || null;
}

function matchEvidence(bankRow, appRow, recurringExpenses, learnedRules = []) {
  const amountDelta = Math.abs(Math.abs(Number(appRow.amount) || 0) - Math.abs(bankRow.amount));
  const dayDelta = dateDistance(bankRow.date, appRow.date);
  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income');
  if (!directionMatches || amountDelta > AMOUNT_TOLERANCE) return null;

  const learned = learnedEvidence(bankRow, appRow, learnedRules);
  if (learned && dayDelta <= 7) return learned;
  if (dayDelta > DATE_TOLERANCE_DAYS) return null;

  const directLabel = labelsLikelyMatch(bankRow, appRow);
  const alias = aliasMatch(bankRow, appRow);
  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);

  if (recurring && recurring.__freeCommunicationMatch) {
    return {
      auto: true,
      confidence: 100,
      reason: `Communication libre Belfius reconnue + frais récurrent : ${recurring.label}`,
      recurring,
    };
  }
  if (recurring && recurring.__communicationMatch) {
    return {
      auto: true,
      confidence: 100,
      reason: `Communication structurée Belfius + frais récurrent : ${recurring.label}`,
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

function recurringFingerprintMatchesBankRow(bankRow, expense) {
  if (!bankRow || !expense || bankRow.amount >= 0) return false;
  const recurringAmount = Math.abs(Number(expense.amount) || 0);
  const bankAmount = Math.abs(Number(bankRow.amount) || 0);
  if (Math.abs(recurringAmount - bankAmount) > AMOUNT_TOLERANCE) return false;

  const expectedStructured = recurringCommunication(expense);
  const actualStructured = normalizedCommunication(bankRow.structuredCommunication || bankRow.communication);
  const structuredMatch = Boolean(
    expectedStructured
    && actualStructured
    && (actualStructured.includes(expectedStructured) || expectedStructured.includes(actualStructured)),
  );

  return structuredMatch || recurringFreeCommunicationMatch(bankRow, expense);
}

function recurringCompatibleWithGroupedApp(expense, appRow) {
  if (!expense || !appRow) return false;
  if (expense.category && appRow.category && expense.category === appRow.category) return true;

  const recurringLabel = normalize(expense.label);
  const operationLabel = normalize(appRow.label);
  if (!recurringLabel || !operationLabel) return false;

  const recurringTokens = recurringLabel.split(' ').filter((token) => token.length >= 5);
  const operationTokens = operationLabel.split(' ').filter((token) => token.length >= 5);
  const commonTokens = recurringTokens.filter((token) => operationTokens.includes(token));
  return commonTokens.length >= 1;
}

function recurringFingerprintForGroupedBankRow(bankRow, appRow, recurringExpenses) {
  return (recurringExpenses || []).find((expense) => (
    recurringCompatibleWithGroupedApp(expense, appRow)
    && recurringFingerprintMatchesBankRow(bankRow, expense)
  ));
}

function possibleBankGroup(appRow, indexedBankRows, recurringExpenses) {
  const directionIsIncome = appRow.type === 'income';
  const target = Math.abs(Number(appRow.amount) || 0);
  const compatible = indexedBankRows
    .filter(({ row }) => ((row.amount > 0) === directionIsIncome))
    .filter(({ row }) => dateDistance(row.date, appRow.date) <= DATE_TOLERANCE_DAYS)
    .map((candidate) => ({
      ...candidate,
      recurringFingerprint: recurringFingerprintForGroupedBankRow(candidate.row, appRow, recurringExpenses),
    }))
    .filter(({ row, recurringFingerprint }) => (
      aliasMatch(row, appRow)
      || labelsLikelyMatch(row, appRow)
      || Boolean(recurringFingerprint)
    ));

  // Lorsqu'une empreinte bancaire est disponible, elle prime sur le libellé générique du bénéficiaire.
  const fingerprintCandidates = compatible.filter(({ recurringFingerprint }) => recurringFingerprint);
  if (fingerprintCandidates.length >= 2) {
    const subset = findSubsetByAmount(fingerprintCandidates, target, ({ row }) => row.amount, 12);
    if (subset) return { rows: subset, fingerprintValidated: true };
  }

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
    if (subset) return { rows: subset, fingerprintValidated: false };
  }
  return null;
}

function reconcile(bankRows, operations, selectedMonth, recurringExpenses, learnedRules = []) {
  const auditMonth = selectedMonth || new Date().toISOString().slice(0, 7);
  // Les transferts vers Beobank sont des transferts internes d'épargne Vacances/Loisirs.
  // Ils sont pris en charge par detectSavingsTransfers et ne participent jamais au moteur
  // de correspondances de dépenses/revenus (sinon un même montant peut proposer Mega, etc.).
  const monthBankRows = bankRows
    .filter((row) => String(row.date || '').slice(0, 7) === auditMonth)
    .filter((row) => !isBeobankSavingsTransfer(row))
    .map((row) => ({ ...row }));
  const appRows = operations
    .filter((row) => (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius')
    .filter((row) => !String(row.label || '').startsWith('Ajustement Belfius'))
    .filter((row) => !isBeobankSavingsAppRow(row))
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
        evidence: usedApp.has(index) ? null : matchEvidence(bankRow, row, recurringExpenses, learnedRules),
      }))
      .filter(({ evidence }) => evidence)
      .sort((left, right) => right.evidence.confidence - left.evidence.confidence
        || dateDistance(left.row.date, bankRow.date) - dateDistance(right.row.date, bankRow.date));

    const automatic = candidates.filter(({ evidence }) => evidence.auto);
    const learnedAutomatic = automatic.filter(({ evidence }) => evidence.learned || String(evidence.reason || '').toLowerCase().includes('apprise'));
    if (learnedAutomatic.length === 1) { const selected = learnedAutomatic[0]; usedBank.add(bankIndex); usedApp.add(selected.index); matched.push({ bank: bankRow, app: selected.row, ...selected.evidence }); return; }
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
    const group = possibleBankGroup(appRow, availableBank, recurringExpenses);
    if (!group) return;

    group.rows.forEach(({ index }) => usedBank.add(index));
    usedApp.add(appIndex);
    groups.push({
      bank: group.rows.map(({ row }) => row),
      app: appRow,
      confidence: group.fingerprintValidated ? 100 : 99,
      reason: group.fingerprintValidated
        ? 'Regroupement validé par empreintes Belfius récurrentes et total exact'
        : 'Regroupement validé par bénéficiaire/alias et total exact',
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
  onAuditSnapshot,
  onEditAppOperation,
}) {
  // RC2.4.4 : le dernier relevé reste disponible entre les ouvertures de l'application.
  const [audit, setAudit] = useState(loadPersistedAudit);
  const [error, setError] = useState('');
  const [learnedRules, setLearnedRules] = useState(loadLearnedRules);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const synchronizationKey = useRef('');
  const result = useMemo(
    () => audit ? reconcile(audit.rows, operations, selectedMonth, recurringExpenses, learnedRules) : null,
    [audit, learnedRules, operations, recurringExpenses, selectedMonth],
  );

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    synchronizationKey.current = '';
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('windows-1252').decode(buffer);
      const parsedAudit = {
        ...parseBelfius(text),
        importedAt: new Date().toISOString(),
        fileName: file.name || 'Export Belfius.csv',
      };
      setAudit(parsedAudit);
      persistAudit(parsedAudit);
      if (typeof onSavingsDetected === 'function') {
        onSavingsDetected(detectSavingsTransfers(parsedAudit.rows), parsedAudit);
      }
    } catch (exception) {
      setAudit(null);
      setError(exception.message || "Le fichier n'a pas pu être analysé.");
    }
  };

  const confirmMatch = (bankRow, appRow) => {
    const rule = {
      id: crypto.randomUUID(),
      bankLabel: bankRow.label || '',
      structuredCommunication: bankRow.structuredCommunication || '',
      freeCommunication: bankRow.communication || '',
      target: {
        label: appRow.label || '',
        category: appRow.category || '',
        store: appRow.store || '',
        person: appRow.person || 'Foyer',
        type: appRow.type || 'variable',
      },
      confirmedAt: new Date().toISOString(),
    };
    const sameIdentity = (item) => {
      if (normalize(item.bankLabel) !== normalize(rule.bankLabel)) return false;
      const oldStructured = normalizedCommunication(item.structuredCommunication || '');
      const newStructured = normalizedCommunication(rule.structuredCommunication || '');
      if (oldStructured || newStructured) return oldStructured === newStructured;
      const oldFree = normalize(item.freeCommunication || '');
      const newFree = normalize(rule.freeCommunication || '');
      if (oldFree || newFree) return oldFree === newFree;
      return true;
    };
    const nextRules = [...learnedRules.filter((item) => !sameIdentity(item)), rule];
    persistLearnedRules(nextRules);
    setLearnedRules(nextRules);
    setConfirmationMessage('Correspondance validée et mémorisée : ' + bankRow.label + ' → ' + appRow.label + '.');
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
  const csvMonthOpening = calculateCsvMonthOpening(audit);
  const canSynchronize = false; // RC2.4.6 : le CSV reste une référence de contrôle, jamais une écriture silencieuse.
  const isBalanced = auditIsClean && Math.abs(difference) < 0.01;
  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;
  const {
    pendingAmount,
    expectedBankBalance,
    unexplainedAmount,
  } = calculateBankAuditSummary({
    bankBalance: audit?.balance,
    pendingRows: actionableExtra,
    missingBankRows: monthMissing,
    reviewRows: result?.review || [],
  });

  useEffect(() => {
    if (!audit || typeof onAuditSnapshot !== 'function') return;
    onAuditSnapshot({
      balance: Number(audit.balance || 0),
      balanceDate: audit.balanceDate || '',
      importedAt: audit.importedAt || '',
      pendingAmount,
      remaining: remainingToTreat,
      confirmations: result?.review.length || 0,
      anomalies: monthMissing.length + actionableExtra.length,
      clean: auditIsClean && Math.abs(difference) < 0.01,
      sourceFile: audit.fileName || 'CSV Belfius',
      openingMonth: csvMonthOpening.month,
      openingBalance: csvMonthOpening.balance,
    });
  }, [audit?.balance, audit?.balanceDate, audit?.importedAt, auditIsClean, csvMonthOpening.balance, csvMonthOpening.month, difference, monthMissing.length, actionableExtra.length, pendingAmount, remainingToTreat, result?.review.length]);

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
      {confirmationMessage && (
        <p className="hint audit-confirmation-message"><CheckCircle2 size={15} /> {confirmationMessage}</p>
      )}
      {audit && (
        <p className="hint">
          Relevé Belfius mémorisé · {audit.fileName || 'CSV Belfius'} · {remainingToTreat} opération(s) restant à traiter.
          Tu peux quitter l'application et reprendre l'audit sans recharger le fichier.
        </p>
      )}
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
            <div><span>Solde bancaire relevé</span><strong>{money(audit.balance)}</strong></div>
            <div><span>Opérations enregistrées en attente</span><strong className={pendingAmount < 0 ? 'negative' : 'positive'}>{money(pendingAmount)}</strong></div>
            <div><span>Solde bancaire attendu</span><strong>{money(expectedBankBalance)}</strong></div>
            <div><span>Écart inexpliqué</span><strong className={Math.abs(unexplainedAmount) < 0.01 ? 'positive' : 'negative'}>{money(unexplainedAmount)}</strong></div>
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
                  <div className="audit-review-proposals">
                    <span>{reason}</span>
                    {candidates.map((candidate) => (
                      <div className="audit-review-choice" key={candidate.app.id}>
                        <span>{candidate.app.label} ({candidate.confidence}%)</span>
                        <div className="audit-review-actions">
                          <button type="button" className="audit-confirm" onClick={() => confirmMatch(bank, candidate.app)}>✓ Valider</button>
                          {typeof onEditAppOperation === 'function' && (
                            <button type="button" className="audit-correct" onClick={() => onEditAppOperation(candidate.app)}>Corriger</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {typeof onAddBankOperation === 'function' && (
                      <button type="button" className="audit-none" onClick={() => onAddBankOperation({ ...bank, learnedSuggestion: suggestionForBankRow(bank, learnedRules) })}>Aucune proposition / créer</button>
                    )}
                  </div>
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
                      <button type="button" className="audit-pencil" title="Enregistrer dans Mon Foyer" aria-label={`Enregistrer ${row.label} dans Mon Foyer`} onClick={() => onAddBankOperation({ ...row, learnedSuggestion: suggestionForBankRow(row, learnedRules) })}>
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
