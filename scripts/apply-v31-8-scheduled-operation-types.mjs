import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const cssPath = new URL('../src/styles.css', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);

let app = fs.readFileSync(appPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

app = app.replace(
  '  ReceiptText,\n  Send,',
  '  ReceiptText,\n  Repeat2,\n  Send,',
);

const before = `                {scheduledExpenses.map((operation) => {
                  const category = data.categories.find((item) => item.id === operation.category);
                  return (
                    <article className="scheduled-row" key={operation.id}>
                      <div>
                        <strong>{operation.label}</strong>
                        <span>
                          {operation.date} · {category?.label || 'Frais fixe'} · {operation.paymentMethod || 'Compte Belfius'}
                          {operation.projectedRecurring ? \` · \${recurrenceLabel(operation.frequency)}\` : ' · Prévue'}
                        </span>
                      </div>
                      <strong>{formatCurrency(operation.amount)}</strong>
                      {operation.projectedRecurring && operation.recurringExpenseId && (
                        <button
                          type="button"
                          onClick={() => deleteRecurringFixedExpense(operation.recurringExpenseId)}
                          aria-label={'Supprimer la récurrence ' + operation.label}
                          title="Supprimer cette récurrence"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </article>
                  );
                })}`;

const after = `                {scheduledExpenses.map((operation) => {
                  const category = data.categories.find((item) => item.id === operation.category);
                  const isSavings = operation.category?.startsWith('epargne')
                    || operation.label?.trim().toLowerCase().startsWith('épargne');
                  const operationKind = isSavings
                    ? { key: 'savings', label: 'Épargne', Icon: PiggyBank }
                    : operation.projectedRecurring
                      ? { key: 'recurring', label: 'Frais fixe récurrent', Icon: Repeat2 }
                      : { key: 'planned', label: 'Dépense ponctuelle', Icon: CalendarDays };
                  const KindIcon = operationKind.Icon;

                  return (
                    <article className={\`scheduled-row scheduled-row-\${operationKind.key}\`} key={operation.id}>
                      <div className={\`scheduled-kind-icon kind-\${operationKind.key}\`} aria-hidden="true">
                        <KindIcon size={19} />
                      </div>
                      <div className="scheduled-row-copy">
                        <div className="scheduled-row-heading">
                          <strong>{operation.label}</strong>
                          <span className={\`scheduled-kind-badge badge-\${operationKind.key}\`}>
                            {operationKind.label}
                          </span>
                        </div>
                        <span>
                          {operation.date} · {category?.label || 'Frais fixe'} · {operation.paymentMethod || 'Compte Belfius'} · Prévue
                        </span>
                      </div>
                      <strong className="scheduled-row-amount">{formatCurrency(operation.amount)}</strong>
                      {operation.projectedRecurring && operation.recurringExpenseId && (
                        <button
                          type="button"
                          onClick={() => deleteRecurringFixedExpense(operation.recurringExpenseId)}
                          aria-label={'Supprimer la récurrence ' + operation.label}
                          title="Supprimer cette récurrence"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </article>
                  );
                })}`;

if (!app.includes(before)) {
  throw new Error('V31.8 : liste des dépenses programmées introuvable.');
}
app = app.replace(before, after);
fs.writeFileSync(appPath, app);

const marker = '/* V31.8 — repères visuels des opérations programmées */';
if (!css.includes(marker)) {
  css += `\n\n${marker}\n.scheduled-row {\n  grid-template-columns: 42px minmax(0, 1fr) auto auto;\n  align-items: center;\n  column-gap: 0.75rem;\n}\n\n.scheduled-kind-icon {\n  width: 40px;\n  height: 40px;\n  display: grid;\n  place-items: center;\n  border-radius: 50%;\n}\n\n.kind-savings { background: #e6f5e9; color: #2f7d57; }\n.kind-recurring { background: #f0e8fa; color: #6b35a5; }\n.kind-planned { background: #e8f1fb; color: #24618a; }\n\n.scheduled-row-copy {\n  min-width: 0;\n}\n\n.scheduled-row-heading {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 0.4rem 0.65rem;\n}\n\n.scheduled-kind-badge {\n  display: inline-flex;\n  align-items: center;\n  min-height: 24px;\n  padding: 0.2rem 0.55rem;\n  border-radius: 999px;\n  font-size: 0.72rem;\n  font-weight: 800;\n  line-height: 1;\n  white-space: nowrap;\n}\n\n.badge-savings { background: #e6f5e9; color: #2f7d57; }\n.badge-recurring { background: #f0e8fa; color: #6b35a5; }\n.badge-planned { background: #e8f1fb; color: #24618a; }\n\n.scheduled-row-amount {\n  white-space: nowrap;\n}\n\n@media (max-width: 560px) {\n  .scheduled-row {\n    grid-template-columns: 38px minmax(0, 1fr) auto;\n    column-gap: 0.65rem;\n  }\n\n  .scheduled-kind-icon {\n    width: 36px;\n    height: 36px;\n  }\n\n  .scheduled-row > button {\n    grid-column: 3;\n  }\n\n  .scheduled-row-amount {\n    grid-column: 3;\n    grid-row: 1;\n    align-self: center;\n  }\n\n  .scheduled-kind-badge {\n    font-size: 0.67rem;\n  }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-8';");
fs.writeFileSync(swPath, sw);

console.log('V31.8 appliquée : types d’opérations programmées identifiables par icône et libellé.');

// Déclenchement du workflow V31.8
