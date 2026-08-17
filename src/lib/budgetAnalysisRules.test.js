import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBudget } from './budgetAnalysisRules.js';

function rows(month, income, expenses) {
  return [
    { date: `${month}-01`, type: 'income', amount: income, label: 'Revenus' },
    { date: `${month}-10`, type: 'fixed', amount: expenses, label: 'Dépenses' },
  ];
}

test('août incomplet ne produit aucune tendance inventée', () => {
  const analysis = analyzeBudget({
    operations: rows('2026-08', 5116.20, 5267.52), selectedMonth: '2026-08',
    currentDate: '2026-08-17', forecastBalance: 31.43,
    scheduledExpenseTotal: 148.29, remainingFoodBudget: 46.84, emergencyFundSaved: 0,
  });
  assert.equal(analysis.isCurrentMonth, true);
  assert.equal(analysis.history.length, 0);
  assert.equal(analysis.trend, null);
  assert.equal(analysis.emergency.key, 'insufficient-history');
});

test('août reçoit les salaires de fin juillet sans compter les dépenses futures deux fois', () => {
  const analysis = analyzeBudget({
    operations: [
      { date: '2026-07-30', type: 'income', amount: 2328.05, label: 'Salaire Esther' },
      { date: '2026-07-31', type: 'income', amount: 1892.68, label: 'Salaire Alain' },
      { date: '2026-08-04', type: 'income', amount: 895.47, label: 'Autres revenus' },
      { date: '2026-08-12', type: 'fixed', amount: 3761.74, label: 'Frais fixes' },
      { date: '2026-08-17', type: 'variable', amount: 1199.53, label: 'Variables' },
      { date: '2026-08-29', type: 'fixed', amount: 148.29, label: 'À venir' },
    ],
    selectedMonth: '2026-08', currentDate: '2026-08-17',
    scheduledExpenseTotal: 148.29, remainingFoodBudget: 30.24, emergencyFundSaved: 0,
  });
  assert.ok(Math.abs(analysis.current.income - 5116.20) < 0.005);
  assert.ok(Math.abs(analysis.current.expenses - 4961.27) < 0.005);
  assert.ok(Math.abs(analysis.forecastBalance - 6.64) < 0.005);
});

test('la suggestion du fonds d’urgence utilise trois mois terminés', () => {
  const analysis = analyzeBudget({
    operations: [
      ...rows('2026-05', 4000, 3600), ...rows('2026-06', 4200, 3800),
      ...rows('2026-07', 4100, 3900),
      { date: '2026-07-15', type: 'income', amount: 500, label: 'Transfert depuis épargne — Vacances' },
    ],
    selectedMonth: '2026-08', currentDate: '2026-08-17', forecastBalance: 200, emergencyFundSaved: 0,
  });
  assert.equal(analysis.history.length, 3);
  assert.equal(analysis.history.at(-1).income, 4100);
  assert.equal(analysis.emergency.key, 'recommended');
  assert.equal(analysis.emergency.monthlySuggestion, 50);
  assert.equal(analysis.emergency.smallestSurplus, 200);
});

test('aucun versement n’est conseillé si un mois terminé est déficitaire', () => {
  const analysis = analyzeBudget({
    operations: [...rows('2026-05', 4000, 3600), ...rows('2026-06', 4000, 4200), ...rows('2026-07', 4000, 3700)],
    selectedMonth: '2026-08', currentDate: '2026-08-17', forecastBalance: 100, emergencyFundSaved: 0,
  });
  assert.equal(analysis.emergency.key, 'not-recommended');
  assert.equal(analysis.emergency.monthlySuggestion, null);
});
