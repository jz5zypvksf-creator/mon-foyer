import fs from 'node:fs';

const auditPath = new URL('../src/BelfiusAudit.jsx', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);
let audit = fs.readFileSync(auditPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`RC2.3 motif introuvable: ${label}`);
  return source.replace(from, to);
}

// --- BelfiusAudit: communication structurée + alias + ajout direct ---
audit = audit.replace(
  "import { AlertTriangle, CheckCircle2, FileSearch, RefreshCw, Upload } from 'lucide-react';",
  "import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';",
);

audit = audit.replace(
  "  { bank: ['pluxee'], app: ['cheques repassage', 'cheques repas', 'pluxee'] },",
  "  { bank: ['pluxee'], app: ['cheques repassage', 'cheques repas', 'pluxee'] },\n  { bank: ['ethias'], app: ['ethias maison', 'emprunt maison'] },\n  { bank: ['lanza michel'], app: ['coiffeur', 'soins personnels'] },",
);

const structuredHelper = `\nfunction extractStructuredCommunication(value) {\n  const raw = String(value || '');\n  const formatted = raw.match(/\\+{3}\\s*\\d{3}\\/\\d{4}\\/\\d{5}\\s*\\+{3}/);\n  if (formatted) return formatted[0].replace(/\\s/g, '');\n  const digits = raw.replace(/\\D/g, '');\n  return digits.length === 12 ? digits : '';\n}\n\nfunction normalizedCommunication(value) {\n  return String(value || '').replace(/\\D/g, '');\n}\n`;
if (!audit.includes('function extractStructuredCommunication')) {
  audit = audit.replace('function parseCsvLine(line) {', structuredHelper + '\nfunction parseCsvLine(line) {');
}

audit = audit.replace(
  "      details: cells[communicationIndex] || cells[transactionIndex] || '',",
  "      details: cells[communicationIndex] || cells[transactionIndex] || '',\n      communication: cells[communicationIndex] || '',\n      structuredCommunication: extractStructuredCommunication(cells[communicationIndex] || ''),",
);

const recurringComm = `\nfunction recurringCommunication(expense) {\n  return normalizedCommunication(\n    expense?.structuredCommunication\n    || expense?.structured_communication\n    || expense?.communication\n    || expense?.ocr\n    || '',\n  );\n}\n`;
if (!audit.includes('function recurringCommunication')) {
  audit = audit.replace('function recurringBelongsToAppRow(expense, appRow) {', recurringComm + '\nfunction recurringBelongsToAppRow(expense, appRow) {');
}

audit = replaceOnce(
  audit,
  "  return (recurringExpenses || []).find((expense) => {\n    const recurringAmount = Math.abs(Number(expense.amount) || 0);\n    const recurringDay = Number(expense.day) || 1;\n    return recurringBelongsToAppRow(expense, appRow)\n      && Math.abs(recurringAmount - operationAmount) <= AMOUNT_TOLERANCE\n      && Math.abs(recurringDay - day) <= DATE_TOLERANCE_DAYS;\n  }) || null;",
  "  const bankCommunication = normalizedCommunication(bankRow.structuredCommunication || bankRow.communication);\n  const candidates = (recurringExpenses || []).filter((expense) => {\n    const recurringAmount = Math.abs(Number(expense.amount) || 0);\n    const recurringDay = Number(expense.day) || 1;\n    return recurringBelongsToAppRow(expense, appRow)\n      && Math.abs(recurringAmount - operationAmount) <= AMOUNT_TOLERANCE\n      && Math.abs(recurringDay - day) <= DATE_TOLERANCE_DAYS;\n  });\n  if (bankCommunication) {\n    const exactCommunication = candidates.find((expense) => recurringCommunication(expense) === bankCommunication);\n    if (exactCommunication) return { ...exactCommunication, __communicationMatch: true };\n  }\n  return candidates[0] || null;",
  'recurring communication priority',
);

audit = audit.replace(
  "  if (recurring && (directLabel || alias || !bankHasKnownAlias(bankRow))) {\n    return {\n      auto: true,\n      confidence: directLabel || alias ? 100 : 96,\n      reason: `Frais récurrent réellement lié : ${recurring.label}`,",
  "  if (recurring && recurring.__communicationMatch) {\n    return {\n      auto: true,\n      confidence: 100,\n      reason: `Communication structurée + frais récurrent : ${recurring.label}`,\n      recurring,\n    };\n  }\n  if (recurring && (directLabel || alias || !bankHasKnownAlias(bankRow))) {\n    return {\n      auto: true,\n      confidence: directLabel || alias ? 100 : 96,\n      reason: `Frais récurrent réellement lié : ${recurring.label}`,",
);

audit = audit.replace(
  "  onSynchronizeBelfiusBalance,\n}) {",
  "  onSynchronizeBelfiusBalance,\n  onAddBankOperation,\n}) {",
);

audit = replaceOnce(
  audit,
  "              {monthMissing.map((row) => (\n                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.amount)}</span></article>\n              ))}",
  "              {monthMissing.map((row) => (\n                <article key={row.id} className=\"audit-missing-row\">\n                  <strong>{row.date} · {row.label}</strong>\n                  <span className=\"audit-missing-actions\">\n                    <b>{money(row.amount)}</b>\n                    {typeof onAddBankOperation === 'function' && (\n                      <button type=\"button\" className=\"audit-pencil\" title=\"Enregistrer dans Mon Foyer\" aria-label={`Enregistrer ${row.label} dans Mon Foyer`} onClick={() => onAddBankOperation(row)}>\n                        <Pencil size={17} />\n                      </button>\n                    )}\n                  </span>\n                </article>\n              ))}",
  'missing pencil action',
);

// --- App: catégorie Coiffeur + préremplissage Ajouter + champ communication récurrent ---
app = app.replace(
  "    { id: 'sante', label: 'Santé', icon: 'sante', type: 'variable' },",
  "    { id: 'sante', label: 'Santé', icon: 'sante', type: 'variable' },\n    { id: 'coiffeur', label: 'Coiffeur', icon: 'divers', type: 'variable' },",
);

app = app.replace(
  "    category: 'habitation',\n  };\n}",
  "    category: 'habitation',\n    structuredCommunication: '',\n  };\n}",
);

const addBankHandler = `\n  const addBankOperationFromAudit = (bankRow) => {\n    const label = String(bankRow?.label || 'Opération Belfius');\n    const normalized = label.toLowerCase();\n    let category = 'divers';\n    if (normalized.includes('lanza michel')) category = 'coiffeur';\n    else if (normalized.includes('dats24') || normalized.includes('q8') || normalized.includes('total')) category = 'carburant';\n    else if (normalized.includes('delhaize') || normalized.includes('lidl') || normalized.includes('carrefour') || normalized.includes('colruyt')) category = 'nourriture';\n    else if (normalized.includes('ethias') && Math.abs(Number(bankRow?.amount || 0)) > 500) category = 'emprunt_maison';\n\n    setDraft({\n      ...makeEmptyOperation(),\n      date: bankRow?.date || currentDate(),\n      type: Number(bankRow?.amount || 0) > 0 ? 'income' : 'variable',\n      category: Number(bankRow?.amount || 0) > 0 ? 'revenus' : category,\n      store: label,\n      paymentMethod: 'Compte Belfius',\n      label: normalized.includes('lanza michel') ? 'Coiffeur' : label,\n      amount: Math.abs(Number(bankRow?.amount || 0)),\n    });\n    setEditingId(null);\n    setActiveView('add');\n  };\n`;
if (!app.includes('const addBankOperationFromAudit')) {
  app = app.replace('  const deleteOperation = async (id) => {', addBankHandler + '\n  const deleteOperation = async (id) => {');
}

app = app.replace(
  "              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}",
  "              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}\n              onAddBankOperation={addBankOperationFromAudit}",
);

// Ajout du champ facultatif dans le formulaire de frais récurrents.
if (!app.includes('Communication structurée (facultative)')) {
  app = app.replace(
    "                <div className=\"recurring-grid\">",
    "                <label>\n                  Communication structurée (facultative)\n                  <input\n                    value={recurringDraft.structuredCommunication || ''}\n                    onChange={(event) => setRecurringDraft({ ...recurringDraft, structuredCommunication: event.target.value })}\n                    placeholder=\"+++123/4567/89012+++\"\n                  />\n                </label>\n                <div className=\"recurring-grid\">",
  );
}

fs.writeFileSync(auditPath, audit);
fs.writeFileSync(appPath, app);
console.log('RC2.3 appliquée.');
