import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Patch introuvable: ${label}`);
  return source.replace(from, to);
}

function replaceRegex(source, regex, to, label) {
  if (!regex.test(source)) throw new Error(`Patch regex introuvable: ${label}`);
  regex.lastIndex = 0;
  return source.replace(regex, to);
}

// ---------------------------------------------------------------------------
// App.jsx
// ---------------------------------------------------------------------------
const appPath = 'src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  `const PEOPLE = ['Foyer', 'Alain', 'Esther', 'Nonna'];`,
  `const PEOPLE = ['Foyer', 'Alain', 'Esther', 'Nonna', 'Papa'];`,
  'ajout Papa',
);

app = replaceOnce(
  app,
  `const LEGACY_OPERATION_COLUMNS = 'id, date, person, type, category, store, label, amount';`,
  `const LEGACY_OPERATION_COLUMNS = 'id, date, person, type, category, store, label, amount';\nconst APPLIED_SAVINGS_STORAGE_KEY = 'mon-foyer-belfius-savings-applied-v1';\n\nfunction savingsBucketForGoal(goal) {\n  const text = String(goal?.label || goal?.id || '')\n    .toLowerCase()\n    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '');\n  if (text.includes('vacance') || text.includes('loisir')) return 'vacances';\n  if (text.includes('voiture') || text.includes('auto')) return 'voiture';\n  if (text.includes('pension')) return 'pension';\n  if (text.includes('urgence')) return 'urgence';\n  if (text.includes('maison')) return 'maison';\n  return String(goal?.id || 'autre');\n}`,
  'helpers épargne',
);

app = replaceOnce(
  app,
  `  const [bankSavings, setBankSavings] = useState({});`,
  `  const [bankSavings, setBankSavings] = useState({});\n  const [belfiusSnapshot, setBelfiusSnapshot] = useState(null);`,
  'snapshot Belfius',
);

app = replaceOnce(
  app,
  `  const synchronizeBelfiusBalance = async ({ balance, balanceDate, month }) => {`,
  `  const handleBankSavingsDetected = (detection, auditMeta = {}) => {\n    const totals = detection?.totals || detection || {};\n    const transfers = detection?.transfers || [];\n    setBankSavings(totals);\n    if (!transfers.length) return;\n\n    let applied = {};\n    try { applied = JSON.parse(localStorage.getItem(APPLIED_SAVINGS_STORAGE_KEY) || '{}'); } catch { applied = {}; }\n    const freshTransfers = transfers.filter((transfer) => !applied[transfer.fingerprint]);\n    if (!freshTransfers.length) return;\n\n    const increments = freshTransfers.reduce((map, transfer) => {\n      map[transfer.bucket] = (map[transfer.bucket] || 0) + Math.abs(Number(transfer.amount) || 0);\n      return map;\n    }, {});\n\n    setData((current) => {\n      const changedGoals = [];\n      const savingsGoals = current.savingsGoals.map((goal) => {\n        const bucket = savingsBucketForGoal(goal);\n        const increment = increments[bucket] || 0;\n        if (!increment) return goal;\n        const next = { ...goal, saved: Number(goal.saved || 0) + increment };\n        changedGoals.push(next);\n        return next;\n      });\n      const nextData = { ...current, savingsGoals };\n      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));\n\n      if (USE_REMOTE_BUDGET && changedGoals.length) {\n        changedGoals.forEach((goal) => {\n          supabase.from('savings_goals')\n            .update({ saved: Number(goal.saved) })\n            .eq('id', goal.id)\n            .eq('household_id', householdId)\n            .then(() => {});\n        });\n      }\n      return nextData;\n    });\n\n    freshTransfers.forEach((transfer) => {\n      applied[transfer.fingerprint] = {\n        bucket: transfer.bucket,\n        amount: transfer.amount,\n        appliedAt: new Date().toISOString(),\n        source: auditMeta.fileName || 'Belfius CSV',\n      };\n    });\n    localStorage.setItem(APPLIED_SAVINGS_STORAGE_KEY, JSON.stringify(applied));\n  };\n\n  const synchronizeBelfiusBalance = async ({ balance, balanceDate, month }) => {`,
  'application épargne bancaire',
);

app = replaceOnce(
  app,
  `      store: label,\n      paymentMethod: 'Compte Belfius',\n      label: recurringCandidate?.label || (normalized.includes('lanza michel') ? 'Coiffeur' : label),`,
  `      store: bankRow?.learnedSuggestion?.store || label,\n      paymentMethod: 'Compte Belfius',\n      person: bankRow?.learnedSuggestion?.person || 'Foyer',\n      label: recurringCandidate?.label || bankRow?.learnedSuggestion?.label || (normalized.includes('lanza michel') ? 'Coiffeur' : label),`,
  'suggestion apprise ajout Belfius',
);

app = replaceOnce(
  app,
  `      category: Number(bankRow?.amount || 0) > 0 ? 'revenus' : category,`,
  `      category: Number(bankRow?.amount || 0) > 0 ? 'revenus' : (bankRow?.learnedSuggestion?.category || category),`,
  'catégorie apprise ajout Belfius',
);

app = replaceOnce(
  app,
  `                </div>\n              </div>\n              <PiggyBank size={42} />`,
  `                </div>\n                {belfiusSnapshot && (\n                  <details className={\`belfius-real-balance ${belfiusSnapshot.clean ? 'is-clean' : 'has-gap'}\`}>\n                    <summary>\n                      <span>Solde Belfius réel</span>\n                      <strong>{formatCurrency(belfiusSnapshot.balance)}</strong>\n                    </summary>\n                    <div className=\"belfius-real-balance-details\">\n                      <span>Relevé : {belfiusSnapshot.balanceDate || 'dernier CSV importé'}</span>\n                      <span>Solde Mon Foyer : {formatCurrency(paymentBalances['Compte Belfius'] || 0)}</span>\n                      <span>Écart : {formatCurrency((paymentBalances['Compte Belfius'] || 0) - Number(belfiusSnapshot.balance || 0))}</span>\n                      <span>{belfiusSnapshot.remaining || 0} opération(s) à traiter</span>\n                      <strong>{belfiusSnapshot.clean ? 'Conforme à Belfius' : 'Rapprochement en cours'}</strong>\n                    </div>\n                  </details>\n                )}\n              </div>\n              <PiggyBank size={42} />`,
  'solde Belfius accueil',
);

app = replaceOnce(
  app,
  `                  <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} bankDetected={bankSavings[goal.id] || 0} />`,
  `                  <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} bankDetected={bankSavings[savingsBucketForGoal(goal)] || 0} />`,
  'liaison épargne détection',
);

app = replaceOnce(
  app,
  `              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}\n              onSavingsDetected={setBankSavings}\n              onAddBankOperation={addBankOperationFromAudit}`,
  `              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}\n              onSavingsDetected={handleBankSavingsDetected}\n              onAuditSnapshot={setBelfiusSnapshot}\n              onEditAppOperation={editOperation}\n              onAddBankOperation={addBankOperationFromAudit}`,
  'callbacks audit',
);

fs.writeFileSync(appPath, app);

// ---------------------------------------------------------------------------
// BelfiusAudit.jsx
// ---------------------------------------------------------------------------
const auditPath = 'src/BelfiusAudit.jsx';
let audit = fs.readFileSync(auditPath, 'utf8');

audit = replaceOnce(
  audit,
  `const AUDIT_STORAGE_KEY = 'mon-foyer-belfius-audit-v1';`,
  `const AUDIT_STORAGE_KEY = 'mon-foyer-belfius-audit-v1';\nconst LEARNING_STORAGE_KEY = 'mon-foyer-belfius-learning-v1';\n\nfunction loadLearnedRules() {\n  try {\n    const parsed = JSON.parse(localStorage.getItem(LEARNING_STORAGE_KEY) || '[]');\n    return Array.isArray(parsed) ? parsed : [];\n  } catch {\n    return [];\n  }\n}\n\nfunction persistLearnedRules(rules) {\n  localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(rules));\n}`,
  'stockage apprentissage',
);

const newDetectSavings = `function detectSavingsTransfers(rows) {\n  const totals = {};\n  const transfers = [];\n  const add = (bucket, row) => {\n    const amount = Math.abs(Number(row.amount) || 0);\n    totals[bucket] = (totals[bucket] || 0) + amount;\n    transfers.push({\n      bucket,\n      amount,\n      date: row.date,\n      label: row.label,\n      communication: row.communication || '',\n      fingerprint: [row.date, Number(row.amount).toFixed(2), normalize(row.label), normalize(row.communication || row.details)].join('|'),\n    });\n  };\n\n  (rows || []).forEach((row) => {\n    if (row.amount >= 0) return;\n    const text = normalize(\`${'${row.label || \'\'} ${row.communication || \'\'} ${row.details || \'\'}'}\`);\n    const amount = Math.abs(Number(row.amount) || 0);\n\n    // Règle métier RC2.4.6 : tous les transferts vers Beobank alimentent Vacances/Loisirs.\n    if (text.includes('beobank')) { add('vacances', row); return; }\n    if (text.includes('pour voiture') || text.includes('epargne voiture')) { add('voiture', row); return; }\n    if (text.includes('vacances') || text.includes('epargne vacances') || text.includes('loisirs')) { add('vacances', row); return; }\n    if (text.includes('fonds urgence') || text.includes('fonds d urgence') || text.includes('epargne urgence')) { add('urgence', row); return; }\n    if (text.includes('epargne maison') || text.includes('reserve maison')) { add('maison', row); return; }\n    if (text.includes('pension') || (text.includes('ethias') && Math.abs(amount - 110) <= AMOUNT_TOLERANCE)) { add('pension', row); return; }\n  });\n\n  return { totals, transfers };\n}\n\nfunction labelText`;

audit = replaceRegex(
  audit,
  /function detectSavingsTransfers\(rows\) \{[\s\S]*?\n\}\n\nfunction labelText/,
  newDetectSavings,
  'détection épargne Beobank',
);

const newFindRecurring = `function findRecurringMatch(bankRow, appRow, recurringExpenses) {\n  if (bankRow.amount >= 0 || appRow.type === 'income') return null;\n  const operationAmount = Math.abs(Number(appRow.amount) || 0);\n  const day = Number(appRow.date?.slice(8, 10));\n  const bankCommunication = normalizedCommunication(bankRow.structuredCommunication || bankRow.communication);\n  const identityCandidates = (recurringExpenses || []).filter((expense) => {\n    const recurringAmount = Math.abs(Number(expense.amount) || 0);\n    return recurringBelongsToAppRow(expense, appRow)\n      && Math.abs(recurringAmount - operationAmount) <= AMOUNT_TOLERANCE;\n  });\n\n  // L'empreinte bancaire est prioritaire sur le jour théorique du prélèvement.\n  if (bankCommunication) {\n    const exactCommunication = identityCandidates.find((expense) => {\n      const expected = recurringCommunication(expense);\n      return expected && (bankCommunication.includes(expected) || expected.includes(bankCommunication));\n    });\n    if (exactCommunication) return { ...exactCommunication, __communicationMatch: true };\n  }\n  const freeCommunication = identityCandidates.find((expense) => recurringFreeCommunicationMatch(bankRow, expense));\n  if (freeCommunication) return { ...freeCommunication, __freeCommunicationMatch: true };\n\n  const datedCandidates = identityCandidates.filter((expense) => {\n    const recurringDay = Number(expense.day) || 1;\n    return Math.abs(recurringDay - day) <= DATE_TOLERANCE_DAYS;\n  });\n  return datedCandidates[0] || null;\n}\n\nfunction learnedBankIdentityMatches(rule, bankRow) {\n  if (!rule || !bankRow) return false;\n  if (normalize(rule.bankLabel) !== normalize(bankRow.label)) return false;\n  const expectedStructured = normalizedCommunication(rule.structuredCommunication || '');\n  if (expectedStructured) {\n    const actual = normalizedCommunication(bankRow.structuredCommunication || bankRow.communication);\n    return actual.includes(expectedStructured);\n  }\n  return true;\n}\n\nfunction learnedTargetMatches(rule, appRow) {\n  if (!rule?.target || !appRow) return false;\n  const target = rule.target;\n  if (target.label && normalize(target.label) === normalize(appRow.label)) return true;\n  if (target.category && target.category === appRow.category) {\n    if (!target.store) return true;\n    return normalize(target.store) === normalize(appRow.store || '');\n  }\n  return false;\n}\n\nfunction learnedEvidence(bankRow, appRow, learnedRules) {\n  const rule = (learnedRules || []).find((item) => learnedBankIdentityMatches(item, bankRow) && learnedTargetMatches(item, appRow));\n  if (!rule) return null;\n  return {\n    auto: true,\n    confidence: 100,\n    reason: 'Correspondance apprise et confirmée précédemment',\n    recurring: null,\n    learned: true,\n  };\n}\n\nfunction suggestionForBankRow(bankRow, learnedRules) {\n  const rule = (learnedRules || []).find((item) => learnedBankIdentityMatches(item, bankRow));\n  return rule?.target || null;\n}\n\nfunction matchEvidence`;

audit = replaceRegex(
  audit,
  /function findRecurringMatch\(bankRow, appRow, recurringExpenses\) \{[\s\S]*?\n\}\n\nfunction matchEvidence/,
  newFindRecurring,
  'empreinte prioritaire et apprentissage',
);

audit = replaceOnce(
  audit,
  `function matchEvidence(bankRow, appRow, recurringExpenses) {\n  const amountDelta = Math.abs(Math.abs(Number(appRow.amount) || 0) - Math.abs(bankRow.amount));\n  const dayDelta = dateDistance(bankRow.date, appRow.date);\n  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income');\n  if (!directionMatches || amountDelta > AMOUNT_TOLERANCE || dayDelta > DATE_TOLERANCE_DAYS) return null;`,
  `function matchEvidence(bankRow, appRow, recurringExpenses, learnedRules = []) {\n  const amountDelta = Math.abs(Math.abs(Number(appRow.amount) || 0) - Math.abs(bankRow.amount));\n  const dayDelta = dateDistance(bankRow.date, appRow.date);\n  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income');\n  if (!directionMatches || amountDelta > AMOUNT_TOLERANCE) return null;\n\n  const learned = learnedEvidence(bankRow, appRow, learnedRules);\n  if (learned && dayDelta <= 7) return learned;\n  if (dayDelta > DATE_TOLERANCE_DAYS) return null;`,
  'evidence apprise',
);

audit = replaceOnce(
  audit,
  `function reconcile(bankRows, operations, selectedMonth, recurringExpenses) {`,
  `function reconcile(bankRows, operations, selectedMonth, recurringExpenses, learnedRules = []) {`,
  'signature reconcile',
);

audit = replaceOnce(
  audit,
  `        evidence: usedApp.has(index) ? null : matchEvidence(bankRow, row, recurringExpenses),`,
  `        evidence: usedApp.has(index) ? null : matchEvidence(bankRow, row, recurringExpenses, learnedRules),`,
  'apprentissage reconcile',
);

audit = replaceOnce(
  audit,
  `  onSavingsDetected,\n}) {`,
  `  onSavingsDetected,\n  onAuditSnapshot,\n  onEditAppOperation,\n}) {`,
  'props audit',
);

audit = replaceOnce(
  audit,
  `  const [error, setError] = useState('');`,
  `  const [error, setError] = useState('');\n  const [learnedRules, setLearnedRules] = useState(loadLearnedRules);`,
  'state apprentissage',
);

audit = replaceOnce(
  audit,
  `    () => audit ? reconcile(audit.rows, operations, selectedMonth, recurringExpenses) : null,\n    [audit, operations, recurringExpenses, selectedMonth],`,
  `    () => audit ? reconcile(audit.rows, operations, selectedMonth, recurringExpenses, learnedRules) : null,\n    [audit, learnedRules, operations, recurringExpenses, selectedMonth],`,
  'memo apprentissage',
);

audit = replaceOnce(
  audit,
  `        onSavingsDetected(detectSavingsTransfers(parsedAudit.rows));`,
  `        onSavingsDetected(detectSavingsTransfers(parsedAudit.rows), parsedAudit);`,
  'callback épargne détaillée',
);

audit = replaceOnce(
  audit,
  `  const safeMonth = result?.auditMonth || selectedMonth || '';`,
  `  const confirmMatch = (bankRow, appRow) => {\n    const rule = {\n      id: crypto.randomUUID(),\n      bankLabel: bankRow.label || '',\n      structuredCommunication: bankRow.structuredCommunication || '',\n      freeCommunication: bankRow.communication || '',\n      target: {\n        label: appRow.label || '',\n        category: appRow.category || '',\n        store: appRow.store || '',\n        person: appRow.person || 'Foyer',\n        type: appRow.type || 'variable',\n      },\n      confirmedAt: new Date().toISOString(),\n    };\n    const nextRules = [\n      ...learnedRules.filter((item) => !(normalize(item.bankLabel) === normalize(rule.bankLabel)\n        && normalize(item.target?.label) === normalize(rule.target.label))),\n      rule,\n    ];\n    persistLearnedRules(nextRules);\n    setLearnedRules(nextRules);\n  };\n\n  const safeMonth = result?.auditMonth || selectedMonth || '';`,
  'confirmation apprentissage',
);

// Choix sécurisé : ne jamais créer automatiquement une écriture d'ajustement pour forcer le solde.
audit = replaceOnce(
  audit,
  `  const canSynchronize = auditIsClean\n    && Math.abs(difference) >= 0.01\n    && balanceMonth === result?.auditMonth\n    && typeof onSynchronizeBelfiusBalance === 'function';`,
  `  const canSynchronize = false; // RC2.4.6 : le CSV reste une référence de contrôle, jamais une écriture silencieuse.`,
  'désactivation ajustement automatique',
);

audit = replaceOnce(
  audit,
  `  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;`,
  `  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;\n\n  useEffect(() => {\n    if (!audit || typeof onAuditSnapshot !== 'function') return;\n    onAuditSnapshot({\n      balance: Number(audit.balance || 0),\n      balanceDate: audit.balanceDate || '',\n      importedAt: audit.importedAt || '',\n      remaining: remainingToTreat,\n      confirmations: result?.review.length || 0,\n      anomalies: monthMissing.length + actionableExtra.length,\n      clean: auditIsClean && Math.abs(difference) < 0.01,\n    });\n  }, [audit?.balance, audit?.balanceDate, audit?.importedAt, auditIsClean, difference, monthMissing.length, actionableExtra.length, remainingToTreat, result?.review.length]);`,
  'snapshot vers accueil',
);

const oldReview = `                  <span>\n                    {reason} → {candidates.map(({ app, confidence }) => \`${'${app.label} (${confidence}%)'}\`).join(' / ')}\n                  </span>`;
const newReview = `                  <div className=\"audit-review-proposals\">\n                    <span>{reason}</span>\n                    {candidates.map((candidate) => (\n                      <div className=\"audit-review-choice\" key={candidate.app.id}>\n                        <span>{candidate.app.label} ({candidate.confidence}%)</span>\n                        <div className=\"audit-review-actions\">\n                          <button type=\"button\" className=\"audit-confirm\" onClick={() => confirmMatch(bank, candidate.app)}>✓ Valider</button>\n                          {typeof onEditAppOperation === 'function' && (\n                            <button type=\"button\" className=\"audit-correct\" onClick={() => onEditAppOperation(candidate.app)}>Corriger</button>\n                          )}\n                        </div>\n                      </div>\n                    ))}\n                    {typeof onAddBankOperation === 'function' && (\n                      <button type=\"button\" className=\"audit-none\" onClick={() => onAddBankOperation({ ...bank, learnedSuggestion: suggestionForBankRow(bank, learnedRules) })}>Aucune proposition / créer</button>\n                    )}\n                  </div>`;
audit = replaceOnce(audit, oldReview, newReview, 'actions confirmer/corriger');

audit = replaceOnce(
  audit,
  `onClick={() => onAddBankOperation(row)}`,
  `onClick={() => onAddBankOperation({ ...row, learnedSuggestion: suggestionForBankRow(row, learnedRules) })}`,
  'suggestion apprise crayon',
);

fs.writeFileSync(auditPath, audit);

// ---------------------------------------------------------------------------
// styles.css
// ---------------------------------------------------------------------------
const stylesPath = 'src/styles.css';
let styles = fs.readFileSync(stylesPath, 'utf8');
styles += `\n\n/* V32 RC2.4.6 — apprentissage, solde réel et cohérence visuelle */\n.audit-pencil, .operation-row .icon-button, .operation-row button[aria-label*=\"Modifier\"] {\n  width: 38px; height: 38px; min-height: 38px; padding: 0; border: 0; border-radius: 999px;\n  display: inline-grid; place-items: center; background: #e5f3ea; color: #2f7d57; cursor: pointer;\n}\n.audit-pencil:hover, .operation-row button[aria-label*=\"Modifier\"]:hover { background: #d7ebdf; }\n.audit-review-proposals { display: grid; gap: 8px; min-width: min(100%, 430px); }\n.audit-review-choice { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,.72); }\n.audit-review-actions { display: flex; gap: 6px; flex-wrap: wrap; }\n.audit-confirm, .audit-correct, .audit-none { min-height: 34px; padding: 6px 10px; border: 0; border-radius: 999px; font-weight: 800; cursor: pointer; }\n.audit-confirm { background: #dff2e6; color: #256744; }\n.audit-correct { background: #e8f1fb; color: #245f91; }\n.audit-none { justify-self: end; background: #f2f3f4; color: #5f6b74; }\n.belfius-real-balance { margin-top: 10px; border: 1px solid rgba(255,255,255,.35); border-radius: 14px; background: rgba(255,255,255,.12); overflow: hidden; }\n.belfius-real-balance summary { display: flex; justify-content: space-between; gap: 12px; padding: 9px 11px; cursor: pointer; font-size: .8rem; }\n.belfius-real-balance summary strong { font-size: .95rem; }\n.belfius-real-balance.is-clean summary strong { color: #d9f7e4; }\n.belfius-real-balance.has-gap summary strong { color: #fff1c9; }\n.belfius-real-balance-details { display: grid; gap: 4px; padding: 0 11px 10px; font-size: .75rem; }\n.belfius-real-balance-details strong { margin-top: 3px; font-size: .78rem; }\n@media(max-width:600px){ .audit-review-choice{align-items:flex-start;flex-direction:column}.audit-none{justify-self:start} }\n`;
fs.writeFileSync(stylesPath, styles);

console.log('RC2.4.6 appliquée : Papa, apprentissage Belfius, Beobank→Vacances/Loisirs, épargne auto, solde réel et UI de validation.');
