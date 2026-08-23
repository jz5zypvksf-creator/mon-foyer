import test from 'node:test';
import assert from 'node:assert/strict';
import { activeCarePeople, annualFoodBudget, foodBudgetForMonth, peopleOptions } from './configurationRules.js';

test('le budget applicable respecte le mois de prise d’effet', () => {
  const settings = [
    { effective_month: '2026-08', food_budget: 500 },
    { effective_month: '2026-10', food_budget: 550 },
  ];
  assert.equal(foodBudgetForMonth(settings, '2026-09'), 500);
  assert.equal(foodBudgetForMonth(settings, '2026-10'), 550);
});

test('le budget annuel additionne les versions mensuelles', () => {
  const settings = [
    { effective_month: '2026-01', food_budget: 500 },
    { effective_month: '2026-07', food_budget: 600 },
  ];
  assert.equal(annualFoodBudget(settings, '2026'), 6600);
});

test('les personnes actives complètent les membres du foyer', () => {
  const rows = [
    { name: 'Papa', active: true, tracks_reimbursements: true },
    { name: 'Nonna', active: false, tracks_reimbursements: true },
    { name: 'Marie', active: true, tracks_reimbursements: true },
  ];
  assert.deepEqual(activeCarePeople(rows), ['Papa', 'Marie']);
  assert.deepEqual(peopleOptions(activeCarePeople(rows)), ['Foyer', 'Alain', 'Esther', 'Papa', 'Marie']);
});
