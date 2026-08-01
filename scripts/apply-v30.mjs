import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const stylesPath = new URL('../src/styles.css', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

function replaceOnce(search, replacement, label) {
  if (app.includes(replacement)) return;
  if (!app.includes(search)) throw new Error(`V30: bloc introuvable — ${label}`);
  app = app.replace(search, replacement);
}

replaceOnce(
`  const scheduledExpenseTotal = useMemo(
    () => scheduledExpenses.reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
    [scheduledExpenses],
  );
`,
`  const scheduledExpenseTotal = useMemo(
    () => scheduledExpenses.reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
    [scheduledExpenses],
  );

  const variableExpenseForecast = useMemo(() => {
    const completedMonths = [...new Set(
      data.operations
        .filter((operation) => operation.type === 'variable' && operation.date.slice(0, 7) < selectedMonth)
        .map((operation) => operation.date.slice(0, 7)),
    )]
      .sort()
      .slice(-3);

    if (completedMonths.length === 0) return 0;

    const monthlyTotals = completedMonths.map((month) => data.operations
      .filter((operation) => operation.type === 'variable' && operation.date.startsWith(month) && !isBelfiusAdjustment(operation))
      .reduce((sum, operation) => sum + Number(operation.amount || 0), 0));

    const monthlyAverage = monthlyTotals.reduce((sum, amount) => sum + amount, 0) / monthlyTotals.length;
    return Math.max(monthlyAverage - totals.variable, 0);
  }, [data.operations, selectedMonth, totals.variable]);

  const expectedMonthlyExpenses = totals.fixed + totals.variable + scheduledExpenseTotal + variableExpenseForecast;

  const nextSevenDaysExpenses = useMemo(() => {
    const start = new Date(`${balanceCutoff}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return scheduledExpenses.filter((operation) => {
      const date = new Date(`${operation.date}T00:00:00`);
      return date > start && date <= end;
    });
  }, [balanceCutoff, scheduledExpenses]);
`,
'prévisions mensuelles',
);

replaceOnce(
`              <StatCard icon={TrendingUp} label="Revenus prévus du mois" value={formatCurrency(fullMonthTotals.income)} />
`,
`              <StatCard icon={TrendingUp} label="Revenus prévus du mois" value={formatCurrency(fullMonthTotals.income)} />
              <StatCard
                icon={WalletCards}
                label="Dépenses prévues du mois"
                value={formatCurrency(expectedMonthlyExpenses)}
                tone="estimated"
                note="Estimation basée sur les 3 derniers mois"
              />
`,
'carte dépenses prévues',
);

replaceOnce(
`            <section className="panel scheduled-panel">
`,
`            <section className="panel upcoming-panel">
              <div className="section-title">
                <h2>Les 7 prochains jours</h2>
                <span>{nextSevenDaysExpenses.length} prévue(s)</span>
              </div>
              {nextSevenDaysExpenses.length === 0 ? (
                <p className="empty-state">Aucun prélèvement prévu dans les 7 prochains jours.</p>
              ) : (
                <div className="upcoming-list">
                  {nextSevenDaysExpenses.map((operation) => (
                    <div className="upcoming-row" key={`upcoming-${operation.id}`}>
                      <div>
                        <strong>{operation.label}</strong>
                        <span>{operation.date} · {data.categories.find((item) => item.id === operation.category)?.label || 'Frais fixe'}</span>
                      </div>
                      <strong>{formatCurrency(operation.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel scheduled-panel">
`,
'bloc des 7 prochains jours',
);

replaceOnce(
`                      {operation.projectedRecurring && operation.recurringExpenseId && (
                        <button
                          type="button"
                          onClick={() => deleteRecurringFixedExpense(operation.recurringExpenseId)}
                          aria-label={`Supprimer la récurrence ${operation.label}`}
                          title="Supprimer cette récurrence"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
`,
`                      {operation.projectedRecurring && operation.recurringExpenseId && (
                        <div className="scheduled-actions">
                          <button
                            type="button"
                            className="scheduled-action edit"
                            onClick={() => {
                              const expense = (data.recurringFixedExpenses || []).find((item) => item.id === operation.recurringExpenseId);
                              if (expense) setRecurringDraft({ ...expense, amount: String(expense.amount) });
                              setActiveView('settings');
                            }}
                            aria-label={`Modifier la récurrence ${operation.label}`}
                            title="Modifier cette récurrence dans les réglages"
                          >
                            <Edit3 size={17} />
                          </button>
                          <button
                            type="button"
                            className="scheduled-action delete"
                            onClick={() => deleteRecurringFixedExpense(operation.recurringExpenseId)}
                            aria-label={`Supprimer la récurrence ${operation.label}`}
                            title="Supprimer cette récurrence"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      )}
`,
'actions rondes programmées',
);

replaceOnce(
`function StatCard({ icon: Icon, label, value }) {
  return (
    <article className="stat-card">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
`,
`function StatCard({ icon: Icon, label, value, tone = '', note = '' }) {
  return (
    <article className={tone ? `stat-card ${tone}` : 'stat-card'}>
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}
`,
'carte estimative',
);

fs.writeFileSync(appPath, app);

let styles = fs.readFileSync(stylesPath, 'utf8');
const marker = '/* V30 forecast and scheduled actions */';
if (!styles.includes(marker)) {
  styles += `\n\n${marker}\n.stat-card.estimated {\n  background: #eef3f1;\n  border-color: #d8e2df;\n  color: #60716f;\n}\n\n.stat-card.estimated svg,\n.stat-card.estimated > span {\n  opacity: 0.78;\n}\n\n.stat-card.estimated strong {\n  color: #48615d;\n}\n\n.stat-card.estimated small {\n  display: block;\n  margin-top: 0.35rem;\n  color: #7a8987;\n  font-size: 0.72rem;\n  line-height: 1.25;\n}\n\n.scheduled-actions {\n  display: flex;\n  gap: 0.45rem;\n  align-items: center;\n}\n\n.scheduled-action {\n  width: 2.4rem;\n  height: 2.4rem;\n  border: 0;\n  border-radius: 999px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n}\n\n.scheduled-action.edit {\n  background: #e0f0e6;\n  color: #214d73;\n}\n\n.scheduled-action.delete {\n  background: #f3e8e4;\n  color: #b84e49;\n}\n\n.upcoming-list {\n  display: grid;\n  gap: 0.65rem;\n}\n\n.upcoming-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 1rem;\n  padding: 0.75rem 0;\n  border-bottom: 1px solid #dce5e2;\n}\n\n.upcoming-row:last-child {\n  border-bottom: 0;\n}\n\n.upcoming-row div {\n  display: grid;\n  gap: 0.2rem;\n}\n\n.upcoming-row span {\n  color: #6e7d87;\n  font-size: 0.82rem;\n}\n`;
}
fs.writeFileSync(stylesPath, styles);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v\d+';/, "const CACHE_NAME = 'mon-foyer-v30';");
fs.writeFileSync(swPath, sw);

console.log('Mise à jour V30 appliquée.');
