import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);

let app = fs.readFileSync(appPath, 'utf8');

const oldAudit = `            <BelfiusAudit\n              operations={data.operations}\n              appBelfiusBalance={paymentBalances['Compte Belfius'] || 0}\n            />`;
const newAudit = `            <BelfiusAudit\n              operations={data.operations}\n              appBelfiusBalance={paymentBalances['Compte Belfius'] || 0}\n              selectedMonth={selectedMonth}\n              recurringExpenses={data.recurringFixedExpenses || []}\n              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}\n            />`;
if (app.includes(oldAudit)) app = app.replace(oldAudit, newAudit);

const syncMarker = 'const synchronizeBelfiusBalance = async ({ balance, balanceDate, month }) => {';
if (!app.includes(syncMarker)) {
  const insertionPoint = '  const refreshFromSupabase = async () => {';
  if (!app.includes(insertionPoint)) throw new Error('Point d’insertion de la synchronisation Belfius introuvable.');
  const syncFunction = `  const synchronizeBelfiusBalance = async ({ balance, balanceDate, month }) => {\n    const currentBalance = calculatePaymentBalances(data.operations)['Compte Belfius'] || 0;\n    const delta = Number(balance) - Number(currentBalance);\n    if (Math.abs(delta) < 0.01) return;\n\n    const dateMatch = String(balanceDate || '').match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);\n    const adjustmentDate = dateMatch\n      ? \\`${'${'}dateMatch[3]}-${'${'}dateMatch[2]}-${'${'}dateMatch[1]}\\`\n      : currentDate();\n    const adjustment = {\n      id: crypto.randomUUID(),\n      date: adjustmentDate,\n      person: 'Foyer',\n      type: delta >= 0 ? 'income' : 'fixed',\n      category: delta >= 0 ? 'revenus' : 'divers',\n      store: '',\n      paymentMethod: 'Compte Belfius',\n      label: \\`Ajustement Belfius ${'${'}month} — solde certifié\\`,\n      amount: Math.abs(delta),\n    };\n\n    if (USE_REMOTE_BUDGET) {\n      const payload = {\n        household_id: householdId,\n        date: adjustment.date,\n        person: adjustment.person,\n        type: adjustment.type,\n        category: adjustment.category,\n        store: null,\n        label: adjustment.label,\n        amount: adjustment.amount,\n        payment_method: adjustment.paymentMethod,\n      };\n      const { data: savedRow, error } = await supabase\n        .from('operations')\n        .insert(payload)\n        .select(OPERATION_COLUMNS)\n        .single();\n      if (error) {\n        setSyncStatus(\\`Synchronisation Belfius impossible : ${'${'}error.message}\\`);\n        return;\n      }\n      adjustment.id = savedRow.id;\n    }\n\n    saveData({ ...data, operations: [adjustment, ...data.operations] });\n    setSyncStatus(\\`Solde Belfius synchronisé : ${'${'}formatCurrency(balance)}\\`);\n  };\n\n`;
  app = app.replace(insertionPoint, syncFunction + insertionPoint);
}

const oldRecurringCount = `                <span>{(data.recurringFixedExpenses || []).length}</span>`;
const newRecurringCount = `                {(() => {\n                  const recurringExpenses = data.recurringFixedExpenses || [];\n                  const uniqueCount = new Set(recurringExpenses.map(recurringExpenseSignature)).size;\n                  const duplicateCount = recurringExpenses.length - uniqueCount;\n                  return (\n                    <span>\n                      {recurringExpenses.length} enregistrés · {uniqueCount} uniques\n                      {duplicateCount > 0 ? \\` · ${'${'}duplicateCount} doublon(s) potentiel(s)\\` : ' · base propre'}\n                    </span>\n                  );\n                })()}`;
if (app.includes(oldRecurringCount)) app = app.replace(oldRecurringCount, newRecurringCount);

fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v32-rc1';");
fs.writeFileSync(swPath, sw);

console.log('V32.0 RC1 : synchronisation Belfius, mois sélectionné et contrôle des récurrences appliqués.');
