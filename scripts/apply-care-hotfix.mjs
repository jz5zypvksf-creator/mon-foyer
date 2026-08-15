import fs from 'node:fs';

const path = 'vite.config.js';
let source = fs.readFileSync(path, 'utf8');

function careHotfixIntegration() {
  return {
    name: 'mon-foyer-care-hotfix',
    enforce: 'pre',
    transform(code, id) {
      const isApp = id.endsWith('/src/App.jsx') || id.endsWith('\\src\\App.jsx');
      const isAudit = id.endsWith('/src/BelfiusAudit.jsx') || id.endsWith('\\src\\BelfiusAudit.jsx');
      if (!isApp && !isAudit) return null;
      let patched = code;

      if (isAudit) {
        if (!patched.includes("bank: ['office national de l emploi']")) {
          patched = patched.replace(
            "  { bank: ['sd worx'], app: ['salaire alain'] },",
            "  { bank: ['sd worx'], app: ['salaire alain'] },\n  { bank: ['office national de l emploi'], app: ['onem'] },",
          );
        }

        patched = patched.replace(
          "  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate)",
          "  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') < cutoffDate)",
        );

        patched = patched.replaceAll(
          "strongCommunicationMatch(bankRow, expense)?.kind === 'direct-debit'",
          "['direct-debit', 'bank-reference'].includes(strongCommunicationMatch(bankRow, expense)?.kind)",
        );
        patched = patched.replace(
          "  const target = rule.target;\n  if (target.label && normalize(target.label) === normalize(appRow.label)) return true;",
          "  const target = rule.target;\n  if (target.id) return target.id === appRow.id;\n  if (target.label && normalize(target.label) === normalize(appRow.label)) return true;",
        );
        patched = patched.replace(
          "      target: {\n        label: appRow.label || '',",
          "      target: {\n        id: appRow.id || '',\n        label: appRow.label || '',",
        );
        patched = patched.replace(
          ".filter((row) => !isBeobankSavingsAppRow(row))",
          ".filter((row) => !isBeobankSavingsAppRow(row))\n    .filter((row) => !normalize(row.label || '').startsWith('epargne '))",
        );
        patched = patched.replace(
          "function sameAppIdentity(left, right) {\n  return normalize(left?.label) === normalize(right?.label) && Math.abs(Number(left?.amount || 0) - Number(right?.amount || 0)) <= AMOUNT_TOLERANCE && (left?.person || 'Foyer') === (right?.person || 'Foyer');\n}",
          "function sameAppIdentity(left, right) {\n  const amountSame = Math.abs(Number(left?.amount || 0) - Number(right?.amount || 0)) <= AMOUNT_TOLERANCE;\n  const personSame = (left?.person || 'Foyer') === (right?.person || 'Foyer');\n  const leftLabel = normalize(left?.label || '');\n  const rightLabel = normalize(right?.label || '');\n  const labelSame = leftLabel === rightLabel || (leftLabel && rightLabel && (leftLabel.includes(rightLabel) || rightLabel.includes(leftLabel)));\n  const categorySame = Boolean(left?.category && right?.category && left.category === right.category);\n  const storeSame = !left?.store || !right?.store || normalize(left.store) === normalize(right.store);\n  return amountSame && personSame && (labelSame || (categorySame && storeSame));\n}",
        );
        patched = patched.replace(
          ".filter(({ index }) => !usedBank.has(index) && !pendingBank.has(index));\n    const group = possibleBankGroup(appRow, availableBank, recurringExpenses);",
          ".filter(({ index }) => !usedBank.has(index));\n    const group = possibleBankGroup(appRow, availableBank, recurringExpenses);",
        );
        patched = patched.replace(
          "    group.rows.forEach(({ index }) => usedBank.add(index));\n    usedApp.add(appIndex);",
          "    group.rows.forEach(({ index }) => { usedBank.add(index); pendingBank.delete(index); });\n    pendingApp.delete(appIndex);\n    usedApp.add(appIndex);",
        );
      }

      if (isApp) {
        const reimbursementButton = '<button type="button" className="secondary-button" onClick={() => startCareReimbursement(item.person)}>Remboursement</button>';
        const detailButton = '<button type="button" className="secondary-button" onClick={() => { setHistoryPerson(item.person); setHistoryType(\'all\'); setHistoryCategory(\'all\'); setHistoryPaymentMethod(\'all\'); setHistorySearch(\'\'); setShowReviewOnly(false); setActiveView(\'history\'); }}>Voir le détail</button>';
        if (!patched.includes('>Voir le détail</button>')) patched = patched.replaceAll(reimbursementButton, detailButton + reimbursementButton);

        // Aujourd'hui = exécuté dans Mon Foyer. Les opérations programmées commencent demain.
        patched = patched.replace(
          "  const scheduledExpenses = useMemo(() => {\n    const explicitScheduledExpenses = monthOperations\n      .filter((operation) => operation.type !== 'income' && operation.date > balanceCutoff);",
          "  const scheduledExpenses = useMemo(() => {\n    const scheduleCutoff = selectedMonth === today.slice(0, 7) && today > balanceCutoff ? today : balanceCutoff;\n    const explicitScheduledExpenses = monthOperations\n      .filter((operation) => operation.type !== 'income' && operation.date > scheduleCutoff);",
        );
        patched = patched.replace(
          "        operation.date > balanceCutoff\n        && !existingFixedSignatures.has(fixedExpenseSignature(operation))",
          "        operation.date > scheduleCutoff\n        && !existingFixedSignatures.has(fixedExpenseSignature(operation))",
        );
        patched = patched.replace(
          "    balanceCutoff,\n    data.recurringFixedExpenses,\n    monthOperations,\n    selectedMonth,\n  ]);",
          "    balanceCutoff,\n    data.recurringFixedExpenses,\n    monthOperations,\n    selectedMonth,\n    today,\n  ]);",
        );

        // Prévision Belfius : le relevé bancaire peut être plus ancien que l'historique Mon Foyer.
        // On repart du solde réel du relevé, puis on rejoue les mouvements Belfius déjà exécutés
        // entre la date du relevé et aujourd'hui (ex. PSA Finance), avant de retrancher le futur.
        patched = patched.replace(
          "  const forecastPair = forecastBalances({ appAvailable: availableForPayments, appBelfiusBalance: paymentBalances['Compte Belfius'], realBelfiusBalance: belfiusSnapshot?.balance ?? null, remainingToCover: totalRemainingToCover });",
          "  const snapshotDateMatch = String(belfiusSnapshot?.balanceDate || '').match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);\n  const snapshotDateIso = snapshotDateMatch ? `${snapshotDateMatch[3]}-${snapshotDateMatch[2]}-${snapshotDateMatch[1]}` : '';\n  const belfiusCatchUpNet = snapshotDateIso ? effectiveMonthOperations.filter((operation) => (operation.paymentMethod || 'Compte Belfius') === 'Compte Belfius' && operation.date > snapshotDateIso && operation.date <= today).reduce((sum, operation) => { const amount = Number(operation.amount || 0); return sum + ((operation.type === 'income' || operation.type === 'reimbursement') ? amount : -amount); }, 0) : 0;\n  const rawForecastPair = forecastBalances({ appAvailable: availableForPayments, appBelfiusBalance: paymentBalances['Compte Belfius'], realBelfiusBalance: belfiusSnapshot?.balance ?? null, remainingToCover: totalRemainingToCover });\n  const forecastPair = { ...rawForecastPair, belfiusForecast: rawForecastPair.belfiusForecast == null ? null : rawForecastPair.belfiusForecast + belfiusCatchUpNet };",
        );

        patched = patched.replace(
          "    const annualOperations = data.operations.filter((operation) => operation.date.startsWith(selectedYear));",
          "    const annualOperations = data.operations.filter((operation) => operation.date.startsWith(selectedYear) && operation.date <= today);",
        );
        patched = patched.replace(
          "      const monthTotals = calculateTotals(data.operations.filter((operation) => operation.date.startsWith(monthKey)));",
          "      const monthTotals = calculateTotals(data.operations.filter((operation) => operation.date.startsWith(monthKey) && operation.date <= today));",
        );

        if (!patched.includes('const scheduleCutoff = selectedMonth === today.slice(0, 7)')
          || !patched.includes('const belfiusCatchUpNet = snapshotDateIso ? effectiveMonthOperations.filter')) {
          throw new Error('Correctif prévisionnel Belfius incomplet');
        }
      }
      return { code: patched, map: null };
    },
  };
}

const exportMarker = '\nexport default defineConfig(';
const exportIndex = source.indexOf(exportMarker);
if (exportIndex < 0) throw new Error('vite.config.js: export marker introuvable');
const existingStart = source.lastIndexOf('function careHotfixIntegration()', exportIndex);
if (existingStart >= 0) source = source.slice(0, existingStart) + careHotfixIntegration.toString() + '\n' + source.slice(exportIndex);
else source = source.slice(0, exportIndex) + '\n' + careHotfixIntegration.toString() + '\n' + source.slice(exportIndex);
source = source.replace(
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careUxFinalIntegration(), react()]',
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careHotfixIntegration(), careUxFinalIntegration(), react()]',
);
if (!source.includes('careHotfixIntegration()')) throw new Error('Plugin careHotfix non branché');
fs.writeFileSync(path, source);
console.log('Correctif prévisionnel Belfius + échéances du jour appliqué.');
