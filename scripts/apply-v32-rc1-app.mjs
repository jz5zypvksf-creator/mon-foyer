import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);

let app = fs.readFileSync(appPath, 'utf8');

const oldAudit = [
  '            <BelfiusAudit',
  '              operations={data.operations}',
  "              appBelfiusBalance={paymentBalances['Compte Belfius'] || 0}",
  '            />',
].join('\n');
const newAudit = [
  '            <BelfiusAudit',
  '              operations={data.operations}',
  "              appBelfiusBalance={paymentBalances['Compte Belfius'] || 0}",
  '              selectedMonth={selectedMonth}',
  '              recurringExpenses={data.recurringFixedExpenses || []}',
  '              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}',
  '            />',
].join('\n');
if (app.includes(oldAudit)) app = app.replace(oldAudit, newAudit);

const syncMarker = 'const synchronizeBelfiusBalance = async ({ balance, balanceDate, month }) => {';
if (!app.includes(syncMarker)) {
  const insertionPoint = '  const refreshFromSupabase = async () => {';
  if (!app.includes(insertionPoint)) throw new Error('Point d’insertion de la synchronisation Belfius introuvable.');
  const syncFunction = [
    '  const synchronizeBelfiusBalance = async ({ balance, balanceDate, month }) => {',
    "    const currentBalance = calculatePaymentBalances(data.operations)['Compte Belfius'] || 0;",
    '    const delta = Number(balance) - Number(currentBalance);',
    '    if (Math.abs(delta) < 0.01) return;',
    '',
    "    const dateMatch = String(balanceDate || '').match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);",
    "    const adjustmentDate = dateMatch ? dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1] : currentDate();",
    '    const adjustment = {',
    '      id: crypto.randomUUID(),',
    '      date: adjustmentDate,',
    "      person: 'Foyer',",
    "      type: delta >= 0 ? 'income' : 'fixed',",
    "      category: delta >= 0 ? 'revenus' : 'divers',",
    "      store: '',",
    "      paymentMethod: 'Compte Belfius',",
    "      label: 'Ajustement Belfius ' + month + ' — solde certifié',",
    '      amount: Math.abs(delta),',
    '    };',
    '',
    '    if (USE_REMOTE_BUDGET) {',
    '      const payload = {',
    '        household_id: householdId,',
    '        date: adjustment.date,',
    '        person: adjustment.person,',
    '        type: adjustment.type,',
    '        category: adjustment.category,',
    '        store: null,',
    '        label: adjustment.label,',
    '        amount: adjustment.amount,',
    '        payment_method: adjustment.paymentMethod,',
    '      };',
    '      const { data: savedRow, error } = await supabase',
    "        .from('operations')",
    '        .insert(payload)',
    '        .select(OPERATION_COLUMNS)',
    '        .single();',
    '      if (error) {',
    "        setSyncStatus('Synchronisation Belfius impossible : ' + error.message);",
    '        return;',
    '      }',
    '      adjustment.id = savedRow.id;',
    '    }',
    '',
    '    saveData({ ...data, operations: [adjustment, ...data.operations] });',
    "    setSyncStatus('Solde Belfius synchronisé : ' + formatCurrency(balance));",
    '  };',
    '',
  ].join('\n');
  app = app.replace(insertionPoint, syncFunction + insertionPoint);
}

const oldRecurringCount = '                <span>{(data.recurringFixedExpenses || []).length}</span>';
const newRecurringCount = [
  '                {(() => {',
  '                  const recurringExpenses = data.recurringFixedExpenses || [];',
  '                  const uniqueCount = new Set(recurringExpenses.map(recurringExpenseSignature)).size;',
  '                  const duplicateCount = recurringExpenses.length - uniqueCount;',
  '                  return (',
  '                    <span>',
  '                      {recurringExpenses.length} enregistrés · {uniqueCount} uniques',
  "                      {duplicateCount > 0 ? ' · ' + duplicateCount + ' doublon(s) potentiel(s)' : ' · base propre'}",
  '                    </span>',
  '                  );',
  '                })()}',
].join('\n');
if (app.includes(oldRecurringCount)) app = app.replace(oldRecurringCount, newRecurringCount);

fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v32-rc1';");
fs.writeFileSync(swPath, sw);

console.log('V32.0 RC1 : synchronisation Belfius, mois sélectionné et contrôle des récurrences appliqués.');
