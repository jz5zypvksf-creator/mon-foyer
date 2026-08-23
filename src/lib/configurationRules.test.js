import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeCarePeople,
  annualFoodBudget,
  configuredCarePeople,
  foodBudgetExcludedPeople,
  foodBudgetForMonth,
  normalizeStandingOrderReference,
  peopleOptions,
  reimbursementTrackedPeople,
  standingOrderAlreadyAssigned,
} from './configurationRules.js';

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

test('désactiver une personne ne modifie ni son historique ni les anciens budgets', () => {
  const rows = [
    { name: 'Papa', active: true, tracks_reimbursements: true, exclude_from_food_budget: true },
    { name: 'Nonna', active: false, tracks_reimbursements: true, exclude_from_food_budget: true },
    { name: 'Voisine', active: false, tracks_reimbursements: false, exclude_from_food_budget: false },
  ];

  assert.deepEqual(configuredCarePeople(rows), ['Papa', 'Nonna', 'Voisine']);
  assert.deepEqual(reimbursementTrackedPeople(rows), ['Papa', 'Nonna']);
  assert.deepEqual(foodBudgetExcludedPeople(rows), ['Papa', 'Nonna']);
});

test('un numéro d’OP ne peut pas être affecté à deux comptes distincts', () => {
  const goals = [
    { id: 'a', standing_order_reference: '+++123/4567/89012+++' },
    { id: 'b', standing_order_reference: '987654' },
  ];

  assert.equal(normalizeStandingOrderReference('+++123/4567/89012+++'), '123456789012');
  assert.equal(standingOrderAlreadyAssigned('123 4567 89012', goals), true);
  assert.equal(standingOrderAlreadyAssigned('123 4567 89012', goals, 'a'), false);
  assert.equal(standingOrderAlreadyAssigned('', goals), false);
});
