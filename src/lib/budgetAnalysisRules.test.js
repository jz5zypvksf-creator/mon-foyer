import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBudget, findOutstandingRecurringExpenses } from './budgetAnalysisRules.js';

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

test('le solde CSV d’ouverture remplace les salaires antérieurs sans double comptage', () => {
  const analysis = analyzeBudget({
    operations: [
      { date: '2026-07-01', type: 'income', amount: 2204.20, label: 'Salaire Alain' },
      { date: '2026-07-30', type: 'income', amount: 2328.05, label: 'Salaire Esther' },
      { date: '2026-07-31', type: 'income', amount: 1892.68, label: 'Salaire Alain' },
      { date: '2026-08-04', type: 'income', amount: 895.47, label: 'Revenus août' },
      { date: '2026-08-17', type: 'variable', amount: 4961.27, label: 'Dépenses exécutées' },
    ],
    selectedMonth: '2026-08', currentDate: '2026-08-17', openingBalance: 4111.97,
    scheduledExpenseTotal: 148.29,
  });
  assert.ok(Math.abs(analysis.current.income - 895.47) < 0.005);
  assert.ok(Math.abs(analysis.current.resources - 5007.44) < 0.005);
  assert.ok(Math.abs(analysis.current.surplus - 46.17) < 0.005);
  assert.ok(Math.abs(analysis.forecastBalance - (-102.12)) < 0.005);
});

test('les employeurs et le complément ONEM sont affectés explicitement au mois budgétaire', () => {
  const analysis = analyzeBudget({
    operations: [
      { id: 'esther', date: '2026-07-30', type: 'income', amount: 2328.05, label: 'Salaire Esther', incomeKind: 'salary', incomeSource: 'REXEL BELGIUM SA/NV', budgetMonth: '2026-08' },
      { id: 'alain', date: '2026-07-31', type: 'income', amount: 1892.68, label: 'Salaire Alain', incomeKind: 'salary', incomeSource: 'ETHIAS', budgetMonth: '2026-08' },
      { id: 'onem', date: '2026-08-04', type: 'income', amount: 419.07, label: 'Revenu supplémentaire Alain', incomeKind: 'complementary', incomeSource: 'ONEM', budgetMonth: '2026-08' },
      { id: 'other', date: '2026-08-06', type: 'income', amount: 476.40, label: 'Autres revenus', incomeKind: 'other', budgetMonth: '2026-08' },
      { date: '2026-08-17', type: 'variable', amount: 4961.27, label: 'Dépenses exécutées' },
    ],
    selectedMonth: '2026-08', currentDate: '2026-08-17', openingBalance: 4111.97,
    scheduledExpenseTotal: 148.29,
  });
  assert.ok(Math.abs(analysis.current.assignedIncome - 5116.20) < 0.005);
  assert.ok(Math.abs(analysis.current.income - 895.47) < 0.005);
  assert.ok(Math.abs(analysis.forecastBalance - (-102.12)) < 0.005);
});

test('un achat Mastercard d’août affecte uniquement le mois du prélèvement de septembre', () => {
  const operation = {
    date: '2026-08-11', type: 'variable', amount: 2792.50, label: 'TUI Belgium',
    paymentMethod: 'Mastercard Platinum •••• 4397', settlementDate: '2026-09-16', budgetMonth: '2026-09',
  };
  const august = analyzeBudget({
    operations: [operation], selectedMonth: '2026-08', currentDate: '2026-08-23', openingBalance: 100,
  });
  const september = analyzeBudget({
    operations: [operation], selectedMonth: '2026-09', currentDate: '2026-09-16', openingBalance: 3000,
  });
  assert.equal(august.current.expenses, 0);
  assert.equal(september.current.expenses, 2792.50);
});

test('un transfert depuis l’épargne finance la trésorerie sans devenir un revenu', () => {
  const analysis = analyzeBudget({
    operations: [{
      date: '2026-09-10', type: 'income', amount: 2792.50,
      label: 'Transfert depuis épargne — Vacances', savingsDirection: 'out', budgetMonth: '2026-09',
    }],
    selectedMonth: '2026-09', currentDate: '2026-09-16', openingBalance: 0,
  });
  assert.equal(analysis.current.income, 0);
  assert.equal(analysis.current.savingsFunding, 2792.50);
  assert.equal(analysis.current.resources, 0);
  assert.equal(analysis.current.cashResources, 2792.50);
  assert.equal(analysis.current.surplus, 0);
  assert.equal(analysis.current.cashAfterSavings, 2792.50);
});

test('la clôture d’août sépare dépenses, remboursements et épargne', () => {
  const analysis = analyzeBudget({
    operations: [
      { date: '2026-08-04', type: 'income', amount: 975.47, label: 'Revenus août', budgetMonth: '2026-08' },
      { date: '2026-08-10', type: 'fixed', amount: 4458.67, label: 'Dépenses réelles' },
      { date: '2026-08-12', type: 'fixed', amount: 1940, label: 'Épargne loisirs', accountingNature: 'internal_transfer' },
      { date: '2026-08-15', type: 'reimbursement', amount: 120.92, label: 'Remboursements Nonna et Papa' },
    ],
    selectedMonth: '2026-08', currentDate: '2026-08-31', openingBalance: 4111.97,
  });
  assert.ok(Math.abs(analysis.current.resources - 5208.36) < 0.005);
  assert.ok(Math.abs(analysis.current.expenses - 4458.67) < 0.005);
  assert.equal(analysis.current.savingsTransfers, 1940);
  assert.ok(Math.abs(analysis.current.surplus - 749.69) < 0.005);
  assert.ok(Math.abs(analysis.current.cashAfterSavings - (-1190.31)) < 0.005);
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

test('une récurrence passée sans import reste due dans le mois courant', () => {
  const outstanding = findOutstandingRecurringExpenses({
    recurringExpenses: [{
      id: 'ethias-maison', label: 'Ethias nv / Ethias SA - Maison 1', amount: 125.40,
      day: 1, person: 'Foyer', category: 'assurances', paymentMethod: 'Compte Belfius',
      frequency: 'monthly', startDate: '2026-01-01',
    }],
    operations: [],
    selectedMonth: '2026-09',
    currentDate: '2026-09-02',
  });

  assert.equal(outstanding.length, 1);
  assert.equal(outstanding[0].amount, 125.40);
  assert.equal(outstanding[0].pendingCsvImport, true);
  assert.equal(outstanding[0].statusLabel, "Débité en banque - En attente d'import CSV");
});

test('la ligne virtuelle disparaît dès qu’un libellé bancaire similaire est importé', () => {
  const outstanding = findOutstandingRecurringExpenses({
    recurringExpenses: [{
      id: 'ethias-maison', label: 'Ethias nv / Ethias SA - Maison 1', amount: 125.40,
      day: 1, paymentMethod: 'Compte Belfius', frequency: 'monthly', startDate: '2026-01-01',
    }],
    operations: [{
      id: 'csv-row', date: '2026-09-01', label: 'ETHIAS ASSURANCES', amount: 126,
      type: 'fixed', paymentMethod: 'Compte Belfius',
    }],
    selectedMonth: '2026-09',
    currentDate: '2026-09-02',
  });

  assert.equal(outstanding.length, 0);
});

test('un montant bancaire identique résorbe la projection même si le libellé diffère', () => {
  const recurringExpense = {
    id: 'provider', label: 'Fournisseur historique', amount: 87.65,
    day: 1, paymentMethod: 'Compte Belfius', frequency: 'monthly', startDate: '2026-01-01',
  };
  const imported = {
    id: 'csv-row', date: '2026-09-01', label: 'Nouveau libellé bancaire', amount: 87.65,
    type: 'fixed', paymentMethod: 'Compte Belfius',
  };

  assert.equal(findOutstandingRecurringExpenses({
    recurringExpenses: [recurringExpense], operations: [imported],
    selectedMonth: '2026-09', currentDate: '2026-09-02',
  }).length, 0);
});

test('une échéance future ne devient jamais une ligne virtuelle passée', () => {
  const outstanding = findOutstandingRecurringExpenses({
    recurringExpenses: [{
      id: 'future', label: 'Échéance future', amount: 50, day: 3,
      paymentMethod: 'Compte Belfius', frequency: 'monthly', startDate: '2026-01-01',
    }],
    selectedMonth: '2026-09',
    currentDate: '2026-09-02',
  });

  assert.equal(outstanding.length, 0);
});
