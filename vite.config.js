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
      patched = patched.replaceAll('structured_communication, free_communication, free_communication_mode', 'structured_communication, direct_debit_reference, free_communication, free_communication_mode');
      patched = patched.replaceAll("    structuredCommunication: '',\n    freeCommunication: '',", "    structuredCommunication: '',\n    directDebitReference: '',\n    freeCommunication: '',");
      patched = patched.replaceAll("      structuredCommunication: expense.structured_communication || '',\n      freeCommunication:", "      structuredCommunication: expense.structured_communication || '',\n      directDebitReference: expense.direct_debit_reference || '',\n      freeCommunication:");
      patched = patched.replace("      structuredCommunication: operation.structuredCommunication ?? existing?.structuredCommunication ?? existing?.structured_communication ?? '',\n      freeCommunication:", "      structuredCommunication: operation.structuredCommunication ?? existing?.structuredCommunication ?? existing?.structured_communication ?? '',\n      directDebitReference: operation.directDebitReference ?? existing?.directDebitReference ?? existing?.direct_debit_reference ?? '',\n      freeCommunication:");
      patched = patched.replaceAll("        structured_communication: recurringExpense.structuredCommunication || null,\n        free_communication:", "        structured_communication: recurringExpense.structuredCommunication || null,\n        direct_debit_reference: recurringExpense.directDebitReference || null,\n        free_communication:");
      patched = patched.replace("          structuredCommunication: draft.structuredCommunication || '',\n          freeCommunication:", "          structuredCommunication: draft.structuredCommunication || '',\n          directDebitReference: draft.directDebitReference || '',\n          freeCommunication:");
      patched = patched.replaceAll("      structuredCommunication: recurringExpense?.structuredCommunication || recurringExpense?.structured_communication || '',\n      freeCommunication:", "      structuredCommunication: recurringExpense?.structuredCommunication || recurringExpense?.structured_communication || '',\n      directDebitReference: recurringExpense?.directDebitReference || recurringExpense?.direct_debit_reference || '',\n      freeCommunication:");
      patched = patched.replaceAll("      structuredCommunication: expense.structuredCommunication || expense.structured_communication || '',\n      freeCommunication:", "      structuredCommunication: expense.structuredCommunication || expense.structured_communication || '',\n      directDebitReference: expense.directDebitReference || expense.direct_debit_reference || '',\n      freeCommunication:");
      patched = patched.replace("      structuredCommunication: String(recurringDraft.structuredCommunication || '').trim(),\n      freeCommunication:", "      structuredCommunication: String(recurringDraft.structuredCommunication || '').trim(),\n      directDebitReference: String(recurringDraft.directDebitReference || '').trim(),\n      freeCommunication:");
      patched = patched.replaceAll("        structured_communication: fixedExpense.structuredCommunication || null,\n        free_communication:", "        structured_communication: fixedExpense.structuredCommunication || null,\n        direct_debit_reference: fixedExpense.directDebitReference || null,\n        free_communication:");
      patched = patched.replace("        structuredCommunication: savedExpense.structured_communication || '',\n        freeCommunication:", "        structuredCommunication: savedExpense.structured_communication || '',\n        directDebitReference: savedExpense.direct_debit_reference || '',\n        freeCommunication:");
      patched = patched.replace(`                      <label>\n                        Communication structurée`, `                      <label>\n                        Référence de domiciliation / mandat\n                        <input value={draft.directDebitReference || ''} onChange={(event) => setDraft({ ...draft, directDebitReference: event.target.value })} placeholder="Ex. 400102107996" />\n                      </label>\n                      <label>\n                        Communication structurée`);
      patched = patched.replace(`                  <label>\n                    Communication structurée`, `                  <label>\n                    Référence de domiciliation / mandat\n                    <input value={recurringDraft.directDebitReference || ''} onChange={(event) => setRecurringDraft({ ...recurringDraft, directDebitReference: event.target.value })} placeholder="Ex. 400102107996" />\n                  </label>\n                  <label>\n                    Communication structurée`);
      if (patched === code || !patched.includes('BeobankStatementImport') || !patched.includes('Référence de domiciliation / mandat')) throw new Error('RC2.4.6 App: integration target not found; refusing misleading build.');
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
      patched = patched.replace("import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';", "import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';\nimport { classifyBankBusinessRule, hasStrongCommunicationFingerprint, isTrueOrphanAppOperation, shouldOfferAmountDateFallback, strongCommunicationMatch } from './belfiusMatchingRules.js';");
      patched = patched.replace(/function isBeobankSavingsTransfer\(row\) \{[\s\S]*?\n\}/, "function isBeobankSavingsTransfer(row) {\n  return Boolean(classifyBankBusinessRule(row));\n}");
      patched = patched.replace("      structuredCommunication: extractStructuredCommunication(cells[communicationIndex] || ''),", "      structuredCommunication: extractStructuredCommunication(cells[communicationIndex] || ''),\n      rawDetails: cells.join(' '),");
      patched = patched.replace("  // L'empreinte bancaire est prioritaire sur le jour théorique du prélèvement.\n  if (bankCommunication) {", "  const directDebit = identityCandidates.find((expense) => strongCommunicationMatch(bankRow, expense)?.kind === 'direct-debit');\n  if (directDebit) return { ...directDebit, __directDebitMatch: true };\n\n  // L'empreinte bancaire est prioritaire sur le jour théorique du prélèvement.\n  if (bankCommunication) {");
      patched = patched.replace("  if (recurring && recurring.__freeCommunicationMatch) {", "  if (recurring && recurring.__directDebitMatch) {\n    return { auto: true, confidence: 100, reason: `Référence de domiciliation Belfius reconnue : ${recurring.label}`, recurring };\n  }\n  if (recurring && recurring.__freeCommunicationMatch) {");
      patched = patched.replace("  return structuredMatch || recurringFreeCommunicationMatch(bankRow, expense);", "  return Boolean(strongCommunicationMatch(bankRow, expense)) || structuredMatch || recurringFreeCommunicationMatch(bankRow, expense);");
      patched = patched.replace("  // Montant/date seuls ne sont plus une preuve suffisante : ils deviennent une proposition.\n  return {", "  if (!shouldOfferAmountDateFallback(bankRow, recurringExpenses)) return null;\n\n  // Montant/date seuls ne sont plus une preuve suffisante : ils deviennent une proposition.\n  return {");
      patched = patched.replace(".filter((row) => !isBeobankSavingsTransfer(row))", ".filter((row) => !classifyBankBusinessRule(row)?.excludeFromExpenseMatching)");
      patched = patched.replace("    if (usedApp.has(appIndex)) return;", "    if (usedApp.has(appIndex) || pendingApp.has(appIndex)) return;");
      patched = patched.replace(".filter(({ index }) => !usedBank.has(index));", ".filter(({ index }) => !usedBank.has(index) && !pendingBank.has(index));");
      patched = patched.replace("    if (usedBank.has(bankIndex)) return;", "    if (usedBank.has(bankIndex) || pendingBank.has(bankIndex)) return;");
      patched = patched.replace(".filter(({ index }) => !usedApp.has(index));", ".filter(({ index }) => !usedApp.has(index) && !pendingApp.has(index));");
      patched = patched.replace("export default function BelfiusAudit({", "function sameAppIdentity(left, right) {\n  return normalize(left?.label) === normalize(right?.label) && Math.abs(Number(left?.amount || 0) - Number(right?.amount || 0)) <= AMOUNT_TOLERANCE && (left?.person || 'Foyer') === (right?.person || 'Foyer');\n}\n\nexport default function BelfiusAudit({");
      patched = patched.replace("  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate);", "  const matchedApps = result?.matched?.map((entry) => entry.app) || [];\n  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate).filter((row) => isTrueOrphanAppOperation(row, { cutoffDate })).filter((row) => !matchedApps.some((matched) => matched.id !== row.id && sameAppIdentity(matched, row)));");
      patched = patched.replace("  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;", "  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;\n  const strongFingerprintCount = (audit?.rows || []).filter((row) => hasStrongCommunicationFingerprint(row, recurringExpenses)).length;");
      patched = patched.replace("          Tu peux quitter l'application et reprendre l'audit sans recharger le fichier.", "          {strongFingerprintCount > 0 ? ` ${strongFingerprintCount} empreinte(s) bancaire(s) forte(s) reconnue(s).` : ''}\n          Tu peux quitter l'application et reprendre l'audit sans recharger le fichier.");
      patched = patched.replace('<span><i className="audit-dot" />À vérifier Mon Foyer</span>', '<span><i className="audit-dot" />Écritures sans mouvement</span>');
      patched = patched.replace('<summary><span className="audit-dot" />Opérations Mon Foyer à vérifier ({actionableExtra.length})</summary>', '<summary><span className="audit-dot" />Écritures Mon Foyer sans mouvement Belfius ({actionableExtra.length})</summary>\n              <p className="audit-section-note">Écritures arrivées à échéance mais sans mouvement bancaire identifié. Elles sont à contrôler, pas automatiquement considérées comme erronées.</p>');
      if (!["classifyBankBusinessRule(row)?.excludeFromExpenseMatching", "shouldOfferAmountDateFallback(bankRow, recurringExpenses)", "Écritures Mon Foyer sans mouvement Belfius", "sameAppIdentity", "__directDebitMatch"].every((marker) => patched.includes(marker))) throw new Error('RC2.4.6 Belfius integration incomplete.');
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
        patched = patched.replace("import BelfiusAudit from './BelfiusAudit.jsx';", "import BelfiusAudit from './BelfiusAudit.jsx';\nimport { budgetIncomeTotalForMonth, forecastBalances, careBalances } from './budgetMonthRules.js';");
        patched = patched.replace("    balances[method] += operation.type === 'income' ? amount : -amount;", "    balances[method] += (operation.type === 'income' || operation.type === 'reimbursement') ? amount : -amount;");
        patched = patched.replace("  const totals = useMemo(() => {\n    return calculateTotals(effectiveMonthOperations);\n  }, [effectiveMonthOperations]);", "  const budgetIncomeTotal = useMemo(() => budgetIncomeTotalForMonth(data.operations, selectedMonth), [data.operations, selectedMonth]);\n\n  const totals = useMemo(() => { const actual = calculateTotals(effectiveMonthOperations); return { ...actual, income: budgetIncomeTotal, balance: budgetIncomeTotal - actual.fixed - actual.variable }; }, [budgetIncomeTotal, effectiveMonthOperations]);");
        patched = patched.replace("  const fullMonthTotals = useMemo(() => {\n    return calculateTotals(monthOperations);\n  }, [monthOperations]);", "  const fullMonthTotals = useMemo(() => { const actual = calculateTotals(monthOperations); return { ...actual, income: budgetIncomeTotal, balance: budgetIncomeTotal - actual.fixed - actual.variable }; }, [budgetIncomeTotal, monthOperations]);");
        patched = patched.replace("  const historyTotals = useMemo(() => {\n    const filteredTotals = calculateTotals(filteredMonthOperations);\n    return {\n      ...filteredTotals,\n      expenses: filteredTotals.fixed + filteredTotals.variable,\n    };\n  }, [filteredMonthOperations]);", "  const historyTotals = useMemo(() => { const filteredTotals = calculateTotals(filteredMonthOperations); const defaultBudgetView = historyType === 'all' && historyPerson === 'all' && historyCategory === 'all' && historyPaymentMethod === 'all' && !historySearch.trim() && !showReviewOnly; const income = defaultBudgetView ? budgetIncomeTotal : filteredTotals.income; return { ...filteredTotals, income, balance: income - filteredTotals.fixed - filteredTotals.variable, expenses: filteredTotals.fixed + filteredTotals.variable }; }, [budgetIncomeTotal, filteredMonthOperations, historyCategory, historyPaymentMethod, historyPerson, historySearch, historyType, showReviewOnly]);");
        patched = patched.replace('label="Revenus encaissés" value={formatCurrency(totals.income)}', 'label="Revenus budgétaires" value={formatCurrency(totals.income)}');
        patched = patched.replace('<span>Revenus</span>\n                  <strong className="income">{formatCurrency(historyTotals.income)}</strong>', '<span>Revenus budgétaires</span>\n                  <strong className="income">{formatCurrency(historyTotals.income)}</strong>');
        patched = patched.replace("  const availableAfterPlannedExpenses = availableForPayments - totalRemainingToCover;", "  const availableAfterPlannedExpenses = availableForPayments - totalRemainingToCover;\n  const forecastPair = forecastBalances({ appAvailable: availableForPayments, appBelfiusBalance: paymentBalances['Compte Belfius'], realBelfiusBalance: belfiusSnapshot?.balance ?? null, remainingToCover: totalRemainingToCover });\n  const careSummary = useMemo(() => careBalances(data.operations), [data.operations]);");
        patched = patched.replace("  const editingOperation = useMemo(() => {", "  const startCareReimbursement = (person) => { setDraft({ ...makeEmptyOperation(), type: 'reimbursement', category: 'divers', person, paymentMethod: 'Espèces', store: '', label: `Remboursement ${person}` }); setEditingId(null); setOperationStatus('Remboursement : choisis Compte Belfius s’il est bancaire ou Espèces s’il est remis en cash.'); setActiveView('add'); };\n\n  const editingOperation = useMemo(() => {");
        patched = patched.replace("      store: draft.type === 'income' ? '' : draft.store,\n      category: draft.type === 'income' ? 'revenus' : draft.category,", "      store: (draft.type === 'income' || draft.type === 'reimbursement') ? '' : draft.store,\n      category: draft.type === 'income' ? 'revenus' : draft.type === 'reimbursement' ? 'divers' : draft.category,");
        patched = patched.replace("    if (operation.type !== 'income' && !canPaymentMethodGoNegative(operation.paymentMethod)) {", "    if (operation.type !== 'income' && operation.type !== 'reimbursement' && !canPaymentMethodGoNegative(operation.paymentMethod)) {");
        patched = patched.replace("                  <option value=\"income\">Revenus</option>", "                  <option value=\"income\">Revenus</option>\n                  <option value=\"reimbursement\">Remboursement</option>");
        patched = patched.replace("                <select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>\n                  {PAYMENT_METHODS.map((method) => {", "                <select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>\n                  {(draft.type === 'reimbursement' ? [...PAYMENT_METHODS, 'Espèces'] : PAYMENT_METHODS).map((method) => {");
        patched = patched.replace("                  Personne\n                  <select value={draft.person}", "                  {draft.type === 'reimbursement' ? 'Source / Personne' : 'Personne'}\n                  <select value={draft.person}");
        patched = patched.replaceAll("{draft.type !== 'income' && (", "{draft.type !== 'income' && draft.type !== 'reimbursement' && (");
        patched = patched.replace("                    <option value=\"variable\">Dépenses variables</option>", "                    <option value=\"variable\">Dépenses variables</option>\n                    <option value=\"reimbursement\">Remboursements</option>");
        patched = patched.replace("  const sign = operation.type === 'income' ? '+' : '-';", "  const sign = (operation.type === 'income' || operation.type === 'reimbursement') ? '+' : '-';");
        patched = patched.replace("      <strong className={operation.type === 'income' ? 'amount income' : 'amount'}>", "      <strong className={(operation.type === 'income' || operation.type === 'reimbursement') ? 'amount income' : 'amount'}>");
        patched = patched.replace("                  <strong>Solde prévisionnel fin de mois</strong>\n                  <span>Disponible actuel : {formatCurrency(availableForPayments)}</span>\n                  <span className=\"forecast-status-label\">{forecastStatus.label}</span>", "                  <strong>Solde prévisionnel fin de mois</strong>\n                  <span>Selon Mon Foyer : <b>{formatCurrency(forecastPair.appForecast)}</b></span>\n                  {belfiusSnapshot && (<span>Selon Belfius — relevé {belfiusSnapshot.balanceDate || 'importé'} : <b>{formatCurrency(forecastPair.belfiusForecast)}</b></span>)}\n                  <span className=\"forecast-status-label\">{forecastStatus.label}</span>");
        patched = patched.replace("            <section className=\"panel\">\n              <div className=\"section-title\">\n                <h2>Budget nourriture</h2>", "            <section className=\"panel\">\n              <div className=\"section-title\"><h2>Dépenses à récupérer</h2><span>Papa & Nonna</span></div>\n              <p className=\"hint\">Un remboursement en espèces est comptabilisé ici sans créer de mouvement Belfius.</p>\n              {careSummary.map((item) => (<div key={item.person} className=\"forecast-card\"><div className=\"forecast-copy\"><strong>{item.person}</strong><span>Dépenses : {formatCurrency(item.expenses)}</span><span>Remboursé : {formatCurrency(item.reimbursed)}</span></div><div><strong className={item.balance > 0 ? 'expense' : 'income'}>{formatCurrency(item.balance)}</strong><button type=\"button\" className=\"secondary-button\" onClick={() => startCareReimbursement(item.person)}>Remboursement</button></div></div>))}\n            </section>\n\n            <section className=\"panel\">\n              <div className=\"section-title\">\n                <h2>Budget nourriture</h2>");
      }
      if (isAudit) {
        patched = patched.replace("      details: cells[communicationIndex] || cells[transactionIndex] || '',", "      details: [cells[communicationIndex], cells[transactionIndex]].filter(Boolean).join(' '),");
        patched = patched.replace("  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income');", "  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income' || appRow.type === 'reimbursement');");
        patched = patched.replace("  const learned = learnedEvidence(bankRow, appRow, learnedRules);\n  if (learned && dayDelta <= 7) return learned;\n  if (dayDelta > DATE_TOLERANCE_DAYS) return null;\n\n  const directLabel = labelsLikelyMatch(bankRow, appRow);\n  const alias = aliasMatch(bankRow, appRow);\n  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);", "  const learned = learnedEvidence(bankRow, appRow, learnedRules);\n  const directLabel = labelsLikelyMatch(bankRow, appRow);\n  const alias = aliasMatch(bankRow, appRow);\n  const directDebitRecurring = (recurringExpenses || []).find((expense) => recurringBelongsToAppRow(expense, appRow) && strongCommunicationMatch(bankRow, expense)?.kind === 'direct-debit');\n  if (directDebitRecurring && amountDelta <= AMOUNT_TOLERANCE) return { auto: true, confidence: 100, reason: `Domiciliation Belfius reconnue : ${directDebitRecurring.label}`, recurring: directDebitRecurring };\n  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);\n  if (learned && dayDelta <= 14) return learned;\n  const strongBusinessIdentity = directLabel || alias || Boolean(recurring);\n  if (dayDelta > DATE_TOLERANCE_DAYS && !(strongBusinessIdentity && dayDelta <= 14)) return null;");
        patched = patched.replace("                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.type === 'income' ? row.amount : -row.amount)}</span></article>", "                <article key={row.id} className=\"audit-missing-row\"><strong>{row.date} · {row.label}</strong><span className=\"audit-missing-actions\"><b>{money((row.type === 'income' || row.type === 'reimbursement') ? row.amount : -row.amount)}</b>{typeof onEditAppOperation === 'function' && (<button type=\"button\" className=\"audit-pencil\" title=\"Modifier cette écriture\" aria-label={`Modifier ${row.label}`} onClick={() => onEditAppOperation(row)}><Pencil size={17} /></button>)}</span></article>");
      }
      if (patched === code) throw new Error('RC2.4.6 final: integration target not found.');
      return { code: patched, map: null };
    },
  };
}


function careUxFinalIntegration() {
  return {
    name: 'mon-foyer-care-ux-final',
    enforce: 'post',
    transform(code, id) {
      const isApp = id.endsWith('/src/App.jsx') || id.endsWith('\\src\\App.jsx');
      const isAudit = id.endsWith('/src/BelfiusAudit.jsx') || id.endsWith('\\src\\BelfiusAudit.jsx');
      if (!isApp && !isAudit) return null;
      let patched = code;
      if (isApp) {
        patched = patched.replace('const careSummary = useMemo(() => careBalances(data.operations), [data.operations]);', 'const careSummary = useMemo(() => careBalances(data.operations, selectedMonth), [data.operations, selectedMonth]);\n  const careTotalToRecover = careSummary.reduce((sum, item) => sum + Math.max(Number(item.balance || 0), 0), 0);');
        patched = patched.replace('<div className="section-title"><h2>Dépenses à récupérer</h2><span>Papa & Nonna</span></div>', '<div className="section-title"><h2>Dépenses à récupérer</h2><strong>Total : {formatCurrency(careTotalToRecover)}</strong></div><p className="scheduled-caption">Papa & Nonna</p>');
        patched = patched.replace('  const editingOperation = useMemo(() => {', "  const viewCareHistory = (person) => { setHistoryPerson(person); setHistoryType('all'); setHistoryCategory('all'); setHistoryPaymentMethod('all'); setHistorySearch(''); setShowReviewOnly(false); setActiveView('history'); };\n\n  const editingOperation = useMemo(() => {");
        patched = patched.replace('{careSummary.map((item) => (<div key={item.person} className="forecast-card"><div className="forecast-copy"><strong>{item.person}</strong><span>Dépenses : {formatCurrency(item.expenses)}</span><span>Remboursé : {formatCurrency(item.reimbursed)}</span></div><div><strong className={item.balance > 0 ? \'expense\' : \'income\'}>{formatCurrency(item.balance)}</strong><button type="button" className="secondary-button" onClick={() => startCareReimbursement(item.person)}>Remboursement</button></div></div>))}', '{careSummary.map((item) => (<div key={item.person} className="forecast-card care-recovery-card"><div className="forecast-copy"><strong>{item.person}</strong><span>Solde reporté : {formatCurrency(item.carriedBalance || 0)}</span><span>Dépenses du mois : {formatCurrency(item.expenses)}</span><span>Remboursé ce mois : {formatCurrency(item.reimbursed)}</span></div><div className="care-recovery-actions"><strong className={item.balance > 0 ? \'expense\' : \'income\'}>{formatCurrency(item.balance)}</strong><button type="button" className="secondary-button care-recovery-button" onClick={() => viewCareHistory(item.person)}>Voir le détail</button><button type="button" className="secondary-button care-recovery-button" onClick={() => startCareReimbursement(item.person)}>Remboursement</button></div></div>))}');
        patched = patched.replace('<input type="text" inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="0,00" />', '<input type="text" inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} onBlur={() => { const value = parseDecimal(draft.amount); if (Number.isFinite(value)) setDraft({ ...draft, amount: value.toFixed(2).replace(\'.\', \',\') }); }} placeholder="0,00" />');
        patched = patched.replace('<input type="text" inputMode="decimal" value={recurringDraft.amount} onChange={(event) => setRecurringDraft({ ...recurringDraft, amount: event.target.value })} placeholder="0,00" />', '<input type="text" inputMode="decimal" value={recurringDraft.amount} onChange={(event) => setRecurringDraft({ ...recurringDraft, amount: event.target.value })} onBlur={() => { const value = parseDecimal(recurringDraft.amount); if (Number.isFinite(value)) setRecurringDraft({ ...recurringDraft, amount: value.toFixed(2).replace(\'.\', \',\') }); }} placeholder="0,00" />');
      }
      if (isAudit) {
        patched = patched.replace('    const automatic = candidates.filter(({ evidence }) => evidence.auto);\n    if (automatic.length === 1) {', "    const automatic = candidates.filter(({ evidence }) => evidence.auto);\n    const learnedAutomatic = automatic.filter(({ evidence }) => String(evidence.reason || '').toLowerCase().includes('apprise'));\n    if (learnedAutomatic.length === 1) { const selected = learnedAutomatic[0]; usedBank.add(bankIndex); usedApp.add(selected.index); matched.push({ bank: bankRow, app: selected.row, ...selected.evidence }); return; }\n    if (automatic.length === 1) {");
      }
      return patched === code ? null : { code: patched, map: null };
    },
  };
}

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

function leisureVacationsIntegration() {
  return {
    name: 'mon-foyer-leisure-vacations',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') && !id.endsWith('\\src\\App.jsx')) return null;
      let patched = code;

      if (!patched.includes("import LeisureVacations from './LeisureVacations.jsx';")) {
        patched = patched.replace(
          "import SavingsInterface, { REQUIRED_SAVINGS_GOALS, savingsBucketForDisplay } from './SavingsInterface.jsx';",
          "import SavingsInterface, { REQUIRED_SAVINGS_GOALS, savingsBucketForDisplay } from './SavingsInterface.jsx';\nimport LeisureVacations from './LeisureVacations.jsx';\nimport './NavSix.css';",
        );
      } else if (!patched.includes("import './NavSix.css';")) {
        patched = patched.replace(
          "import LeisureVacations from './LeisureVacations.jsx';",
          "import LeisureVacations from './LeisureVacations.jsx';\nimport './NavSix.css';",
        );
      }

      if (!patched.includes("import DuplicateAudit from './DuplicateAudit.jsx';")) {
        patched = patched.replace(
          "import LeisureVacations from './LeisureVacations.jsx';",
          "import LeisureVacations from './LeisureVacations.jsx';\nimport DuplicateAudit from './DuplicateAudit.jsx';",
        );
      }

      // Une opération passée ou datée d'aujourd'hui est exécutée, pas programmée.
      patched = patched.replace(
        ".filter((operation) => operation.type !== 'income' && operation.date > scheduleCutoff);",
        ".filter((operation) => operation.type !== 'income' && operation.date > today);",
      );
      patched = patched.replace(
        "        operation.date > scheduleCutoff\n        && !existingFixedSignatures.has(fixedExpenseSignature(operation))",
        "        operation.date > today\n        && !existingFixedSignatures.has(fixedExpenseSignature(operation))",
      );

      // Lecture budgétaire mensuelle : le grand solde est Revenus budgétaires du mois
      // moins dépenses exécutées du mois. Le report historique des moyens de paiement
      // reste visible séparément mais n'altère plus le résultat du mois.
      patched = patched.replace(
        "  const availableForPayments = useMemo(\n    () => PAYMENT_METHODS.reduce((sum, method) => sum + (paymentBalances[method] || 0), 0),\n    [paymentBalances],\n  );",
        "  const availableForPayments = totals.balance;",
      );

      // Le badge Compte Belfius doit refléter le dernier solde bancaire réellement importé.
      // Le cumul interne reste réservé au contrôle de rapprochement.
      patched = patched.replace(
        "                      <em className={paymentBalances[method] >= 0 ? 'positive' : 'negative'}>\n                        {formatCurrency(paymentBalances[method])}\n                      </em>",
        "                      {(() => { const displayedBalance = method === 'Compte Belfius' && belfiusSnapshot ? Number(belfiusSnapshot.balance || 0) : Number(paymentBalances[method] || 0); return <em className={displayedBalance >= 0 ? 'positive' : 'negative'}>{formatCurrency(displayedBalance)}</em>; })()}",
      );

      // Le budget nourriture restant est une enveloppe indicative, pas une dépense déjà engagée.
      // Le prévisionnel financier ne déduit donc que les opérations effectivement programmées.
      patched = patched.replace(
        "  const totalRemainingToCover = scheduledExpenseTotal + remainingFoodBudget;",
        "  const totalRemainingToCover = scheduledExpenseTotal;",
      );
      patched = patched.replace(
        '<span>Dépenses programmées : {formatCurrency(scheduledExpenseTotal)}</span>\n                  <span>Budget nourriture restant : {formatCurrency(remainingFoodBudget)}</span>',
        '<span>Dépenses programmées : {formatCurrency(scheduledExpenseTotal)}</span>\n                  <span>Budget nourriture restant : {formatCurrency(remainingFoodBudget)} · indicatif, non déduit</span>',
      );
      patched = patched.replace(
        '<div><span>− Budget nourriture restant</span><strong>− {formatCurrency(remainingFoodBudget)}</strong></div>',
        '<div><span>Budget nourriture restant (indicatif)</span><strong>{formatCurrency(remainingFoodBudget)}</strong></div>',
      );
      patched = patched.replace(
        '<span>Disponible pour les paiements</span>\n                <strong>{formatCurrency(availableForPayments)}</strong>',
        '<span>Solde budgétaire actuel</span>\n                <strong>{formatCurrency(availableForPayments)}</strong>',
      );
      patched = patched.replace(
        '<span>Disponible actuel : {formatCurrency(availableForPayments)}</span>',
        '<span>Solde budgétaire actuel : {formatCurrency(availableForPayments)}</span>',
      );
      patched = patched.replace(
        '<div><span>Disponible actuel</span><strong>{formatCurrency(availableForPayments)}</strong></div>',
        '<div><span>Solde budgétaire actuel</span><strong>{formatCurrency(availableForPayments)}</strong></div>',
      );

      // Totaux lisibles en un coup d'œil.
      patched = patched.replace(
        '<h2>Dépenses programmées</h2>\n                <strong>{formatCurrency(scheduledExpenseTotal)}</strong>',
        '<h2>Dépenses programmées</h2>\n                <strong>Total : {formatCurrency(scheduledExpenseTotal)}</strong>',
      );
      patched = patched.replace(
        'const careSummary = useMemo(() => careBalances(data.operations), [data.operations]);',
        "const careSummary = useMemo(() => careBalances(data.operations, selectedMonth), [data.operations, selectedMonth]);\n  const careTotalToRecover = careSummary.reduce((sum, item) => sum + Math.max(Number(item.balance || 0), 0), 0);",
      );
      patched = patched.replace(
        '<div className="section-title"><h2>Dépenses à récupérer</h2><span>Papa & Nonna</span></div>',
        '<div className="section-title"><h2>Dépenses à récupérer</h2><strong>Total : {formatCurrency(careTotalToRecover)}</strong></div><p className="scheduled-caption">Papa & Nonna</p>',
      );

      // Contrôle explicite de l'écart entre la comptabilité Mon Foyer et le dernier solde Belfius.
      const scheduledAnchor = '            <section className="panel scheduled-panel">';
      if (!patched.includes('Contrôle de la balance Belfius')) {
        patched = patched.replace(
          scheduledAnchor,
          `            {belfiusSnapshot && (\n              <section className="panel">\n                <div className="section-title"><h2>Contrôle de la balance Belfius</h2><strong className={Math.abs(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0)) < 0.01 ? 'income' : 'expense'}>{formatCurrency(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0))}</strong></div>\n                <div className="history-summary">\n                  <div><span>Solde Mon Foyer cumulé</span><strong>{formatCurrency(paymentBalances['Compte Belfius'] || 0)}</strong></div>\n                  <div><span>Solde Belfius réel</span><strong>{formatCurrency(belfiusSnapshot.balance || 0)}</strong></div>\n                  <div><span>Écart comptable</span><strong className={Math.abs(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0)) < 0.01 ? 'income' : 'expense'}>{formatCurrency(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0))}</strong></div>\n                </div>\n                <p className="hint">Ce contrôle bancaire est distinct du solde budgétaire mensuel. {Math.abs(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0)) < 0.01 ? 'Balance conforme au dernier relevé Belfius.' : 'Écart à auditer : il peut provenir d’un solde d’ouverture absent, d’une écriture manquante ou d’un doublon. Aucun ajustement automatique n’est effectué.'}</p>\n              </section>\n            )}\n\n${scheduledAnchor}`,
        );
      }

      const savingsBlock = '<SavingsInterface goals={data.savingsGoals} bankSavings={bankSavings} onUpdate={updateGoal} />';
      if (!patched.includes('leisure-launch-card')) {
        patched = patched.replace(
          savingsBlock,
          `${savingsBlock}\n            <div className="leisure-launch-card">\n              <div><strong>Loisirs / Vacances</strong><span>Suivre le solde Beobank et enregistrer restaurants, hôtels et voyages.</span></div>\n              <button type="button" onClick={() => setActiveView('leisure')}>Ouvrir</button>\n            </div>`,
        );
      }

      const addViewAnchor = "        {activeView === 'add' && (";
      if (!patched.includes("activeView === 'leisure'")) {
        patched = patched.replace(
          addViewAnchor,
          `        {activeView === 'leisure' && (\n          <LeisureVacations\n            goal={data.savingsGoals.find((goal) => savingsBucketForGoal(goal) === 'vacances')}\n            onUpdateGoal={updateGoal}\n            onBack={() => setActiveView('home')}\n          />\n        )}\n\n${addViewAnchor}`,
        );
      }

      const historyAnchor = "        {activeView === 'history' && (\n          <section className=\"view\">\n            <div className=\"panel\">";
      if (!patched.includes('mode="history"')) {
        patched = patched.replace(
          historyAnchor,
          "        {activeView === 'history' && (\n          <section className=\"view\">\n            <DuplicateAudit mode=\"history\" operations={data.operations} selectedMonth={selectedMonth} onDeleteOperation={(row) => deleteOperation(row.id)} />\n            <div className=\"panel\">",
        );
      }

      const settingsAnchor = "        {activeView === 'settings' && (\n          <section className=\"view\">";
      if (!patched.includes('mode="recurring"')) {
        patched = patched.replace(
          settingsAnchor,
          "        {activeView === 'settings' && (\n          <section className=\"view\">\n            <DuplicateAudit mode=\"recurring\" recurringExpenses={data.recurringFixedExpenses || []} onDeleteRecurring={(row) => deleteRecurringFixedExpense(row.id)} />",
        );
      }

      if (!patched.includes('label="Loisirs"')) {
        patched = patched.replace(
          '<NavButton icon={ReceiptText} label="Historique" active={activeView === \'history\'} onClick={() => setActiveView(\'history\')} />',
          '<NavButton icon={ReceiptText} label="Historique" active={activeView === \'history\'} onClick={() => setActiveView(\'history\')} />\n        <NavButton icon={Umbrella} label="Loisirs" active={activeView === \'leisure\'} onClick={() => setActiveView(\'leisure\')} />',
        );
      }

      if (!patched.includes("import LeisureVacations from './LeisureVacations.jsx';")
        || !patched.includes("import DuplicateAudit from './DuplicateAudit.jsx';")
        || !patched.includes('Total : {formatCurrency(careTotalToRecover)}')
        || !patched.includes('Contrôle de la balance Belfius')
        || !patched.includes('const availableForPayments = totals.balance;')
        || !patched.includes("method === 'Compte Belfius' && belfiusSnapshot")
        || !patched.includes('const totalRemainingToCover = scheduledExpenseTotal;')
        || !patched.includes('onDeleteOperation={(row) => deleteOperation(row.id)}')
        || !patched.includes('onDeleteRecurring={(row) => deleteRecurringFixedExpense(row.id)}')
        || !patched.includes("operation.type !== 'income' && operation.date > today")) {
        throw new Error('Intégration finale Loisirs/Audit/Totaux/Balance mensuelle incomplète');
      }
      return { code: patched, map: null };
    },
  };
}

function savingsTransferIntegration() {
  return {
    name: 'mon-foyer-savings-transfer',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') && !id.endsWith('\\src\\App.jsx')) return null;
      let patched = code;

      // Utilise exactement la même logique de consolidation que l'écran Épargne :
      // un seul poste par catégorie canonique, meilleure valeur conservée, anciens doublons exclus.
      if (!patched.includes('function transferSavingsGoals(goals = [])')) {
        patched = patched.replace(
          'const iconMap = {',
          `function transferSavingsGoals(goals = []) {
  const byBucket = new Map();
  goals.forEach((goal) => {
    const bucket = savingsBucketForDisplay(goal);
    if (bucket === 'autre') return;
    const current = byBucket.get(bucket);
    const currentWeight = current
      ? Math.abs(Number(current.saved || 0)) * 100000 + Math.abs(Number(current.target || 0))
      : -1;
    const candidateWeight = Math.abs(Number(goal.saved || 0)) * 100000 + Math.abs(Number(goal.target || 0));
    if (!current || candidateWeight > currentWeight) byBucket.set(bucket, goal);
  });

  const order = ['solde_peugeot', 'vacances', 'garage', 'taxes', 'frais_maison', 'pension_alain', 'pension_esther', 'urgence'];
  return [...byBucket.entries()]
    .sort(([bucketA], [bucketB]) => {
      const a = order.indexOf(bucketA);
      const b = order.indexOf(bucketB);
      return (a < 0 ? 999 : a) - (b < 0 ? 999 : b);
    })
    .map(([bucket, goal]) => ({
      ...goal,
      transferLabel: REQUIRED_SAVINGS_GOALS.find((item) => item.bucket === bucket)?.label || goal.label,
    }));
}

const iconMap = {`,
        );
      }

      // "Transfert depuis l'épargne" est un type d'interface distinct, mais reste
      // techniquement enregistré comme un revenu interne afin de créditer le compte courant.
      patched = patched.replace(
        'value={draft.type}\n                  onChange={(event) => {\n                    const type = event.target.value;',
        "value={draft.type === 'income' && draft.savingsSource ? 'transfer' : draft.type}\n                  onChange={(event) => {\n                    const selectedType = event.target.value;\n                    const type = selectedType === 'transfer' ? 'income' : selectedType;\n                    const savingsSource = selectedType === 'transfer'\n                      ? (draft.savingsSource || transferSavingsGoals(data.savingsGoals)[0]?.id || '')\n                      : selectedType === 'income' ? '' : draft.savingsSource;",
      );
      patched = patched.replace(
        '                      type,\n                      category: nextCategory,',
        '                      type,\n                      category: nextCategory,\n                      savingsSource,',
      );
      if (!patched.includes('<option value="transfer">Transfert depuis l’épargne</option>')) {
        patched = patched.replace(
          '<option value="income">Revenus</option>',
          '<option value="income">Revenus</option>\n                  <option value="transfer">Transfert depuis l’épargne</option>',
        );
      }

      patched = patched.replace(
        '                  Source du revenu\n                  <select value={draft.savingsSource || \'\'}',
        "                  {draft.savingsSource ? 'Compte épargne source' : 'Source du revenu'}\n                  <select value={draft.savingsSource || ''}",
      );
      patched = patched.replace(
        '<option value="">Revenu du foyer</option>\n                    {data.savingsGoals.map((goal) => (<option key={goal.id} value={goal.id}>Épargne {goal.label}</option>))}',
        "{!draft.savingsSource && <option value=\"\">Revenu du foyer</option>}\n                    {transferSavingsGoals(data.savingsGoals).map((goal) => (<option key={goal.id} value={goal.id}>{goal.transferLabel} · {formatCurrency(goal.saved || 0)}</option>))}",
      );

      patched = patched.replace(
        'placeholder="Ex. Courses, salaire, assurance"',
        "placeholder={draft.savingsSource ? 'Ex. Paiement taxe, régularisation voiture…' : 'Ex. Courses, salaire, assurance'}",
      );
      patched = patched.replace(
        '<label>\n                Moyen de paiement',
        "<label>\n                {draft.savingsSource ? 'Compte de destination' : 'Moyen de paiement'}",
      );
      patched = patched.replace(
        '<select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>',
        "<select value={draft.paymentMethod} disabled={Boolean(draft.savingsSource)} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>",
      );
      patched = patched.replace(
        '                      savingsSource,\n                    });',
        "                      savingsSource,\n                      paymentMethod: selectedType === 'transfer' ? 'Compte Belfius' : draft.paymentMethod,\n                    });",
      );

      if (!patched.includes('function transferSavingsGoals(goals = [])')
        || !patched.includes('transferSavingsGoals(data.savingsGoals)')
        || !patched.includes("selectedType === 'transfer'")
        || !patched.includes('<option value="transfer">Transfert depuis l’épargne</option>')
        || !patched.includes("'Compte épargne source'")
        || !patched.includes("disabled={Boolean(draft.savingsSource)}")) {
        throw new Error('Intégration Transfert depuis épargne incomplète');
      }

      return { code: patched, map: null };
    },
  };
}

export default defineConfig({ plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careHotfixIntegration(), leisureVacationsIntegration(), savingsTransferIntegration(), careUxFinalIntegration(), react()] });
