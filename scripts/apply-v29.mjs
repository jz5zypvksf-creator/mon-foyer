import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

function replaceOnce(search, replacement, label) {
  if (app.includes(replacement)) return;
  if (!app.includes(search)) throw new Error(`V29: bloc introuvable — ${label}`);
  app = app.replace(search, replacement);
}

replaceOnce(
`function fixedExpenseSignature(operation) {
  return [
    operation.date,
    operation.person,
    operation.category,
    operation.label.trim().toLowerCase(),
    Number(operation.amount).toFixed(2),
  ].join('|');
}
`,
`function fixedExpenseSignature(operation) {
  return [
    operation.date,
    operation.person,
    operation.category,
    operation.label.trim().toLowerCase(),
    Number(operation.amount).toFixed(2),
  ].join('|');
}

function recurringExpenseSignature(expense) {
  return [
    expense.label.trim().toLowerCase(),
    Number(expense.amount).toFixed(2),
    Number(expense.day),
    expense.person,
    expense.category,
  ].join('|');
}
`,
'fonction de signature',
);

replaceOnce(
`        projectedRecurring: true,
`,
`        projectedRecurring: true,
        recurringExpenseId: expense.id,
`,
'identifiant de récurrence projetée',
);

replaceOnce(
`    setOperationStatus('');

    const operation = {
`,
`    setOperationStatus('');

    if (draft.recurringEnabled && draft.type !== 'income' && !draft.recurringId) {
      const recurringCandidate = {
        label: draft.label.trim(),
        amount,
        day: Math.min(Math.max(Number(draft.recurringDay) || 1, 1), 31),
        person: draft.person,
        category: draft.category,
      };
      const identicalRecurring = (data.recurringFixedExpenses || []).find(
        (expense) => recurringExpenseSignature(expense) === recurringExpenseSignature(recurringCandidate),
      );

      if (identicalRecurring) {
        const category = data.categories.find((item) => item.id === identicalRecurring.category);
        setOperationStatus(
          `Attention : cette dépense récurrente existe déjà — ${identicalRecurring.label}, `
          + `${formatCurrency(identicalRecurring.amount)}, jour ${identicalRecurring.day}, `
          + `${category?.label || 'Frais fixe'}, ${identicalRecurring.person}.`,
        );
        return;
      }
    }

    const operation = {
`,
'contrôle depuis une opération',
);

replaceOnce(
`    let fixedExpense = {
      id: crypto.randomUUID(),
      label,
      amount,
      day: Math.min(Math.max(Number(recurringDraft.day) || 1, 1), 31),
      person: recurringDraft.person,
      category: recurringDraft.category,
    };

    if (USE_REMOTE_BUDGET) {
`,
`    let fixedExpense = {
      id: crypto.randomUUID(),
      label,
      amount,
      day: Math.min(Math.max(Number(recurringDraft.day) || 1, 1), 31),
      person: recurringDraft.person,
      category: recurringDraft.category,
    };

    const identicalRecurring = (data.recurringFixedExpenses || []).find(
      (expense) => recurringExpenseSignature(expense) === recurringExpenseSignature(fixedExpense),
    );

    if (identicalRecurring) {
      const category = data.categories.find((item) => item.id === identicalRecurring.category);
      setRecurringStatus(
        `Attention : cette récurrence existe déjà — ${identicalRecurring.label}, `
        + `${formatCurrency(identicalRecurring.amount)}, jour ${identicalRecurring.day}, `
        + `${category?.label || 'Frais fixe'}, ${identicalRecurring.person}.`,
      );
      return;
    }

    if (USE_REMOTE_BUDGET) {
`,
'contrôle depuis les réglages',
);

replaceOnce(
`                {scheduledExpenses.map((operation) => (
                  <article className="scheduled-row" key={operation.id}>
                    <div>
                      <strong>{operation.label}</strong>
                      <span>
                        {operation.date} · {operation.paymentMethod || 'Compte Belfius'}
                        {operation.projectedRecurring ? ' · Récurrente' : ''}
                      </span>
                    </div>
                    <strong>{formatCurrency(operation.amount)}</strong>
                  </article>
                ))}
`,
`                {scheduledExpenses.map((operation) => {
                  const category = data.categories.find((item) => item.id === operation.category);
                  return (
                    <article className="scheduled-row" key={operation.id}>
                      <div>
                        <strong>{operation.label}</strong>
                        <span>
                          {operation.date} · {category?.label || 'Frais fixe'} · {operation.paymentMethod || 'Compte Belfius'}
                          {operation.projectedRecurring ? ' · Récurrente' : ' · Prévue'}
                        </span>
                      </div>
                      <strong>{formatCurrency(operation.amount)}</strong>
                      {operation.projectedRecurring && operation.recurringExpenseId && (
                        <button
                          type="button"
                          onClick={() => deleteRecurringFixedExpense(operation.recurringExpenseId)}
                          aria-label={`Supprimer la récurrence ${operation.label}`}
                          title="Supprimer cette récurrence"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </article>
                  );
                })}
`,
'liste des dépenses programmées',
);

fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v\d+';/, "const CACHE_NAME = 'mon-foyer-v29';");
fs.writeFileSync(swPath, sw);

console.log('Correctif V29 appliqué.');
