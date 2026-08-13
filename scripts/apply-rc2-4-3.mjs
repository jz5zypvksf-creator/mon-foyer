import fs from 'node:fs';

const file = 'src/BelfiusAudit.jsx';
let source = fs.readFileSync(file, 'utf8');

const oldPossibleBankGroup = `function possibleBankGroup(appRow, indexedBankRows) {
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
}`;

const newPossibleBankGroup = `function recurringFingerprintMatchesBankRow(bankRow, expense) {
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
}`;

if (!source.includes(oldPossibleBankGroup)) {
  throw new Error('Bloc possibleBankGroup attendu introuvable');
}
source = source.replace(oldPossibleBankGroup, newPossibleBankGroup);

const oldGroupCall = `    const group = possibleBankGroup(appRow, availableBank);
    if (!group) return;

    group.forEach(({ index }) => usedBank.add(index));
    usedApp.add(appIndex);
    groups.push({
      bank: group.map(({ row }) => row),
      app: appRow,
      confidence: 99,
      reason: 'Regroupement validé par bénéficiaire/alias et total exact',
    });`;

const newGroupCall = `    const group = possibleBankGroup(appRow, availableBank, recurringExpenses);
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
    });`;

if (!source.includes(oldGroupCall)) {
  throw new Error('Bloc appel regroupement attendu introuvable');
}
source = source.replace(oldGroupCall, newGroupCall);

fs.writeFileSync(file, source);
console.log('RC2.4.3 appliquée : regroupement par empreintes Belfius activé.');
