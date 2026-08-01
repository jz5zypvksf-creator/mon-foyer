import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

function replaceAllRequired(search, replacement, label) {
  if (!app.includes(search)) throw new Error(`V31: bloc introuvable — ${label}`);
  app = app.split(search).join(replacement);
}

function replaceOnce(search, replacement, label) {
  if (app.includes(replacement)) return;
  if (!app.includes(search)) throw new Error(`V31: bloc introuvable — ${label}`);
  app = app.replace(search, replacement);
}

replaceOnce(
"const PEOPLE = ['Foyer', 'Alain', 'Esther', 'Nonna'];\n",
"const PEOPLE = ['Foyer', 'Alain', 'Esther', 'Nonna'];\nconst RECURRENCE_OPTIONS = [\n  { value: 'once', label: 'Une seule fois', months: 0 },\n  { value: 'monthly', label: 'Mensuelle', months: 1 },\n  { value: 'quarterly', label: 'Trimestrielle', months: 3 },\n  { value: 'semiannual', label: 'Semestrielle', months: 6 },\n  { value: 'annual', label: 'Annuelle', months: 12 },\n];\n",
'options de fréquence',
);

replaceOnce(
"    recurringEnabled: false,\n    recurringDay: new Date().getDate(),\n    recurringId: '',\n",
"    recurrence: 'once',\n    recurringDay: new Date().getDate(),\n    recurringId: '',\n",
'brouillon opération',
);

replaceOnce(
"    day: 1,\n    person: 'Foyer',\n    category: 'habitation',\n",
"    day: 1,\n    frequency: 'monthly',\n    startDate: currentDate(),\n    person: 'Foyer',\n    category: 'habitation',\n",
'brouillon récurrence',
);

replaceOnce(
"function fixedExpenseSignature(operation) {\n",
"function recurrenceLabel(value) {\n  return RECURRENCE_OPTIONS.find((option) => option.value === value)?.label || 'Mensuelle';\n}\n\nfunction isRecurringDueInMonth(expense, month) {\n  const frequency = expense.frequency || 'monthly';\n  const interval = RECURRENCE_OPTIONS.find((option) => option.value === frequency)?.months || 1;\n  const start = expense.startDate || expense.start_date || `${month}-01`;\n  const [startYear, startMonth] = start.slice(0, 7).split('-').map(Number);\n  const [year, monthNumber] = month.split('-').map(Number);\n  const distance = (year - startYear) * 12 + (monthNumber - startMonth);\n  return distance >= 0 && distance % interval === 0;\n}\n\nfunction fixedExpenseSignature(operation) {\n",
'helpers de fréquence',
);

replaceOnce(
"    expense.category,\n  ].join('|');\n}\n\nfunction isBelfiusAdjustment",
"    expense.category,\n    expense.frequency || 'monthly',\n  ].join('|');\n}\n\nfunction isBelfiusAdjustment",
'signature récurrence',
);

replaceOnce(
"      category: expense.category,\n    })),\n",
"      category: expense.category,\n      frequency: expense.frequency || 'monthly',\n      startDate: expense.start_date || currentDate(),\n    })),\n",
'normalisation distante',
);

replaceAllRequired(
".select('id, label, amount, day, person, category')",
".select('id, label, amount, day, person, category, frequency, start_date')",
'sélections Supabase',
);

replaceOnce(
"    const recurringScheduledExpenses = (data.recurringFixedExpenses || [])\n      .map((expense) => ({",
"    const recurringScheduledExpenses = (data.recurringFixedExpenses || [])\n      .filter((expense) => isRecurringDueInMonth(expense, selectedMonth))\n      .map((expense) => ({",
'filtrage des échéances',
);

replaceOnce(
"        projectedRecurring: true,\n        recurringExpenseId: expense.id,\n",
"        projectedRecurring: true,\n        recurringExpenseId: expense.id,\n        frequency: expense.frequency || 'monthly',\n",
'fréquence projetée',
);

replaceOnce(
"  const saveRecurringExpenseFromOperation = async (operation) => {\n    if (!operation.recurringEnabled || operation.type === 'income') return null;\n",
"  const saveRecurringExpenseFromOperation = async (operation) => {\n    if (operation.recurrence === 'once' || operation.type === 'income') return null;\n",
'sauvegarde récurrence',
);

replaceOnce(
"      category: operation.category,\n    };\n",
"      category: operation.category,\n      frequency: operation.recurrence || 'monthly',\n      startDate: operation.date,\n    };\n",
'objet récurrence',
);

replaceOnce(
"        category: recurringExpense.category,\n      };\n",
"        category: recurringExpense.category,\n        frequency: recurringExpense.frequency,\n        start_date: recurringExpense.startDate,\n      };\n",
'payload récurrence',
);

replaceOnce(
"    if (draft.recurringEnabled && draft.type !== 'income' && !draft.recurringId) {",
"    if (draft.recurrence !== 'once' && draft.type !== 'income' && !draft.recurringId) {",
'contrôle doublon',
);

replaceOnce(
"        category: draft.category,\n      };\n",
"        category: draft.category,\n        frequency: draft.recurrence,\n      };\n",
'candidat doublon',
);

replaceOnce(
"    delete operation.recurringEnabled;\n",
"    delete operation.recurrence;\n",
'nettoyage opération',
);

replaceOnce(
"    if (draft.recurringEnabled && operation.type !== 'income') {",
"    if (draft.recurrence !== 'once' && operation.type !== 'income') {",
'enregistrement récurrence',
);

replaceOnce(
"          recurringEnabled: true,\n          recurringDay: draft.recurringDay,\n",
"          recurrence: draft.recurrence,\n          recurringDay: draft.recurringDay,\n",
'appel sauvegarde',
);

replaceOnce(
"      recurringEnabled: Boolean(recurringExpense),\n      recurringDay: recurringExpense?.day || Number(operation.date.slice(8, 10)),\n",
"      recurrence: recurringExpense?.frequency || 'once',\n      recurringDay: recurringExpense?.day || Number(operation.date.slice(8, 10)),\n",
'édition opération',
);

replaceOnce(
`              {draft.type !== 'income' && (
                <section className="recurring-inline-panel">
                  <label className="recurring-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.recurringEnabled)}
                      onChange={(event) => setDraft({
                        ...draft,
                        recurringEnabled: event.target.checked,
                        recurringDay: draft.recurringDay || Number(draft.date.slice(8, 10)),
                      })}
                    />
                    <span>Dépense récurrente</span>
                  </label>
                  {draft.recurringEnabled && (
                    <label>
                      Jour habituel du prélèvement
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={draft.recurringDay}
                        onChange={(event) => setDraft({ ...draft, recurringDay: event.target.value })}
                      />
                    </label>
                  )}
                </section>
              )}`,
`              {draft.type !== 'income' && (
                <section className="recurring-inline-panel">
                  <label>
                    Fréquence
                    <select
                      value={draft.recurrence}
                      onChange={(event) => setDraft({
                        ...draft,
                        recurrence: event.target.value,
                        recurringDay: draft.recurringDay || Number(draft.date.slice(8, 10)),
                      })}
                    >
                      {RECURRENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {draft.recurrence !== 'once' && (
                    <label>
                      Jour habituel du prélèvement
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={draft.recurringDay}
                        onChange={(event) => setDraft({ ...draft, recurringDay: event.target.value })}
                      />
                    </label>
                  )}
                </section>
              )}`,
'interface fréquence',
);

replaceOnce(
"      category: recurringDraft.category,\n    };\n",
"      category: recurringDraft.category,\n      frequency: recurringDraft.frequency || 'monthly',\n      startDate: recurringDraft.startDate || currentDate(),\n    };\n",
'création manuelle',
);

replaceOnce(
"          category: fixedExpense.category,\n        })",
"          category: fixedExpense.category,\n          frequency: fixedExpense.frequency,\n          start_date: fixedExpense.startDate,\n        })",
'insertion manuelle',
);

replaceOnce(
`                  <label>
                    Type de frais
                    <select
                      value={recurringDraft.category}`,
`                  <label>
                    Fréquence
                    <select
                      value={recurringDraft.frequency}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, frequency: event.target.value })}
                    >
                      {RECURRENCE_OPTIONS.filter((option) => option.value !== 'once').map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="recurring-grid">
                  <label>
                    Type de frais
                    <select
                      value={recurringDraft.category}`,
'fréquence réglages',
);

replaceOnce(
"<span>{formatCurrency(expense.amount)} - jour {expense.day} - {expense.person} - {category?.label || 'Frais fixe'}</span>",
"<span>{formatCurrency(expense.amount)} · jour {expense.day} · {recurrenceLabel(expense.frequency)} · {expense.person} · {category?.label || 'Frais fixe'}</span>",
'affichage fréquence',
);

replaceOnce(
"{operation.projectedRecurring ? ' · Récurrente' : ' · Prévue'}",
"{operation.projectedRecurring ? ` · ${recurrenceLabel(operation.frequency)}` : ' · Prévue'}",
'affichage dépenses programmées',
);

fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v\d+';/, "const CACHE_NAME = 'mon-foyer-v31';");
fs.writeFileSync(swPath, sw);

console.log('V31 appliquée.');
