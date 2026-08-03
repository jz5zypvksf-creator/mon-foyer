import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

const before = `    const existingRecurringExpenses = new Set(
      (recurringResult.error ? [] : recurringResult.data || []).map(recurringSignature),
    );
    const missingRecurringExpenses = (data.recurringFixedExpenses || [])
      .filter((expense) => !existingRecurringExpenses.has(recurringSignature(expense)))
      .map((expense) => ({
        household_id: householdId,
        label: expense.label,
        amount: parseDecimal(expense.amount),
        day: Math.min(Math.max(Number(expense.day) || 1, 1), 31),
        person: expense.person,
        category: expense.category,
        frequency: expense.frequency || 'monthly',
        start_date: expense.start_date || expense.startDate || currentDate(),
      }));`;

const after = `    const existingRecurringExpenses = new Set(
      (recurringResult.error ? [] : recurringResult.data || []).map(recurringSignature),
    );

    const uniqueLocalRecurringExpenses = Array.from(
      new Map(
        (data.recurringFixedExpenses || []).map((expense) => [recurringSignature(expense), expense]),
      ).values(),
    );

    const missingRecurringExpenses = uniqueLocalRecurringExpenses
      .filter((expense) => !existingRecurringExpenses.has(recurringSignature(expense)))
      .map((expense) => ({
        household_id: householdId,
        label: expense.label,
        amount: parseDecimal(expense.amount),
        day: Math.min(Math.max(Number(expense.day) || 1, 1), 31),
        person: expense.person,
        category: expense.category,
        frequency: expense.frequency || 'monthly',
        start_date: expense.start_date || expense.startDate || currentDate(),
      }));`;

if (!app.includes(before)) {
  throw new Error('V31.7 : bloc de migration des récurrences introuvable.');
}

app = app.replace(before, after);
fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-7';");
fs.writeFileSync(swPath, sw);

console.log('V31.7 appliquée : déduplication locale avant synchronisation.');
