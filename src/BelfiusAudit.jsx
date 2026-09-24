import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Pencil, Upload } from 'lucide-react';
import { classifyBankBusinessRule, hasStrongCommunicationFingerprint, isTrueOrphanAppOperation, shouldOfferAmountDateFallback, strongCommunicationMatch } from './belfiusMatchingRules.js';
import { calculateBankAuditSummary } from './lib/budgetMetrics.js';
import {
  isMastercardSettlementOperation,
  isMastercardStatementRow,
  mastercardStatementMatchEvidence,
} from './lib/mastercardStatementRules.js';
import { bankPersonAliasMatch, isBankCreditAppOperation } from './belfiusMatchingRules.js';
import { amountCents, formatMoney, moneyToCents } from './domain/money/money.js';
import { auditMonthlySavings, isSavingsAuditEntry } from './lib/monthlySavingsAudit.js';
import { auditJwDonationAllocation, isJwDonation } from './lib/donationAllocationRules.js';
import { loadPersistedAudit, persistAudit } from './lib/belfiusAuditStorage.js';
import { persistDurableLocalValue, readDurableLocalValue } from './lib/durableClientStorage.js';
import {
  bankRowFingerprint,
  confirmationForBankRow,
  confirmedRecurringIdsForBankRows,
  loadBankMatchConfirmations,
  mergeBankMatchConfirmations,
  persistBankMatchConfirmations,
} from './lib/belfiusConfirmationRules.js';
import matchingConfig from './matchingConfig.json' with { type: 'json' };

const AMOUNT_TOLERANCE_CENTS = matchingConfig.tolerances.amountCents;
const DATE_TOLERANCE_DAYS = matchingConfig.tolerances.generalDateDays;
const BANK_POSTING_GRACE_DAYS = matchingConfig.tolerances.bankPostingGraceDays;
const DAY_MS = 86400000;
const LEARNING_STORAGE_KEY = 'mon-foyer-belfius-learning-v1';

function loadLearnedRules() {
  try {
    const parsed = JSON.parse(readDurableLocalValue(LEARNING_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLearnedRules(rules) {
  persistDurableLocalValue(LEARNING_STORAGE_KEY, JSON.stringify(rules));
}

// RC2.1 — référentiel explicite des principaux libellés bancaires.
// Les termes d'application sont volontairement larges uniquement lorsque le bénéficiaire
// permet d'identifier une famille fiable. Un alias ne valide jamais le montant à lui seul.
const BELFIUS_ALIASES = matchingConfig.belfiusAliases;

export function parseDate(value) {
  const raw = String(value || '').trim();
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const local = raw.match(/\b(\d{2})[-/](\d{2})[-/](\d{2}|\d{4})\b/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : local
      ? { year: Number(local[3].length === 2 ? `20${local[3]}` : local[3]), month: Number(local[2]), day: Number(local[1]) }
      : null;
  if (!parts) return '';
  const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (candidate.getUTCFullYear() !== parts.year
    || candidate.getUTCMonth() + 1 !== parts.month
    || candidate.getUTCDate() !== parts.day) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseBalanceDate(value) {
  return parseDate(value);
}

function parseBalanceMonth(value) {
  return parseDate(value).slice(0, 7);
}

function dateDistance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs(Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) / DAY_MS;
}

function ledgerRowCanPostDuringAudit(row, auditMonth, bankRows) {
  const operationDate = String(row?.date || '');
  if (operationDate.slice(0, 7) === auditMonth) return true;
  if (!operationDate) return false;

  const operationIsCredit = isBankCreditAppOperation(row);
  return (bankRows || []).some((bankRow) => (
    String(bankRow?.date || '').slice(0, 7) === auditMonth
    && bankRow.date >= operationDate
    && dateDistance(bankRow.date, operationDate) <= BANK_POSTING_GRACE_DAYS
    && (Number(bankRow.amount || 0) > 0) === operationIsCredit
  ));
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

function parseCsvLine(line, maxCells = Number.POSITIVE_INFINITY) {
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
      if (cells.length >= maxCells) return cells;
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

export function parseBelfius(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const balanceLine = lines.find((line) => normalize(line).startsWith('dernier solde'));
  const balanceDateLine = lines.find((line) => normalize(line).startsWith('date heure du dernier solde'));
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalize(line);
    return normalized.includes('date de comptabilisation') && normalized.includes('montant') && normalized.includes('compte contrepartie');
  });
  if (headerIndex < 0) throw new Error("Le format du fichier Belfius n'a pas été reconnu.");

  // Un export Excel Belfius peut être artificiellement étendu jusqu'à 16 384
  // colonnes. Les champs métier sont dans les premières colonnes : le reste ne
  // doit jamais être découpé ni recopié en mémoire.
  const headers = parseCsvLine(lines[headerIndex], 64).map(normalize);
  const dateIndex = headers.findIndex((header) => header === 'date de comptabilisation');
  const amountIndex = headers.findIndex((header) => header === 'montant');
  const nameIndex = headers.findIndex((header) => header.includes('nom contrepartie'));
  const transactionIndex = headers.findIndex((header) => header === 'transaction');
  const communicationIndex = headers.findIndex((header) => header === 'communications');
  const valueDateIndex = headers.findIndex((header) => header === 'date valeur');
  if ([dateIndex, amountIndex, nameIndex, transactionIndex, communicationIndex].some((index) => index < 0)) {
    throw new Error('Le CSV Belfius est incomplet : une ou plusieurs colonnes obligatoires sont absentes.');
  }
  const usefulIndexes = [dateIndex, amountIndex, nameIndex, transactionIndex, communicationIndex, valueDateIndex]
    .filter((index) => index >= 0);
  const usefulColumnCount = Math.max(...usefulIndexes) + 1;

  const sourceRows = lines.slice(headerIndex + 1)
    .filter((line) => line.trim())
    .map((line) => parseCsvLine(line, usefulColumnCount));
  const parsedRows = sourceRows.map((cells, index) => {
    const rawAmount = cells[amountIndex];
    const cents = moneyToCents(rawAmount);
    const beneficiaryRaw = String(cells[nameIndex] || cells[transactionIndex]
      || cells[communicationIndex] || 'Opération Belfius').trim();
    return {
      id: `bank-${index}`,
      date: parseDate(cells[dateIndex]),
      bookingDate: parseDate(cells[dateIndex]),
      valueDate: parseDate(cells[valueDateIndex]),
      amount: cents / 100,
      amountCents: cents,
      amountRaw: String(rawAmount || '').trim(),
      direction: cents < 0 ? 'debit' : 'credit',
      label: beneficiaryRaw,
      beneficiaryRaw,
      beneficiaryNormalized: normalize(beneficiaryRaw),
      transaction: cells[transactionIndex] || '',
      details: [cells[communicationIndex], cells[transactionIndex]].filter(Boolean).join(' '),
      communication: cells[communicationIndex] || '',
      structuredCommunication: extractStructuredCommunication(cells[communicationIndex] || ''),
      rawDetails: cells.slice(0, usefulColumnCount).join(' '),
    };
  });
  const rows = parsedRows.filter((row) => row.date && row.amountCents !== 0);
  const rejectedRows = parsedRows.filter((row) => !row.date || row.amountCents === 0);
  const balanceCents = moneyToCents(balanceLine?.split(';', 2)[1]);

  return {
    balance: balanceCents / 100,
    balanceCents,
    balanceDate: balanceDateLine?.split(';')[1] || '',
    rows,
    diagnostics: {
      sourceRowCount: sourceRows.length,
      parsedRowCount: rows.length,
      rejectedRowCount: rejectedRows.length,
      usefulColumnCount,
    },
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

function detectSavingsTransfers(rows, savingsGoals = []) {
  const totals = {};
  const transfers = [];
  (rows || []).forEach((row) => {
    const rule = classifyBankBusinessRule(row, savingsGoals);
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
  return bankPersonAliasMatch(bankRow, appRow) || BELFIUS_ALIASES.some((alias) => (
    alias.bank.some((needle) => bankLabel.includes(needle))
    && alias.app.some((needle) => applicationLabel.includes(needle))
  ));
}

const COMPENSATION_TOKEN_STOP_WORDS = new Set([
  'belfius', 'mobile', 'versement', 'virement', 'instantane', 'communication',
  'reference', 'compte', 'depuis', 'pour', 'valeur',
]);

function editDistance(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function meaningfulTokens(value) {
  return normalize(value).split(' ').filter((token) => (
    token.length >= 5 && !COMPENSATION_TOKEN_STOP_WORDS.has(token) && !/^\d+$/.test(token)
  ));
}

function compensationLabelsMatch(expenseRow, fundingRow) {
  const expenseTokens = meaningfulTokens(expenseRow?.label || expenseRow?.communication || '');
  const fundingTokens = meaningfulTokens(fundingRow?.communication || fundingRow?.label || '');
  return expenseTokens.some((expenseToken) => fundingTokens.some((fundingToken) => (
    expenseToken === fundingToken
    || (Math.min(expenseToken.length, fundingToken.length) >= 6 && editDistance(expenseToken, fundingToken) <= 1)
  )));
}

function isLikelySavingsFunding(row) {
  if (Number(row?.amount || 0) <= 0) return false;
  const text = normalize(`${row?.details || ''} ${row?.rawDetails || ''}`);
  return text.includes('versement du') || text.includes('transfert depuis');
}

function isSavingsWithdrawalAppRow(row) {
  const direction = row?.savingsDirection || row?.savings_direction || '';
  return direction === 'out' || normalize(row?.label || '').startsWith('transfert depuis epargne');
}

function findSavingsCompensations(bankRows, auditMonth) {
  const usedFunding = new Set();
  const expenses = (bankRows || []).filter((row) => (
    Number(row?.amount || 0) < 0 && String(row?.date || '').slice(0, 7) === auditMonth
  ));
  const fundingRows = (bankRows || [])
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => isLikelySavingsFunding(row));

  return expenses.flatMap((expense) => {
    const selected = fundingRows.find(({ row, index }) => (
      !usedFunding.has(index)
      && dateDistance(row.date, expense.date) <= DATE_TOLERANCE_DAYS
      && Math.abs(amountCents(row)) === Math.abs(amountCents(expense))
      && compensationLabelsMatch(expense, row)
    ));
    if (!selected) return [];
    usedFunding.add(selected.index);
    return [{
      funding: selected.row,
      expense,
      amount: Math.abs(Number(expense.amount) || 0),
      confidence: 99,
      reason: 'Retrait d’épargne compensatoire + facture bancaire, sans double dépense',
    }];
  });
}

function attachSavingsAppRows(compensations, operations, auditMonth) {
  const usedApp = new Set();
  return compensations.map((compensation) => {
    const candidate = (operations || []).find((row) => {
      if (usedApp.has(row.id) || !isSavingsWithdrawalAppRow(row)) return false;
      const budgetMonth = row?.budgetMonth || row?.budget_month || String(row?.date || '').slice(0, 7);
      return budgetMonth === auditMonth
        && dateDistance(row.date, compensation.funding.date) <= DATE_TOLERANCE_DAYS
        && Math.abs(amountCents(row)) === Math.abs(moneyToCents(compensation.amount));
    });
    if (candidate?.id) usedApp.add(candidate.id);
    return { ...compensation, appFunding: candidate || null };
  });
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

const RECURRING_INTERVAL_MONTHS = Object.freeze({ monthly: 1, quarterly: 3, semiannual: 6, annual: 12 });

function recurringOccursInMonth(expense, month) {
  const interval = RECURRING_INTERVAL_MONTHS[expense?.frequency || 'monthly'] || 1;
  const startMonth = String(expense?.startDate || expense?.start_date || `${month}-01`).slice(0, 7);
  const [startYear, startNumber] = startMonth.split('-').map(Number);
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (![startYear, startNumber, year, monthNumber].every(Number.isFinite)) return false;
  const distance = (year - startYear) * 12 + monthNumber - startNumber;
  return distance >= 0 && distance % interval === 0;
}

function recurringDateInMonth(expense, month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (!year || !monthNumber) return '';
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const day = Math.min(Math.max(Number(expense?.day) || 1, 1), lastDay);
  return `${month}-${String(day).padStart(2, '0')}`;
}

function recurringAlreadyRepresented(expense, operations, expectedDate) {
  const expectedAmountCents = Math.abs(amountCents(expense));
  const compatibleRows = (operations || []).filter((row) => (
    row?.type !== 'income'
    && row?.type !== 'reimbursement'
    && dateDistance(row?.date, expectedDate) <= DATE_TOLERANCE_DAYS
    && recurringBelongsToAppRow(expense, row)
  ));
  const directlyRepresented = compatibleRows.some((row) => (
    Math.abs(amountCents(row)) === expectedAmountCents
  ));
  if (directlyRepresented) return true;

  // Une récurrence globale peut déjà être ventilée en plusieurs écritures réelles
  // dans l'historique. Leur somme exacte neutralise alors la projection globale,
  // à condition que chaque ligne appartienne clairement au même bénéficiaire.
  const stronglyRelatedRows = compatibleRows.filter((row) => (
    labelsLikelyMatch({ label: expense?.label || '', details: '' }, row)
    || aliasMatch({ label: expense?.label || '', details: '' }, row)
  ));
  return Boolean(findSubsetByAmount(
    stronglyRelatedRows,
    expectedAmountCents,
    (row) => row.amount,
  ));
}

function recurringAuditCandidates(
  bankRows,
  recurringExpenses,
  persistedAppRows,
  auditMonth,
  confirmedRecurringIds = new Set(),
) {
  return (recurringExpenses || []).flatMap((expense) => {
    const paymentMethod = expense?.paymentMethod || expense?.payment_method || 'Compte Belfius';
    if (expense?.active === false || paymentMethod !== 'Compte Belfius') return [];
    if (!recurringOccursInMonth(expense, auditMonth) || Number(expense?.amount || 0) <= 0) return [];

    const date = recurringDateInMonth(expense, auditMonth);
    if (!date || recurringAlreadyRepresented(expense, persistedAppRows, date)) return [];
    const candidate = {
      id: `audit-recurring-${expense.id}-${auditMonth}`,
      date,
      amount: Math.abs(Number(expense.amount) || 0),
      amountCents: Math.abs(amountCents(expense)),
      type: 'fixed',
      category: expense.category || 'divers',
      person: expense.person || 'Foyer',
      paymentMethod,
      label: expense.label || 'Frais récurrent',
      projectedRecurring: true,
      recurringExpenseId: expense.id,
    };
    const hasCompatibleBankMovement = (bankRows || []).some((bankRow) => (
      Number(bankRow?.amount || 0) < 0
      && dateDistance(bankRow.date, date) <= DATE_TOLERANCE_DAYS
      && (aliasMatch(bankRow, candidate)
        || labelsLikelyMatch(bankRow, candidate)
        || Boolean(strongCommunicationMatch(bankRow, expense)))
    ));
    return hasCompatibleBankMovement || confirmedRecurringIds.has(String(expense.id || ''))
      ? [candidate]
      : [];
  });
}

function findRecurringMatch(bankRow, appRow, recurringExpenses) {
  if (amountCents(bankRow) >= 0 || appRow.type === 'income') return null;
  const operationAmount = Math.abs(amountCents(appRow));
  const day = Number(appRow.date?.slice(8, 10));
  const bankCommunication = normalizedCommunication(bankRow.structuredCommunication || bankRow.communication);
  const identityCandidates = (recurringExpenses || []).filter((expense) => {
    const recurringAmount = Math.abs(amountCents(expense));
    return recurringBelongsToAppRow(expense, appRow)
      && recurringAmount === operationAmount;
  });

  const directDebit = identityCandidates.find((expense) => ['direct-debit', 'bank-reference'].includes(strongCommunicationMatch(bankRow, expense)?.kind));
  if (directDebit) return { ...directDebit, __directDebitMatch: true };

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

function isBeobankSavingsTransfer(row, savingsGoals = []) {
  return Boolean(classifyBankBusinessRule(row, savingsGoals));
}

function isBeobankSavingsAppRow(row) {
  const text = normalize(`${row?.label || ''} ${row?.store || ''}`);
  return text.includes('beobank') || text.includes('epargne loisirs') || text.includes('epargne vacances');
}

function suggestionForBankRow(bankRow, learnedRules) {
  const rule = (learnedRules || []).find((item) => learnedBankIdentityMatches(item, bankRow));
  return rule?.target || null;
}

function matchEvidence(bankRow, appRow, recurringExpenses) {
  const isStatement = isMastercardStatementRow(bankRow);
  const isSettlement = isMastercardSettlementOperation(appRow);
  if (isStatement || isSettlement) {
    if (!isStatement || !isSettlement) return null;
    return mastercardStatementMatchEvidence(bankRow, appRow, {
      amountToleranceCents: AMOUNT_TOLERANCE_CENTS,
      dateToleranceDays: DATE_TOLERANCE_DAYS,
    });
  }

  const amountDeltaCents = Math.abs(Math.abs(amountCents(appRow)) - Math.abs(amountCents(bankRow)));
  const dayDelta = dateDistance(bankRow.date, appRow.date);
  const directionMatches = (amountCents(bankRow) > 0) === isBankCreditAppOperation(appRow);
  if (!directionMatches) return null;

  // Une référence bancaire forte appartient à son contrat. Un autre achat au
  // même montant ne peut pas la détourner ; un écart de montant reste visible
  // pour contrôle au lieu d'être validé ou supprimé.
  const referencedRecurring = (recurringExpenses || []).find((expense) => (
    ['direct-debit', 'bank-reference'].includes(strongCommunicationMatch(bankRow, expense)?.kind)
  ));
  if (referencedRecurring) {
    if (!recurringBelongsToAppRow(referencedRecurring, appRow)) return null;
    if (amountDeltaCents !== AMOUNT_TOLERANCE_CENTS) {
      return {
        auto: false,
        confidence: 95,
        reason: `Référence bancaire reconnue, mais montant différent de ${Math.abs(amountCents(referencedRecurring)) / 100} €`,
        recurring: referencedRecurring,
      };
    }
  } else if (amountDeltaCents !== AMOUNT_TOLERANCE_CENTS) return null;

  const directLabel = labelsLikelyMatch(bankRow, appRow);
  const alias = aliasMatch(bankRow, appRow);
  const directDebitRecurring = (recurringExpenses || []).find((expense) => recurringBelongsToAppRow(expense, appRow) && ['direct-debit', 'bank-reference'].includes(strongCommunicationMatch(bankRow, expense)?.kind));
  if (directDebitRecurring) return { auto: true, confidence: 100, reason: `Domiciliation Belfius reconnue : ${directDebitRecurring.label}`, recurring: directDebitRecurring };
  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);
  const strongBusinessIdentity = directLabel || alias || Boolean(recurring);
  if (dayDelta > DATE_TOLERANCE_DAYS && !(strongBusinessIdentity && dayDelta <= DATE_TOLERANCE_DAYS)) return null;

  if (recurring && recurring.__directDebitMatch) {
    return { auto: true, confidence: 100, reason: `Référence de domiciliation Belfius reconnue : ${recurring.label}`, recurring };
  }
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

  if (!shouldOfferAmountDateFallback(bankRow, recurringExpenses)) return null;

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

function findSubsetByAmount(candidates, targetCents, amountSelector, maxCandidates = 14) {
  const safeCandidates = candidates.slice(0, maxCandidates);
  for (let mask = 1; mask < (1 << safeCandidates.length); mask += 1) {
    const selected = [];
    let totalCents = 0;
    for (let index = 0; index < safeCandidates.length; index += 1) {
      if (mask & (1 << index)) {
        selected.push(safeCandidates[index]);
        totalCents += Math.abs(moneyToCents(amountSelector(safeCandidates[index])));
      }
    }
    if (selected.length > 1 && totalCents === targetCents) return selected;
  }
  return null;
}

function possibleSplit(bankRow, indexedAppRows, recurringExpenses) {
  if (bankRow.amount >= 0) return null;
  if (isMastercardStatementRow(bankRow)) return null;
  const candidates = indexedAppRows
    .filter(({ row }) => row.type !== 'income')
    .filter(({ row }) => dateDistance(row.date, bankRow.date) <= DATE_TOLERANCE_DAYS)
    .filter(({ row }) => {
      const recurringIdentity = (recurringExpenses || []).some((expense) => (
        recurringBelongsToAppRow(expense, row) && Boolean(strongCommunicationMatch(bankRow, expense))
      ));
      // Un bénéficiaire connu ne peut être ventilé que vers une famille compatible.
      if (bankHasKnownAlias(bankRow)) return aliasMatch(bankRow, row) || labelsLikelyMatch(bankRow, row) || recurringIdentity;
      const recurring = findRecurringMatch(bankRow, row, recurringExpenses);
      return labelsLikelyMatch(bankRow, row) || Boolean(recurring) || recurringIdentity;
    });
  return findSubsetByAmount(candidates, Math.abs(amountCents(bankRow)), ({ row }) => row.amount);
}

function fifoIdentity(row) {
  return [
    normalize(row?.label || ''),
    normalize(row?.store || ''),
    row?.type || '',
    row?.category || '',
    row?.person || 'Foyer',
    Math.abs(Number(row?.amount) || 0).toFixed(2),
  ].join('|');
}

function candidatesAreFifoEquivalent(candidates) {
  return candidates.length > 1 && new Set(candidates.map(({ row }) => fifoIdentity(row))).size === 1;
}

function bankBeneficiaryKey(row) {
  return normalize(row.label);
}

function recurringFingerprintMatchesBankRow(bankRow, expense) {
  if (!bankRow || !expense || amountCents(bankRow) >= 0) return false;
  const recurringAmount = Math.abs(amountCents(expense));
  const bankAmount = Math.abs(amountCents(bankRow));
  if (recurringAmount !== bankAmount) return false;

  const expectedStructured = recurringCommunication(expense);
  const actualStructured = normalizedCommunication(bankRow.structuredCommunication || bankRow.communication);
  const structuredMatch = Boolean(
    expectedStructured
    && actualStructured
    && (actualStructured.includes(expectedStructured) || expectedStructured.includes(actualStructured)),
  );

  return Boolean(strongCommunicationMatch(bankRow, expense)) || structuredMatch || recurringFreeCommunicationMatch(bankRow, expense);
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
  const target = Math.abs(amountCents(appRow));
  const compatible = indexedBankRows
    .filter(({ row }) => !isMastercardStatementRow(row))
    .filter(({ row }) => ((amountCents(row) > 0) === directionIsIncome))
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

/**
 * Rapproche un relevé bancaire et le grand livre sans créer ni modifier d’écriture.
 * Les correspondances automatiques exigent une preuve forte ; les cas ambigus restent
 * proposés à l’utilisateur pour confirmation explicite.
 */
function confirmationTargetMatches(target, appRow) {
  const targetRecurringId = String(target?.recurringExpenseId || target?.recurring_expense_id || '');
  const appRecurringId = String(appRow?.recurringExpenseId || appRow?.recurring_expense_id || '');
  if (targetRecurringId) return targetRecurringId === appRecurringId;
  const targetAppId = String(target?.appId || target?.app_id || '');
  return Boolean(targetAppId && targetAppId === String(appRow?.id || ''));
}

function confirmationForAssociation(bankRow, appRows, source = 'manual') {
  return {
    bankFingerprint: bankRow?.bankFingerprint || '',
    targets: appRows.map((appRow) => ({
      recurringExpenseId: appRow?.recurringExpenseId || appRow?.recurring_expense_id || '',
      appId: appRow?.id || '',
      label: appRow?.label || '',
      amountCents: Math.abs(amountCents(appRow)),
    })),
    source,
    confirmedAt: new Date().toISOString(),
  };
}

function sameConfirmationTargets(left, right) {
  const targetKey = (value) => (value?.targets || [])
    .map((target) => `${target.recurringExpenseId || ''}:${target.appId || ''}:${target.amountCents || 0}`)
    .sort()
    .join('|');
  return String(left?.bankFingerprint || '') === String(right?.bankFingerprint || '')
    && targetKey(left) === targetKey(right);
}

export function reconcileBelfiusRows(
  bankRows,
  operations,
  selectedMonth,
  recurringExpenses,
  learnedRules = [],
  savingsGoals = [],
  confirmedMatches = [],
) {
  const auditMonth = selectedMonth || new Date().toISOString().slice(0, 7);
  const donationAllocation = auditJwDonationAllocation(bankRows, operations, auditMonth,
    recurringExpenses.filter(expense => expense.active !== false && recurringOccursInMonth(expense, auditMonth)
      && (expense.paymentMethod || expense.payment_method || 'Compte Belfius') === 'Compte Belfius'));
  const allocatedDonationBank = new Set(donationAllocation?.bank || []);
  const allocatedDonationApp = new Set(donationAllocation?.app || []);
  const savingsExpenses = recurringExpenses.filter(expense => (
    expense.active !== false
    && (expense.paymentMethod || expense.payment_method || 'Compte Belfius') === 'Compte Belfius'
    && recurringOccursInMonth(expense, auditMonth)
    && Number(expense.amount) > 0
    && isSavingsAuditEntry(expense, savingsGoals)
  ));
  const savingsAudit = auditMonthlySavings(bankRows, savingsExpenses, auditMonth);
  // Savings are audited before expense filtering, using OP + month, not shared words.
  const savingsBankRows = new Set(savingsAudit.flatMap(entry => entry.bank));
  const expenseRecurrences = recurringExpenses.filter(expense => !isSavingsAuditEntry(expense, savingsGoals))
    .filter(expense => !donationAllocation || !isJwDonation(expense));
  const compensations = attachSavingsAppRows(findSavingsCompensations(bankRows, auditMonth), operations, auditMonth);
  const compensationFundingRows = new Set(compensations.map(({ funding }) => funding));
  const compensationAppRows = new Set(compensations.map(({ appFunding }) => appFunding).filter(Boolean));
  // Les transferts vers Beobank sont des transferts internes d'épargne Vacances/Loisirs.
  // Ils sont pris en charge par detectSavingsTransfers et ne participent jamais au moteur
  // de correspondances de dépenses/revenus (sinon un même montant peut proposer Mega, etc.).
  const monthBankRows = bankRows
    .filter((row) => String(row.date || '').slice(0, 7) === auditMonth)
    .filter((row) => !compensationFundingRows.has(row))
    .filter((row) => !savingsBankRows.has(row))
    .filter((row) => !allocatedDonationBank.has(row))
    .filter((row) => !classifyBankBusinessRule(row, savingsGoals)?.excludeFromExpenseMatching)
    .map((row) => ({ ...row, bankFingerprint: bankRowFingerprint(row, bankRows) }));
  const persistedAppRows = operations
    .filter((row) => !allocatedDonationApp.has(row))
    .filter((row) => (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius')
    .filter((row) => !String(row.label || '').startsWith('Ajustement Belfius'))
    .filter((row) => !isBeobankSavingsAppRow(row))
    .filter((row) => !normalize(row.label || '').startsWith('epargne '))
    .filter((row) => !isSavingsAuditEntry(row, savingsGoals))
    .filter((row) => !compensationAppRows.has(row))
    // Une opération saisie en fin de mois peut n'être comptabilisée par Belfius
    // que quelques jours plus tard. Elle reste candidate au rapprochement du mois
    // bancaire suivant, sans être déplacée dans le grand livre ni comptée comme extra.
    .filter((row) => ledgerRowCanPostDuringAudit(row, auditMonth, monthBankRows))
    .map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
  const confirmedRecurringIds = confirmedRecurringIdsForBankRows(confirmedMatches, bankRows);
  const appRows = [
    ...persistedAppRows,
    ...recurringAuditCandidates(
      monthBankRows,
      expenseRecurrences,
      persistedAppRows,
      auditMonth,
      confirmedRecurringIds,
    ),
  ];

  const usedBank = new Set();
  const usedApp = new Set();
  const pendingBank = new Set();
  const pendingApp = new Set();
  const matched = [];
  const review = [];
  const splits = [];
  const groups = [];

  // 1) Mastercard : le décompte global est isolé avant tout autre débit.
  monthBankRows.forEach((bankRow, bankIndex) => {
    if (!isMastercardStatementRow(bankRow)) return;
    const candidates = appRows
      .map((row, index) => ({
        row,
        index,
        evidence: mastercardStatementMatchEvidence(bankRow, row, {
          amountToleranceCents: AMOUNT_TOLERANCE_CENTS,
          dateToleranceDays: DATE_TOLERANCE_DAYS,
        }),
      }))
      .filter(({ evidence }) => evidence);
    if (candidates.length === 1) {
      const selected = candidates[0];
      usedBank.add(bankIndex);
      usedApp.add(selected.index);
      matched.push({ bank: bankRow, app: selected.row, ...selected.evidence });
      return;
    }
    pendingBank.add(bankIndex);
    candidates.forEach(({ index }) => pendingApp.add(index));
    review.push({
      bank: bankRow,
      candidates: candidates.map(({ row, evidence }) => ({ app: row, ...evidence })),
      reason: candidates.length ? 'Plusieurs règlements Mastercard possibles' : 'Règlement Mastercard absent ou montant différent',
    });
  });

  // 2) Les OP d'épargne ont déjà été isolés par numéro exact + mois dans
  // savingsAudit et retirés de monthBankRows avant cette boucle.

  // Les décisions déjà confirmées sont rejouées avant toute heuristique. Une
  // empreinte désigne une occurrence bancaire unique et ne peut donc jamais
  // consommer une autre ligne identique du relevé.
  monthBankRows.forEach((bankRow, bankIndex) => {
    if (usedBank.has(bankIndex) || pendingBank.has(bankIndex)) return;
    const confirmation = confirmationForBankRow(confirmedMatches, bankRow, monthBankRows);
    if (!confirmation) return;
    const selected = [];
    const selectedIndexes = new Set();
    (confirmation.targets || []).forEach((target) => {
      const index = appRows.findIndex((appRow, appIndex) => (
        !usedApp.has(appIndex)
        && !selectedIndexes.has(appIndex)
        && confirmationTargetMatches(target, appRow)
      ));
      if (index >= 0) {
        selectedIndexes.add(index);
        selected.push({ index, row: appRows[index] });
      }
    });
    if (selected.length !== (confirmation.targets || []).length || selected.length === 0) return;
    if (selected.length > 1) {
      const confirmedTotal = selected.reduce((sum, { row }) => sum + Math.abs(amountCents(row)), 0);
      if (confirmedTotal !== Math.abs(amountCents(bankRow))) return;
    }
    usedBank.add(bankIndex);
    selected.forEach(({ index }) => usedApp.add(index));
    if (selected.length === 1) {
      matched.push({
        bank: bankRow,
        app: selected[0].row,
        auto: true,
        confidence: 100,
        learned: true,
        reason: 'Correspondance confirmée par empreinte bancaire',
      });
    } else {
      splits.push({
        bank: bankRow,
        app: selected.map(({ row }) => row),
        confidence: 100,
        reason: 'Ventilation confirmée par empreinte bancaire et total exact',
      });
    }
  });

  // Les ventilations exactes 1 ligne Belfius → n échéances sont examinées
  // avant les propositions individuelles. Cela évite que MEGA 350 € soit
  // bloqué par deux faux écarts 130 €/220 € partageant la même référence.
  monthBankRows.forEach((bankRow, bankIndex) => {
    if (usedBank.has(bankIndex) || pendingBank.has(bankIndex)) return;
    const availableApp = appRows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !usedApp.has(index));
    const hasExactSingle = availableApp.some(({ row }) => (
      Math.abs(amountCents(row)) === Math.abs(amountCents(bankRow))
      && Boolean(matchEvidence(bankRow, row, expenseRecurrences))
    ));
    if (hasExactSingle) return;
    const split = possibleSplit(bankRow, availableApp, expenseRecurrences);
    if (!split) return;
    usedBank.add(bankIndex);
    split.forEach(({ index }) => usedApp.add(index));
    splits.push({
      bank: bankRow,
      app: split.map(({ row }) => row),
      confidence: 100,
      reason: 'Ventilation reconnue avant ambiguïté par cohérence et total exact',
    });
  });

  // 3) Domiciliations, puis 4) dépenses ordinaires. matchEvidence donne la
  // priorité à la référence forte avant les alias/libellés normalisés.
  monthBankRows.forEach((bankRow, bankIndex) => {
    if (usedBank.has(bankIndex) || pendingBank.has(bankIndex)) return;
    const candidates = appRows
      .map((row, index) => ({
        row,
        index,
        evidence: usedApp.has(index) ? null : matchEvidence(bankRow, row, expenseRecurrences),
      }))
      .filter(({ evidence }) => evidence)
      .sort((left, right) => right.evidence.confidence - left.evidence.confidence
        || dateDistance(left.row.date, bankRow.date) - dateDistance(right.row.date, bankRow.date));

    const automatic = candidates.filter(({ evidence }) => evidence.auto);
    // A five-cent tolerance must not make an exact purchase ambiguous with a nearby one.
    // This preference only applies after semantic evidence has established both candidates.
    const exactAmountAutomatic = automatic.filter(({ row }) => (
      Math.round(Math.abs(Number(row.amount)) * 100) === Math.round(Math.abs(Number(bankRow.amount)) * 100)
    ));
    if (automatic.length > 1 && exactAmountAutomatic.length === 1
      && automatic.every(candidate => candidate.evidence.confidence <= exactAmountAutomatic[0].evidence.confidence)) {
      const selected = exactAmountAutomatic[0];
      usedBank.add(bankIndex);
      usedApp.add(selected.index);
      matched.push({ bank: bankRow, app: selected.row, ...selected.evidence,
        reason: `${selected.evidence.reason} · montant exact au centime` });
      return;
    }
    if (automatic.length === 1) {
      const selected = automatic[0];
      usedBank.add(bankIndex);
      usedApp.add(selected.index);
      matched.push({ bank: bankRow, app: selected.row, ...selected.evidence });
      return;
    }

    if (automatic.length > 1) {
      if (candidatesAreFifoEquivalent(automatic)) {
        const selected = automatic[0];
        usedBank.add(bankIndex);
        usedApp.add(selected.index);
        matched.push({
          bank: bankRow,
          app: selected.row,
          ...selected.evidence,
          reason: `${selected.evidence.reason} · consommation FIFO`,
        });
        return;
      }
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

  // 5) Regroupements n opérations Belfius → 1 opération Mon Foyer.
  // Ils exigent désormais une cohérence de bénéficiaire/alias.
  appRows.forEach((appRow, appIndex) => {
    if (usedApp.has(appIndex) || pendingApp.has(appIndex)) return;
    const availableBank = monthBankRows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !usedBank.has(index));
    const group = possibleBankGroup(appRow, availableBank, expenseRecurrences);
    if (!group) return;

    group.rows.forEach(({ index }) => { usedBank.add(index); pendingBank.delete(index); });
    pendingApp.delete(appIndex);
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

  // 6) Ventilations 1 opération Belfius → n opérations Mon Foyer.
  // Le total seul ne suffit plus : chaque ligne doit être cohérente avec le bénéficiaire.
  monthBankRows.forEach((bankRow, bankIndex) => {
    if (usedBank.has(bankIndex) || pendingBank.has(bankIndex)) return;
    const availableApp = appRows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !usedApp.has(index) && !pendingApp.has(index));
    const split = possibleSplit(bankRow, availableApp, expenseRecurrences);
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
    compensations,
    savingsAudit,
    donationAllocation,
    missing,
    extra,
    bankRows: monthBankRows,
    appRows,
    auditMonth,
  };
}

function sameAppIdentity(left, right) {
  const amountSame = amountCents(left) === amountCents(right);
  const personSame = (left?.person || 'Foyer') === (right?.person || 'Foyer');
  const leftLabel = normalize(left?.label || '');
  const rightLabel = normalize(right?.label || '');
  const labelSame = leftLabel === rightLabel || (leftLabel && rightLabel && (leftLabel.includes(rightLabel) || rightLabel.includes(leftLabel)));
  const categorySame = Boolean(left?.category && right?.category && left.category === right.category);
  const storeSame = !left?.store || !right?.store || normalize(left.store) === normalize(right.store);
  return amountSame && personSame && (labelSame || (categorySame && storeSame));
}

export default function BelfiusAudit({
  operations,
  appBelfiusBalance,
  selectedMonth,
  recurringExpenses = [],
  savingsGoals = [],
  onAddBankOperation,
  onSavingsDetected,
  onAuditSnapshot,
  onCsvImported,
  onEditAppOperation,
  bankMatchConfirmations,
  onBankMatchConfirmationsChange,
}) {
  // RC2.4.4 : le dernier relevé reste disponible entre les ouvertures de l'application.
  const [audit, setAudit] = useState(loadPersistedAudit);
  const [error, setError] = useState('');
  const [learnedRules, setLearnedRules] = useState(loadLearnedRules);
  const [localBankConfirmations, setLocalBankConfirmations] = useState(loadBankMatchConfirmations);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const effectiveBankConfirmations = useMemo(
    () => mergeBankMatchConfirmations(localBankConfirmations, bankMatchConfirmations || []),
    [bankMatchConfirmations, localBankConfirmations],
  );
  const result = useMemo(
    () => audit ? reconcileBelfiusRows(
      audit.rows,
      operations,
      selectedMonth,
      recurringExpenses,
      learnedRules,
      savingsGoals,
      effectiveBankConfirmations,
    ) : null,
    [audit, effectiveBankConfirmations, learnedRules, operations, recurringExpenses, savingsGoals, selectedMonth],
  );

  const saveBankConfirmations = (additions) => {
    const next = persistBankMatchConfirmations(
      mergeBankMatchConfirmations(effectiveBankConfirmations, additions),
    );
    setLocalBankConfirmations(next);
    onBankMatchConfirmationsChange?.(next);
    return next;
  };

  useEffect(() => {
    if (!result?.splits?.length) return;
    const additions = result.splits
      .filter(({ bank, app }) => bank?.bankFingerprint && app?.length > 1)
      .map(({ bank, app }) => confirmationForAssociation(bank, app, 'exact-group'))
      .filter((candidate) => !effectiveBankConfirmations.some((existing) => (
        sameConfirmationTargets(existing, candidate)
      )));
    if (additions.length) saveBankConfirmations(additions);
  }, [effectiveBankConfirmations, result?.splits]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
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
      onCsvImported?.(parsedAudit);
      if (typeof onSavingsDetected === 'function') {
        onSavingsDetected(detectSavingsTransfers(parsedAudit.rows, savingsGoals), parsedAudit);
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
        id: appRow.id || '',
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
    saveBankConfirmations([
      confirmationForAssociation(bankRow, [appRow], 'manual'),
    ]);
    setConfirmationMessage('Correspondance validée et mémorisée : ' + bankRow.label + ' → ' + appRow.label + '.');
  };

  const safeMonth = result?.auditMonth || selectedMonth || '';
  const monthMissing = (result?.missing || []).filter((row) => String(row.date || '').slice(0, 7) === safeMonth);
  const missingMastercardStatements = monthMissing.filter(isMastercardStatementRow);
  const monthExtra = (result?.extra || []).filter((row) => String(row.date || '').slice(0, 7) === safeMonth);
  const cutoffDate = parseBalanceDate(audit?.balanceDate);
  const savingsIssues = (result?.savingsAudit || []).filter(entry => entry.status !== 'matched'
    && (entry.status !== 'pending' || safeMonth < cutoffDate.slice(0, 7)));
  const savingsPending = (result?.savingsAudit || []).filter(entry => entry.status === 'pending'
    && safeMonth >= cutoffDate.slice(0, 7));
  const donationIssues = result?.donationAllocation && result.donationAllocation.status !== 'matched' ? 1 : 0;
  const futureExtra = monthExtra.filter((row) => cutoffDate && String(row.date || '') > cutoffDate);
  const matchedApps = result?.matched?.map((entry) => entry.app) || [];
  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') < cutoffDate).filter((row) => isTrueOrphanAppOperation(row, { cutoffDate })).filter((row) => !matchedApps.some((matched) => matched.id !== row.id && sameAppIdentity(matched, row)));
  const difference = audit ? Number(appBelfiusBalance || 0) - audit.balance : 0;
  const auditIsClean = Boolean(
    audit
    && result
    && monthMissing.length === 0
    && actionableExtra.length === 0
    && savingsIssues.length === 0
    && savingsPending.length === 0
    && donationIssues === 0
    && result.review.length === 0,
  );
  const balanceMonth = parseBalanceMonth(audit?.balanceDate);
  const csvMonthOpening = calculateCsvMonthOpening(audit);
  const isBalanced = auditIsClean && Math.abs(difference) < 0.01;
  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length + savingsIssues.length + savingsPending.length + donationIssues;
  const strongFingerprintCount = (audit?.rows || []).filter((row) => hasStrongCommunicationFingerprint(row, recurringExpenses)).length;
  const {
    pendingAmount,
    expectedBankBalance,
    unexplainedAmount,
  } = calculateBankAuditSummary({
    bankBalance: audit?.balance,
    pendingRows: actionableExtra,
    missingBankRows: monthMissing,
    reviewRows: [ ...(result?.review || []),
      ...(donationIssues ? [{ bank: { amount: -result.donationAllocation.difference } }] : []),
    ],
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
      anomalies: monthMissing.length + actionableExtra.length + savingsIssues.length + donationIssues,
      clean: auditIsClean && Math.abs(difference) < 0.01,
      sourceFile: audit.fileName || 'CSV Belfius',
      openingMonth: csvMonthOpening.month,
      openingBalance: csvMonthOpening.balance,
    });
  }, [audit?.balance, audit?.balanceDate, audit?.importedAt, auditIsClean, csvMonthOpening.balance, csvMonthOpening.month, difference, monthMissing.length, actionableExtra.length, savingsIssues.length, donationIssues, pendingAmount, remainingToTreat, result?.review.length]);

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
          {strongFingerprintCount > 0 ? ` ${strongFingerprintCount} empreinte(s) bancaire(s) forte(s) reconnue(s).` : ''}
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
            <div><span>Solde bancaire relevé</span><strong>{formatMoney(audit.balance)}</strong></div>
            <div><span>Opérations enregistrées en attente</span><strong className={pendingAmount < 0 ? 'negative' : 'positive'}>{formatMoney(pendingAmount)}</strong></div>
            <div><span>Solde bancaire attendu</span><strong>{formatMoney(expectedBankBalance)}</strong></div>
            <div><span>Écart inexpliqué</span><strong className={Math.abs(unexplainedAmount) < 0.01 ? 'positive' : 'negative'}>{formatMoney(unexplainedAmount)}</strong></div>
            <div><span>Opérations du mois</span><strong>{result.bankRows.length}</strong></div>
            <div className="audit-kpi safe"><span><i className="audit-dot" />Correspondances sûres</span><strong>{result.matched.length}</strong></div>
            <div className="audit-kpi review"><span><i className="audit-dot" />À confirmer</span><strong>{result.review.length}</strong></div>
            <div className="audit-kpi split"><span><i className="audit-dot" />Ventilations</span><strong>{result.splits.length}</strong></div>
            <div className="audit-kpi group"><span><i className="audit-dot" />Regroupements</span><strong>{result.groups.length}</strong></div>
            <div className="audit-kpi group"><span><i className="audit-dot" />Flux compensatoires</span><strong>{result.compensations.length}</strong></div>
            <div className="audit-kpi future"><span><i className="audit-dot" />À venir</span><strong>{futureExtra.length}</strong></div>
            <div className="audit-kpi danger"><span><i className="audit-dot" />Anomalies Belfius</span><strong>{monthMissing.length}</strong></div>
            <div className="audit-kpi danger"><span><i className="audit-dot" />Écritures sans mouvement</span><strong>{actionableExtra.length}</strong></div>
          </div>

          {result.donationAllocation && (
            <details className={`audit-details ${donationIssues ? 'status-review' : 'status-safe'}`} open>
              <summary>Dons JW.ORG — {result.donationAllocation.status === 'matched' ? 'ventilation rapprochée' : 'ventilation à compléter ou vérifier'}</summary>
              <p className="audit-section-note">{result.donationAllocation.bank.length} débits Belfius : {formatMoney(result.donationAllocation.bankTotal)} · {result.donationAllocation.app.length} écritures Mon Foyer : {formatMoney(result.donationAllocation.appTotal)}.</p>
              {result.donationAllocation.expectedTotal !== null && <p className="audit-section-note">Prévision du mois : {formatMoney(result.donationAllocation.expectedTotal)}.</p>}
              <p className="audit-section-note">Les destinations sont conservées. Les débits de même montant sont contrôlés ensemble, sans attribuer arbitrairement une référence bancaire à une destination.</p>
              {result.donationAllocation.app.map(row => <article key={row.id} className="audit-missing-row"><strong>{row.label}</strong><b>{formatMoney(row.amount)}</b></article>)}
              {result.donationAllocation.status === 'incomplete' && <p className="audit-section-note">Reste à ventiler : {result.donationAllocation.remainingAmounts.map(formatMoney).join(' + ')} = {formatMoney(result.donationAllocation.difference)}. La prévision globale n’est pas ajoutée une seconde fois.</p>}
              {['ambiguous', 'mismatch'].includes(result.donationAllocation.status) && <p className="audit-section-note">Vérifier les références, les montants et les destinations : la ventilation n’est pas validée automatiquement.</p>}
              {result.donationAllocation.status === 'expected-mismatch' && <p className="audit-section-note">Les écritures correspondent aux débits importés, mais le total diffère de la prévision mensuelle. Vérifier le relevé et le montant prévu.</p>}
              <details><summary>Voir les débits bancaires et leurs références</summary>
                {result.donationAllocation.bank.map((row, index) => <article key={row.id || index} className="audit-missing-row"><span>{row.date} · Réf. {result.donationAllocation.bankReferences[index] || 'non renseignée'}</span><b>{formatMoney(Math.abs(row.amount))}</b></article>)}
              </details>
            </details>
          )}

          {result.savingsAudit.length > 0 && (
            <details className={`audit-details ${savingsIssues.length ? 'status-danger' : result.savingsAudit.some(entry => entry.status !== 'matched') ? 'status-review' : 'status-safe'}`} open>
              <summary>Ordres permanents d’épargne — contrôle du mois ({result.savingsAudit.length})</summary>
              <p className="audit-section-note">Le N° OP identifie le virement du mois. Le jour de débit est indicatif ; le montant est contrôlé séparément.</p>
              {result.savingsAudit.map((entry, index) => (
                <article key={entry.reference || index} className="audit-missing-row">
                  <div><strong>{entry.label}</strong><div>N° OP {entry.reference || 'non renseigné'} · Prévu : {formatMoney(entry.expected)}</div>
                    <div>{entry.status === 'matched' ? 'Mouvement retrouvé'
                      : entry.status === 'amount-mismatch' ? 'Mouvement retrouvé — montant différent'
                        : entry.status === 'ambiguous' ? 'Plusieurs configurations ou débits pour cet OP — à vérifier'
                          : entry.status === 'unconfigured' ? 'N° OP à renseigner'
                            : safeMonth < cutoffDate.slice(0, 7) ? 'Aucun mouvement retrouvé sur ce mois terminé'
                              : 'Pas encore retrouvé dans le relevé de ce mois'}</div>
                    {entry.bank.map((row, bankIndex) => <div key={row.id || bankIndex}>{row.date} · Débit : {formatMoney(Math.abs(row.amount))}</div>)}
                  </div>
                </article>
              ))}
            </details>
          )}

          {result.matched.length > 0 && (
            <details className="audit-details status-safe">
              <summary><span className="audit-dot" />Correspondances sûres ({result.matched.length})</summary>
              {result.matched.map(({ bank, app, confidence, reason }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {formatMoney(bank.amount)}</strong>
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
                  <strong>{bank.date} · {bank.label} · {formatMoney(bank.amount)}</strong>
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
                  <strong>{bank[0]?.date} · {bank[0]?.label} · {bank.map((row) => formatMoney(row.amount)).join(' + ')}</strong>
                  <span>→ {app.label} ({formatMoney(app.amount)}) · confiance {confidence}% · {reason}</span>
                </article>
              ))}
            </details>
          )}

          {result.splits.length > 0 && (
            <details className="audit-details status-split" open>
              <summary><span className="audit-dot" />Ventilations reconnues ({result.splits.length})</summary>
              {result.splits.map(({ bank, app, confidence, reason }) => (
                <article key={bank.id}>
                  <strong>{bank.date} · {bank.label} · {formatMoney(bank.amount)}</strong>
                  <span>{app.map((row) => `${row.label} (${formatMoney(row.amount)})`).join(' + ')} · confiance {confidence}% · {reason}</span>
                </article>
              ))}
            </details>
          )}

          {result.compensations.length > 0 && (
            <details className="audit-details status-group" open>
              <summary><span className="audit-dot" />Flux d’épargne compensatoires ({result.compensations.length})</summary>
              {result.compensations.map(({ funding, expense, appFunding, confidence, reason }) => (
                <article key={`${funding.id}-${expense.id}`}>
                  <strong>
                    {funding.date} · {funding.label} · +{formatMoney(Math.abs(funding.amount))}
                    {' → '}{expense.date} · {expense.label} · −{formatMoney(Math.abs(expense.amount))}
                  </strong>
                  <span>
                    {appFunding ? `→ ${appFunding.label} · ` : ''}confiance {confidence}% · {reason}
                  </span>
                </article>
              ))}
            </details>
          )}

          {monthMissing.length > 0 && (
            <>
              {missingMastercardStatements.length > 0 && (
                <div className="audit-verdict warning">
                  <AlertTriangle size={24} />
                  <div>
                    <strong>Règlement Mastercard non rapproché</strong>
                    <span>La référence mensuelle « RELEVE MASTERCARD » est présente dans Belfius, mais le règlement correspondant est absent ou son montant diffère dans Mon Foyer.</span>
                  </div>
                </div>
              )}
            <details className="audit-details status-danger" open>
              <summary><span className="audit-dot" />Opérations Belfius absentes ({monthMissing.length})</summary>
              {monthMissing.map((row) => (
                <article key={row.id} className="audit-missing-row">
                  <strong>{row.date} · {row.label}</strong>
                  <span className="audit-missing-actions">
                    <b>{formatMoney(row.amount)}</b>
                    {typeof onAddBankOperation === 'function' && (
                      <button type="button" className="audit-pencil" title="Enregistrer dans Mon Foyer" aria-label={`Enregistrer ${row.label} dans Mon Foyer`} onClick={() => onAddBankOperation({ ...row, learnedSuggestion: suggestionForBankRow(row, learnedRules) })}>
                        <Pencil size={17} />
                      </button>
                    )}
                  </span>
                </article>
              ))}
            </details>
            </>
          )}

          {futureExtra.length > 0 && (
            <details className="audit-details status-future" open>
              <summary><span className="audit-dot" />Opérations programmées — en attente du prochain relevé ({futureExtra.length})</summary>
              <p className="audit-section-note">Déjà enregistrées dans Mon Foyer, mais postérieures au dernier solde Belfius importé.</p>
              {futureExtra.map((row) => (
                <article key={row.id}><strong>{row.date} · {row.label}</strong><span className="audit-badge future">À venir · {formatMoney(row.type === 'income' ? row.amount : -row.amount)}</span></article>
              ))}
            </details>
          )}

          {actionableExtra.length > 0 && (
            <details className="audit-details status-danger" open>
              <summary><span className="audit-dot" />Écritures Mon Foyer sans mouvement Belfius ({actionableExtra.length})</summary>
              <p className="audit-section-note">Écritures arrivées à échéance mais sans mouvement bancaire identifié. Elles sont à contrôler, pas automatiquement considérées comme erronées.</p>
              <p className="audit-section-note">Ce contrôle porte sur le paiement initial. Un remboursement reçu en espèces ne supprime pas le débit attendu d’un achat payé par carte. Pour un ticket partagé, la somme des parts doit correspondre au débit bancaire.</p>
              {actionableExtra.map((row) => (
                <article key={row.id} className="audit-missing-row"><strong>{row.date} · {row.label}</strong><span className="audit-missing-actions"><b>{formatMoney((row.type === 'income' || row.type === 'reimbursement') ? row.amount : -row.amount)}</b>{typeof onEditAppOperation === 'function' && (<button type="button" className="audit-pencil" title="Modifier cette écriture" aria-label={`Modifier ${row.label}`} onClick={() => onEditAppOperation(row)}><Pencil size={17} /></button>)}</span></article>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
