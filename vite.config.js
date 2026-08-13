import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function beobankImporterIntegration() {
  return {
    name: 'mon-foyer-beobank-importer-integration',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') && !id.endsWith('\\src\\App.jsx')) return null;
      let patched = code;
      patched = patched.replace(
        "import BelfiusAudit from './BelfiusAudit.jsx';",
        "import BelfiusAudit from './BelfiusAudit.jsx';\nimport BeobankStatementImport from './BeobankStatementImport.jsx';\nimport './BeobankStatementImport.css';",
      );
      const oldBlock = `{data.savingsGoals.map((goal) => (\n                  <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} bankDetected={bankSavings[savingsBucketForGoal(goal)] || 0} />\n                ))}`;
      const newBlock = `{data.savingsGoals.map((goal) => (\n                  <div key={goal.id}>\n                    <GoalCard goal={goal} onUpdate={updateGoal} bankDetected={bankSavings[savingsBucketForGoal(goal)] || 0} />\n                    {savingsBucketForGoal(goal) === 'vacances' && (\n                      <BeobankStatementImport currentBalance={Number(goal.saved || 0)} onApply={(balance) => updateGoal(goal.id, 'saved', balance)} />\n                    )}\n                  </div>\n                ))}`;
      patched = patched.replace(oldBlock, newBlock);

      // RC2.4.6 — une domiciliation est une identité bancaire distincte d'une communication.
      patched = patched.replaceAll(
        'structured_communication, free_communication, free_communication_mode',
        'structured_communication, direct_debit_reference, free_communication, free_communication_mode',
      );
      patched = patched.replaceAll(
        "    structuredCommunication: '',\n    freeCommunication: '',",
        "    structuredCommunication: '',\n    directDebitReference: '',\n    freeCommunication: '',",
      );
      patched = patched.replaceAll(
        "      structuredCommunication: expense.structured_communication || '',\n      freeCommunication:",
        "      structuredCommunication: expense.structured_communication || '',\n      directDebitReference: expense.direct_debit_reference || '',\n      freeCommunication:",
      );
      patched = patched.replace(
        "      structuredCommunication: operation.structuredCommunication ?? existing?.structuredCommunication ?? existing?.structured_communication ?? '',\n      freeCommunication:",
        "      structuredCommunication: operation.structuredCommunication ?? existing?.structuredCommunication ?? existing?.structured_communication ?? '',\n      directDebitReference: operation.directDebitReference ?? existing?.directDebitReference ?? existing?.direct_debit_reference ?? '',\n      freeCommunication:",
      );
      patched = patched.replaceAll(
        "        structured_communication: recurringExpense.structuredCommunication || null,\n        free_communication:",
        "        structured_communication: recurringExpense.structuredCommunication || null,\n        direct_debit_reference: recurringExpense.directDebitReference || null,\n        free_communication:",
      );
      patched = patched.replace(
        "          structuredCommunication: draft.structuredCommunication || '',\n          freeCommunication:",
        "          structuredCommunication: draft.structuredCommunication || '',\n          directDebitReference: draft.directDebitReference || '',\n          freeCommunication:",
      );
      patched = patched.replaceAll(
        "      structuredCommunication: recurringExpense?.structuredCommunication || recurringExpense?.structured_communication || '',\n      freeCommunication:",
        "      structuredCommunication: recurringExpense?.structuredCommunication || recurringExpense?.structured_communication || '',\n      directDebitReference: recurringExpense?.directDebitReference || recurringExpense?.direct_debit_reference || '',\n      freeCommunication:",
      );
      patched = patched.replaceAll(
        "      structuredCommunication: expense.structuredCommunication || expense.structured_communication || '',\n      freeCommunication:",
        "      structuredCommunication: expense.structuredCommunication || expense.structured_communication || '',\n      directDebitReference: expense.directDebitReference || expense.direct_debit_reference || '',\n      freeCommunication:",
      );
      patched = patched.replace(
        "      structuredCommunication: String(recurringDraft.structuredCommunication || '').trim(),\n      freeCommunication:",
        "      structuredCommunication: String(recurringDraft.structuredCommunication || '').trim(),\n      directDebitReference: String(recurringDraft.directDebitReference || '').trim(),\n      freeCommunication:",
      );
      patched = patched.replaceAll(
        "        structured_communication: fixedExpense.structuredCommunication || null,\n        free_communication:",
        "        structured_communication: fixedExpense.structuredCommunication || null,\n        direct_debit_reference: fixedExpense.directDebitReference || null,\n        free_communication:",
      );
      patched = patched.replace(
        "        structuredCommunication: savedExpense.structured_communication || '',\n        freeCommunication:",
        "        structuredCommunication: savedExpense.structured_communication || '',\n        directDebitReference: savedExpense.direct_debit_reference || '',\n        freeCommunication:",
      );

      patched = patched.replace(
        `                      <label>\n                        Communication structurée`,
        `                      <label>\n                        Référence de domiciliation / mandat\n                        <input\n                          value={draft.directDebitReference || ''}\n                          onChange={(event) => setDraft({ ...draft, directDebitReference: event.target.value })}\n                          placeholder="Ex. 400102107996"\n                        />\n                      </label>\n                      <label>\n                        Communication structurée`,
      );
      patched = patched.replace(
        `                  <label>\n                    Communication structurée`,
        `                  <label>\n                    Référence de domiciliation / mandat\n                    <input\n                      value={recurringDraft.directDebitReference || ''}\n                      onChange={(event) => setRecurringDraft({ ...recurringDraft, directDebitReference: event.target.value })}\n                      placeholder="Ex. 400102107996"\n                    />\n                  </label>\n                  <label>\n                    Communication structurée`,
      );

      if (patched === code || !patched.includes('BeobankStatementImport') || !patched.includes('Référence de domiciliation / mandat')) {
        throw new Error('RC2.4.6 App: integration target not found; refusing misleading build.');
      }
      return { code: patched, map: null };
    },
  };
}

function belfiusAuditRc246Integration() {
  return {
    name: 'mon-foyer-belfius-audit-rc246-integration',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/BelfiusAudit.jsx') && !id.endsWith('\\src\\BelfiusAudit.jsx')) return null;
      let patched = code;

      patched = patched.replace(
        "import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';",
        "import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';\nimport { classifyBankBusinessRule, hasStrongCommunicationFingerprint, isTrueOrphanAppOperation, shouldOfferAmountDateFallback, strongCommunicationMatch } from './belfiusMatchingRules.js';",
      );

      patched = patched.replace(
        /function isBeobankSavingsTransfer\(row\) \{[\s\S]*?\n\}/,
        "function isBeobankSavingsTransfer(row) {\n  return Boolean(classifyBankBusinessRule(row));\n}",
      );
      patched = patched.replace(
        "      structuredCommunication: extractStructuredCommunication(cells[communicationIndex] || ''),",
        "      structuredCommunication: extractStructuredCommunication(cells[communicationIndex] || ''),\n      rawDetails: cells.join(' '),",
      );
      patched = patched.replace(
        "  // L'empreinte bancaire est prioritaire sur le jour théorique du prélèvement.\n  if (bankCommunication) {",
        "  // Référence de domiciliation / mandat : empreinte bancaire prioritaire.\n  const directDebit = identityCandidates.find((expense) => strongCommunicationMatch(bankRow, expense)?.kind === 'direct-debit');\n  if (directDebit) return { ...directDebit, __directDebitMatch: true };\n\n  // L'empreinte bancaire est prioritaire sur le jour théorique du prélèvement.\n  if (bankCommunication) {",
      );
      patched = patched.replace(
        "  if (recurring && recurring.__freeCommunicationMatch) {",
        "  if (recurring && recurring.__directDebitMatch) {\n    return { auto: true, confidence: 100, reason: `Référence de domiciliation Belfius reconnue : ${recurring.label}`, recurring };\n  }\n  if (recurring && recurring.__freeCommunicationMatch) {",
      );
      patched = patched.replace(
        "  return structuredMatch || recurringFreeCommunicationMatch(bankRow, expense);",
        "  return Boolean(strongCommunicationMatch(bankRow, expense)) || structuredMatch || recurringFreeCommunicationMatch(bankRow, expense);",
      );
      patched = patched.replace(
        "  // Montant/date seuls ne sont plus une preuve suffisante : ils deviennent une proposition.\n  return {",
        "  // Une empreinte forte connue interdit toute proposition concurrente basée seulement sur montant/date.\n  if (!shouldOfferAmountDateFallback(bankRow, recurringExpenses)) return null;\n\n  // Montant/date seuls ne sont plus une preuve suffisante : ils deviennent une proposition.\n  return {",
      );
      patched = patched.replace(
        ".filter((row) => !isBeobankSavingsTransfer(row))",
        ".filter((row) => !classifyBankBusinessRule(row)?.excludeFromExpenseMatching)",
      );
      patched = patched.replace(
        "    if (usedApp.has(appIndex)) return;",
        "    if (usedApp.has(appIndex) || pendingApp.has(appIndex)) return;",
      );
      patched = patched.replace(
        ".filter(({ index }) => !usedBank.has(index));",
        ".filter(({ index }) => !usedBank.has(index) && !pendingBank.has(index));",
      );
      patched = patched.replace(
        "    if (usedBank.has(bankIndex)) return;",
        "    if (usedBank.has(bankIndex) || pendingBank.has(bankIndex)) return;",
      );
      patched = patched.replace(
        ".filter(({ index }) => !usedApp.has(index));",
        ".filter(({ index }) => !usedApp.has(index) && !pendingApp.has(index));",
      );

      patched = patched.replace(
        "export default function BelfiusAudit({",
        "function sameAppIdentity(left, right) {\n  return normalize(left?.label) === normalize(right?.label)\n    && Math.abs(Number(left?.amount || 0) - Number(right?.amount || 0)) <= AMOUNT_TOLERANCE\n    && (left?.person || 'Foyer') === (right?.person || 'Foyer');\n}\n\nexport default function BelfiusAudit({",
      );
      patched = patched.replace(
        "  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate);",
        "  const matchedApps = result?.matched?.map((entry) => entry.app) || [];\n  const actionableExtra = monthExtra\n    .filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate)\n    .filter((row) => isTrueOrphanAppOperation(row, { cutoffDate }))\n    .filter((row) => !matchedApps.some((matched) => matched.id !== row.id && sameAppIdentity(matched, row)));",
      );
      patched = patched.replace(
        "  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;",
        "  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;\n  const strongFingerprintCount = (audit?.rows || []).filter((row) => hasStrongCommunicationFingerprint(row, recurringExpenses)).length;",
      );
      patched = patched.replace(
        "          Tu peux quitter l'application et reprendre l'audit sans recharger le fichier.",
        "          {strongFingerprintCount > 0 ? ` ${strongFingerprintCount} empreinte(s) bancaire(s) forte(s) reconnue(s).` : ''}\n          Tu peux quitter l'application et reprendre l'audit sans recharger le fichier.",
      );
      patched = patched.replace(
        '<span><i className="audit-dot" />À vérifier Mon Foyer</span>',
        '<span><i className="audit-dot" />Écritures sans mouvement</span>',
      );
      patched = patched.replace(
        '<summary><span className="audit-dot" />Opérations Mon Foyer à vérifier ({actionableExtra.length})</summary>',
        '<summary><span className="audit-dot" />Écritures Mon Foyer sans mouvement Belfius ({actionableExtra.length})</summary>\n              <p className="audit-section-note">Écritures arrivées à échéance mais sans mouvement bancaire identifié. Elles sont à contrôler, pas automatiquement considérées comme erronées.</p>',
      );

      const requiredMarkers = [
        "classifyBankBusinessRule(row)?.excludeFromExpenseMatching",
        "shouldOfferAmountDateFallback(bankRow, recurringExpenses)",
        "Écritures Mon Foyer sans mouvement Belfius",
        "sameAppIdentity",
        "__directDebitMatch",
      ];
      if (requiredMarkers.some((marker) => !patched.includes(marker))) {
        throw new Error('RC2.4.6 Belfius: integration target not found; refusing misleading build.');
      }
      return { code: patched, map: null };
    },
  };
}

function finalRc246Integration() {
  return {
    name: 'mon-foyer-rc246-final-integration',
    enforce: 'pre',
    transform(code, id) {
      const isApp = id.endsWith('/src/App.jsx') || id.endsWith('\\src\\App.jsx');
      const isAudit = id.endsWith('/src/BelfiusAudit.jsx') || id.endsWith('\\src\\BelfiusAudit.jsx');
      if (!isApp && !isAudit) return null;
      let patched = code;

      if (isApp) {
        patched = patched.replace(
          "import BelfiusAudit from './BelfiusAudit.jsx';",
          "import BelfiusAudit from './BelfiusAudit.jsx';\nimport { budgetIncomeTotalForMonth } from './budgetMonthRules.js';",
        );

        patched = patched.replace(
          "  const totals = useMemo(() => {\n    return calculateTotals(effectiveMonthOperations);\n  }, [effectiveMonthOperations]);",
          "  const budgetIncomeTotal = useMemo(() => budgetIncomeTotalForMonth(data.operations, selectedMonth), [data.operations, selectedMonth]);\n\n  const totals = useMemo(() => {\n    const actual = calculateTotals(effectiveMonthOperations);\n    return { ...actual, income: budgetIncomeTotal, balance: budgetIncomeTotal - actual.fixed - actual.variable };\n  }, [budgetIncomeTotal, effectiveMonthOperations]);",
        );

        patched = patched.replace(
          "  const fullMonthTotals = useMemo(() => {\n    return calculateTotals(monthOperations);\n  }, [monthOperations]);",
          "  const fullMonthTotals = useMemo(() => {\n    const actual = calculateTotals(monthOperations);\n    return { ...actual, income: budgetIncomeTotal, balance: budgetIncomeTotal - actual.fixed - actual.variable };\n  }, [budgetIncomeTotal, monthOperations]);",
        );

        patched = patched.replace(
          "  const historyTotals = useMemo(() => {\n    const filteredTotals = calculateTotals(filteredMonthOperations);\n    return {\n      ...filteredTotals,\n      expenses: filteredTotals.fixed + filteredTotals.variable,\n    };\n  }, [filteredMonthOperations]);",
          "  const historyTotals = useMemo(() => {\n    const filteredTotals = calculateTotals(filteredMonthOperations);\n    const defaultBudgetView = historyType === 'all' && historyPerson === 'all' && historyCategory === 'all'\n      && historyPaymentMethod === 'all' && !historySearch.trim() && !showReviewOnly;\n    const income = defaultBudgetView ? budgetIncomeTotal : filteredTotals.income;\n    return {\n      ...filteredTotals,\n      income,\n      balance: income - filteredTotals.fixed - filteredTotals.variable,\n      expenses: filteredTotals.fixed + filteredTotals.variable,\n    };\n  }, [budgetIncomeTotal, filteredMonthOperations, historyCategory, historyPaymentMethod, historyPerson, historySearch, historyType, showReviewOnly]);",
        );

        patched = patched.replace('label="Revenus encaissés" value={formatCurrency(totals.income)}', 'label="Revenus budgétaires" value={formatCurrency(totals.income)}');
        patched = patched.replace(
          '<span>Revenus</span>\n                  <strong className="income">{formatCurrency(historyTotals.income)}</strong>',
          '<span>Revenus budgétaires</span>\n                  <strong className="income">{formatCurrency(historyTotals.income)}</strong>',
        );
      }

      if (isAudit) {
        patched = patched.replace(
          "      details: cells[communicationIndex] || cells[transactionIndex] || '',",
          "      details: [cells[communicationIndex], cells[transactionIndex]].filter(Boolean).join(' '),",
        );

        patched = patched.replace(
          "  const learned = learnedEvidence(bankRow, appRow, learnedRules);\n  if (learned && dayDelta <= 7) return learned;\n  if (dayDelta > DATE_TOLERANCE_DAYS) return null;\n\n  const directLabel = labelsLikelyMatch(bankRow, appRow);\n  const alias = aliasMatch(bankRow, appRow);\n  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);",
          "  const learned = learnedEvidence(bankRow, appRow, learnedRules);\n  const directLabel = labelsLikelyMatch(bankRow, appRow);\n  const alias = aliasMatch(bankRow, appRow);\n  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);\n  if (learned && dayDelta <= 14) return learned;\n  const strongBusinessIdentity = directLabel || alias || Boolean(recurring);\n  if (dayDelta > DATE_TOLERANCE_DAYS && !(strongBusinessIdentity && dayDelta <= 14)) return null;",
        );

        patched = patched.replace(
          "                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.type === 'income' ? row.amount : -row.amount)}</span></article>",
          "                <article key={row.id} className=\"audit-missing-row\"><strong>{row.date} · {row.label}</strong><span className=\"audit-missing-actions\"><b>{money(row.type === 'income' ? row.amount : -row.amount)}</b>{typeof onEditAppOperation === 'function' && (<button type=\"button\" className=\"audit-pencil\" title=\"Modifier cette écriture\" aria-label={`Modifier ${row.label}`} onClick={() => onEditAppOperation(row)}><Pencil size={17} /></button>)}</span></article>",
        );
      }

      if (patched === code) throw new Error('RC2.4.6 final: integration target not found.');
      return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), react()],
});
