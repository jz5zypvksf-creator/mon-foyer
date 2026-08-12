import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Patch introuvable: ${label}`);
  return source.replace(from, to);
}

// --- App.jsx ---------------------------------------------------------------
const appPath = 'src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  `  const filteredMonthOperations = useMemo(() => {\n    const search = historySearch.trim().toLowerCase();\n    return monthOperations.filter((operation) => {`,
  `  const filteredMonthOperations = useMemo(() => {\n    const search = historySearch.trim().toLowerCase();\n    // RC2.4.4 : l'Historique porte uniquement sur les opérations réellement passées.\n    // Les opérations futures restent dans la rubrique À venir / Programmées.\n    return effectiveMonthOperations.filter((operation) => {`,
  'historique sans opérations futures',
);

app = replaceOnce(
  app,
  `  }, [data.categories, historyCategory, historyPaymentMethod, historyPerson, historySearch, historyType, monthOperations, reviewMap, showReviewOnly]);`,
  `  }, [data.categories, effectiveMonthOperations, historyCategory, historyPaymentMethod, historyPerson, historySearch, historyType, reviewMap, showReviewOnly]);`,
  'dépendances historique',
);

app = replaceOnce(
  app,
  `<span>{filteredMonthOperations.length} / {monthOperations.length} lignes</span>`,
  `<span>{filteredMonthOperations.length} / {effectiveMonthOperations.length} lignes</span>`,
  'compteur historique',
);

app = replaceOnce(
  app,
  `      store: draft.type === 'income' || draft.type === 'fixed' ? '' : draft.store,`,
  `      // Le bénéficiaire / point de vente est utile pour tous les débits, y compris les frais fixes.\n      store: draft.type === 'income' ? '' : draft.store,`,
  'conservation bénéficiaire frais fixe',
);

app = replaceOnce(
  app,
  `{draft.type === 'variable' && (\n                <label>\n                  Point de vente`,
  `{draft.type !== 'income' && (\n                <label>\n                  Bénéficiaire / Point de vente`,
  'champ bénéficiaire frais fixes',
);

const oldBankAdd = `  const addBankOperationFromAudit = (bankRow) => {\n    const label = String(bankRow?.label || 'Opération Belfius');\n    const normalized = label.toLowerCase();\n    let category = 'divers';\n    if (normalized.includes('lanza michel')) category = 'coiffeur';\n    else if (normalized.includes('dats24') || normalized.includes('q8') || normalized.includes('total')) category = 'carburant';\n    else if (normalized.includes('delhaize') || normalized.includes('lidl') || normalized.includes('carrefour') || normalized.includes('colruyt')) category = 'nourriture';\n    else if (normalized.includes('ethias') && Math.abs(Number(bankRow?.amount || 0)) > 500) category = 'emprunt_maison';\n\n    setDraft({\n      ...makeEmptyOperation(),\n      date: bankRow?.date || currentDate(),\n      type: Number(bankRow?.amount || 0) > 0 ? 'income' : 'variable',\n      category: Number(bankRow?.amount || 0) > 0 ? 'revenus' : category,\n      store: label,\n      paymentMethod: 'Compte Belfius',\n      label: normalized.includes('lanza michel') ? 'Coiffeur' : label,\n      amount: Math.abs(Number(bankRow?.amount || 0)),\n    });\n    setEditingId(null);\n    setActiveView('add');\n  };`;

const newBankAdd = `  const addBankOperationFromAudit = (bankRow) => {\n    const label = String(bankRow?.label || 'Opération Belfius');\n    const normalized = label.toLowerCase();\n    const amount = Math.abs(Number(bankRow?.amount || 0));\n    const bankCommunication = String(bankRow?.communication || bankRow?.details || '');\n    const normalizedBankCommunication = bankCommunication.toLowerCase();\n    const bankDigits = bankCommunication.replace(/\\D/g, '');\n\n    // RC2.4.4 : si Belfius correspond déjà à un frais récurrent connu, le crayon\n    // ouvre directement ce frais au lieu de proposer artificiellement une dépense variable.\n    const recurringCandidate = Number(bankRow?.amount || 0) < 0\n      ? (data.recurringFixedExpenses || []).find((expense) => {\n        if (Math.abs(Math.abs(Number(expense.amount) || 0) - amount) > 0.05) return false;\n        const structured = String(expense.structuredCommunication || expense.structured_communication || '').replace(/\\D/g, '');\n        const free = String(expense.freeCommunication || expense.free_communication || '').trim().toLowerCase();\n        const mode = expense.freeCommunicationMode || expense.free_communication_mode || 'contains';\n        const structuredMatches = structured && bankDigits.includes(structured);\n        const freeMatches = free && (mode === 'exact'\n          ? normalizedBankCommunication.trim() === free\n          : normalizedBankCommunication.includes(free));\n        return structuredMatches || freeMatches;\n      })\n      : null;\n\n    let category = recurringCandidate?.category || 'divers';\n    if (!recurringCandidate) {\n      if (normalized.includes('lanza michel')) category = 'coiffeur';\n      else if (normalized.includes('dats24') || normalized.includes('q8') || normalized.includes('total')) category = 'carburant';\n      else if (normalized.includes('delhaize') || normalized.includes('lidl') || normalized.includes('carrefour') || normalized.includes('colruyt')) category = 'nourriture';\n      else if (normalized.includes('ethias') && amount > 500) category = 'emprunt_maison';\n    }\n\n    setDraft({\n      ...makeEmptyOperation(),\n      date: bankRow?.date || currentDate(),\n      type: Number(bankRow?.amount || 0) > 0 ? 'income' : recurringCandidate ? 'fixed' : 'variable',\n      category: Number(bankRow?.amount || 0) > 0 ? 'revenus' : category,\n      store: label,\n      paymentMethod: 'Compte Belfius',\n      label: recurringCandidate?.label || (normalized.includes('lanza michel') ? 'Coiffeur' : label),\n      amount,\n      recurrence: recurringCandidate?.frequency || 'once',\n      recurringDay: recurringCandidate?.day || Number(String(bankRow?.date || currentDate()).slice(8, 10)),\n      recurringId: recurringCandidate?.id || '',\n      structuredCommunication: recurringCandidate?.structuredCommunication || recurringCandidate?.structured_communication || '',\n      freeCommunication: recurringCandidate?.freeCommunication || recurringCandidate?.free_communication || '',\n      freeCommunicationMode: recurringCandidate?.freeCommunicationMode || recurringCandidate?.free_communication_mode || 'contains',\n    });\n    setOperationStatus(recurringCandidate\n      ? 'Frais récurrent Belfius reconnu : vérifie les données puis enregistre cette opération.'\n      : 'Opération Belfius préremplie : complète ou corrige les informations avant enregistrement.');\n    setEditingId(null);\n    setActiveView('add');\n  };`;

app = replaceOnce(app, oldBankAdd, newBankAdd, 'assistant ajout depuis Belfius');

fs.writeFileSync(appPath, app);

// --- BelfiusAudit.jsx ------------------------------------------------------
const auditPath = 'src/BelfiusAudit.jsx';
let audit = fs.readFileSync(auditPath, 'utf8');

audit = replaceOnce(
  audit,
  `const DAY_MS = 86400000;`,
  `const DAY_MS = 86400000;\nconst AUDIT_STORAGE_KEY = 'mon-foyer-belfius-audit-v1';\n\nfunction loadPersistedAudit() {\n  try {\n    const stored = localStorage.getItem(AUDIT_STORAGE_KEY);\n    if (!stored) return null;\n    const parsed = JSON.parse(stored);\n    return parsed?.rows && Array.isArray(parsed.rows) ? parsed : null;\n  } catch {\n    return null;\n  }\n}\n\nfunction persistAudit(audit) {\n  try {\n    if (!audit) localStorage.removeItem(AUDIT_STORAGE_KEY);\n    else localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(audit));\n  } catch {\n    // Un échec de stockage local ne doit jamais bloquer l'audit courant.\n  }\n}`,
  'stockage audit Belfius',
);

audit = replaceOnce(
  audit,
  `  const [audit, setAudit] = useState(null);`,
  `  // RC2.4.4 : le dernier relevé reste disponible entre les ouvertures de l'application.\n  const [audit, setAudit] = useState(loadPersistedAudit);`,
  'initialisation audit persistante',
);

audit = replaceOnce(
  audit,
  `      const parsedAudit = parseBelfius(text);\n      setAudit(parsedAudit);`,
  `      const parsedAudit = {\n        ...parseBelfius(text),\n        importedAt: new Date().toISOString(),\n        fileName: file.name || 'Export Belfius.csv',\n      };\n      setAudit(parsedAudit);\n      persistAudit(parsedAudit);`,
  'persistance après import',
);

audit = replaceOnce(
  audit,
  `  const isBalanced = auditIsClean && Math.abs(difference) < 0.01;`,
  `  const isBalanced = auditIsClean && Math.abs(difference) < 0.01;\n  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;`,
  'compteur restant à traiter',
);

audit = replaceOnce(
  audit,
  `      <p className="hint">Le fichier complet est lu, mais l'audit porte uniquement sur le mois sélectionné.</p>`,
  `      <p className="hint">Le fichier complet est lu, mais l'audit porte uniquement sur le mois sélectionné.</p>\n      {audit && (\n        <p className="hint">\n          Relevé Belfius mémorisé · {audit.fileName || 'CSV Belfius'} · {remainingToTreat} opération(s) restant à traiter.\n          Tu peux quitter l'application et reprendre l'audit sans recharger le fichier.\n        </p>\n      )}`,
  'message audit mémorisé',
);

fs.writeFileSync(auditPath, audit);

console.log('RC2.4.4 appliquée : historique réel, bénéficiaire homogène, assistant Belfius et audit persistant.');
