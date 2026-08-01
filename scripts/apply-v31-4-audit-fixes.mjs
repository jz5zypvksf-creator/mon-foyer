import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

function replaceRequired(before, after, label) {
  if (!app.includes(before)) throw new Error(`V31.4: bloc introuvable — ${label}`);
  app = app.replace(before, after);
}

replaceRequired(
`  const scheduledExpenseTotal = useMemo(
    () => scheduledExpenses.reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
    [scheduledExpenses],
  );
`,
`  const scheduledExpenseTotal = useMemo(
    () => scheduledExpenses.reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
    [scheduledExpenses],
  );

  const scheduledFoodTotal = useMemo(
    () => scheduledExpenses
      .filter((operation) => operation.category === 'nourriture' && operation.person !== 'Nonna')
      .reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
    [scheduledExpenses],
  );

  const remainingFoodBudget = Math.max(FOOD_BUDGET - totals.food - scheduledFoodTotal, 0);
  const totalRemainingToCover = scheduledExpenseTotal + remainingFoodBudget;
  const availableAfterPlannedExpenses = availableForPayments - totalRemainingToCover;
`,
'calcul prévisionnel complet',
);

replaceRequired(
`              <div className="scheduled-summary">
                <span>Disponible après dépenses programmées</span>
                <strong className={availableForPayments - scheduledExpenseTotal >= 0 ? 'positive' : 'negative'}>
                  {formatCurrency(availableForPayments - scheduledExpenseTotal)}
                </strong>
              </div>`,
`              <div className="scheduled-summary">
                <span>Dépenses programmées restantes</span>
                <strong>{formatCurrency(scheduledExpenseTotal)}</strong>
              </div>
              <div className="scheduled-summary">
                <span>Budget nourriture restant à prévoir</span>
                <strong>{formatCurrency(remainingFoodBudget)}</strong>
              </div>
              <div className="scheduled-summary">
                <span>Total restant à couvrir</span>
                <strong>{formatCurrency(totalRemainingToCover)}</strong>
              </div>
              <div className="scheduled-summary">
                <span>Disponible prévisionnel après toutes les dépenses</span>
                <strong className={availableAfterPlannedExpenses >= 0 ? 'positive' : 'negative'}>
                  {formatCurrency(availableAfterPlannedExpenses)}
                </strong>
              </div>`,
'détail du disponible prévisionnel',
);

replaceRequired(
`    const recurringSignature = (expense) => [
      expense.label.trim().toLowerCase(),
      parseDecimal(expense.amount).toFixed(2),
      Number(expense.day),
      expense.person,
      expense.category,
    ].join('|');`,
`    const recurringSignature = (expense) => [
      expense.label.trim().toLowerCase(),
      parseDecimal(expense.amount).toFixed(2),
      Number(expense.day),
      expense.person,
      expense.category,
      expense.frequency || 'monthly',
      expense.start_date || expense.startDate || currentDate(),
    ].join('|');`,
'signature migration des récurrences',
);

replaceRequired(
`        person: expense.person,
        category: expense.category,
      }));`,
`        person: expense.person,
        category: expense.category,
        frequency: expense.frequency || 'monthly',
        start_date: expense.start_date || expense.startDate || currentDate(),
      }));`,
'payload migration des récurrences',
);

fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-4';");
fs.writeFileSync(swPath, sw);

console.log('V31.4 appliquée : calcul prévisionnel détaillé et migration des récurrences sécurisée.');
// trigger 2026-08-01
