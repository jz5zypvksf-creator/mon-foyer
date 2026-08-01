import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

if (!app.includes("const [recurringEditingId, setRecurringEditingId] = useState(null);")) {
  app = app.replace(
    "  const [recurringDraft, setRecurringDraft] = useState(makeEmptyRecurringFixedExpense);\n",
    "  const [recurringDraft, setRecurringDraft] = useState(makeEmptyRecurringFixedExpense);\n  const [recurringEditingId, setRecurringEditingId] = useState(null);\n",
  );
}

const addStart = app.indexOf("  const addRecurringFixedExpense = async (event) => {");
const deleteStart = app.indexOf("  const deleteRecurringFixedExpense = async (id) => {");
if (addStart < 0 || deleteStart < 0 || deleteStart <= addStart) {
  throw new Error('V31.2: bloc de gestion des frais récurrents introuvable.');
}

const replacement = `  const editRecurringFixedExpense = (expense) => {
    setRecurringEditingId(expense.id);
    setRecurringDraft({
      label: expense.label,
      amount: String(expense.amount ?? ''),
      day: expense.day || 1,
      frequency: expense.frequency || 'monthly',
      startDate: expense.startDate || expense.start_date || currentDate(),
      person: expense.person || 'Foyer',
      category: expense.category || 'habitation',
    });
    setRecurringStatus('Modification du frais récurrent en cours.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addRecurringFixedExpense = async (event) => {
    event.preventDefault();
    const amount = parseDecimal(recurringDraft.amount);
    const label = recurringDraft.label.trim();

    if (!label || !amount) {
      setRecurringStatus('Indique un libellé et un montant.');
      return;
    }

    let fixedExpense = {
      id: recurringEditingId || crypto.randomUUID(),
      label,
      amount,
      day: Math.min(Math.max(Number(recurringDraft.day) || 1, 1), 31),
      person: recurringDraft.person,
      category: recurringDraft.category,
      frequency: recurringDraft.frequency || 'monthly',
      startDate: recurringDraft.startDate || currentDate(),
    };

    const identicalRecurring = (data.recurringFixedExpenses || []).find(
      (expense) => expense.id !== recurringEditingId
        && recurringExpenseSignature(expense) === recurringExpenseSignature(fixedExpense),
    );

    if (identicalRecurring) {
      const category = data.categories.find((item) => item.id === identicalRecurring.category);
      setRecurringStatus(
        'Attention : cette récurrence existe déjà — ' + identicalRecurring.label + ', '
        + formatCurrency(identicalRecurring.amount) + ', jour ' + identicalRecurring.day + ', '
        + (category?.label || 'Frais fixe') + ', ' + identicalRecurring.person + '.',
      );
      return;
    }

    if (USE_REMOTE_BUDGET) {
      const payload = {
        household_id: householdId,
        label: fixedExpense.label,
        amount: fixedExpense.amount,
        day: fixedExpense.day,
        person: fixedExpense.person,
        category: fixedExpense.category,
        frequency: fixedExpense.frequency,
        start_date: fixedExpense.startDate,
      };

      const query = recurringEditingId
        ? supabase
          .from('recurring_fixed_expenses')
          .update(payload)
          .eq('id', recurringEditingId)
          .eq('household_id', householdId)
          .select('id, label, amount, day, person, category, frequency, start_date')
          .single()
        : supabase
          .from('recurring_fixed_expenses')
          .insert(payload)
          .select('id, label, amount, day, person, category, frequency, start_date')
          .single();

      const { data: savedExpense, error } = await query;

      if (error) {
        setRecurringStatus(formatSupabaseRecurringError(error));
        return;
      }

      fixedExpense = {
        id: savedExpense.id,
        label: savedExpense.label,
        amount: Number(savedExpense.amount),
        day: Number(savedExpense.day),
        person: savedExpense.person,
        category: savedExpense.category,
        frequency: savedExpense.frequency || 'monthly',
        startDate: savedExpense.start_date || currentDate(),
      };
    }

    const currentExpenses = data.recurringFixedExpenses || [];
    const nextExpenses = recurringEditingId
      ? currentExpenses.map((expense) => (expense.id === recurringEditingId ? fixedExpense : expense))
      : [...currentExpenses, fixedExpense];

    saveData({
      ...data,
      recurringFixedExpenses: nextExpenses,
    });
    setRecurringDraft(makeEmptyRecurringFixedExpense());
    setRecurringEditingId(null);
    setRecurringStatus(recurringEditingId ? 'Frais fixe récurrent modifié.' : 'Frais fixe récurrent ajouté.');
  };

`;

app = app.slice(0, addStart) + replacement + app.slice(deleteStart);

app = app.replace(
  '<Plus size={20} /> Ajouter le frais fixe',
  "<Plus size={20} /> {recurringEditingId ? 'Enregistrer les modifications' : 'Ajouter le frais fixe'}",
);

const oldRow = `                      <button type="button" onClick={() => deleteRecurringFixedExpense(expense.id)} aria-label="Supprimer">
                        <Trash2 size={16} />
                      </button>`;
const newRow = `                      <div className="row-actions">
                        <button type="button" onClick={() => editRecurringFixedExpense(expense)} aria-label="Modifier" title="Modifier">
                          <Edit3 size={16} />
                        </button>
                        <button type="button" onClick={() => deleteRecurringFixedExpense(expense.id)} aria-label="Supprimer" title="Supprimer">
                          <Trash2 size={16} />
                        </button>
                      </div>`;

if (!app.includes(oldRow)) {
  throw new Error('V31.2: ligne des actions récurrentes introuvable.');
}
app = app.replace(oldRow, newRow);

fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-2';");
fs.writeFileSync(swPath, sw);

console.log('V31.2 appliquée : modification des frais récurrents activée.');
// trigger 2
