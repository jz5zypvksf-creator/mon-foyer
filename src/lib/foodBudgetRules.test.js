import assert from 'node:assert/strict';
import test from 'node:test';
import { foodBudgetExcludedPeople } from './configurationRules.js';
import {
  belongsToHouseholdFoodBudget,
  foodBudgetVisualStatus,
  householdFoodTotal,
} from './foodBudgetRules.js';

test('les achats de Papa et Nonna sont exclus du budget nourriture du foyer', () => {
  const operations = [
    { person: 'Foyer', category: 'nourriture', amount: 400 },
    { person: 'Alain', category: 'nourriture', amount: 45 },
    { person: 'Esther', category: 'nourriture', amount: 34.51 },
    { person: 'Papa', category: 'nourriture', amount: 31.92 },
    { person: 'Nonna', category: 'nourriture', amount: 44.45 },
  ];

  assert.equal(householdFoodTotal(operations), 479.51);
  assert.equal(belongsToHouseholdFoodBudget(operations[3]), false);
  assert.equal(belongsToHouseholdFoodBudget(operations[4]), false);
});

test('une dépense non alimentaire ne touche jamais le budget nourriture', () => {
  assert.equal(belongsToHouseholdFoodBudget({ person: 'Foyer', category: 'divers', amount: 50 }), false);
});

test('désactiver Papa ne réintègre pas ses anciens achats au budget du foyer', () => {
  const excludedPeople = foodBudgetExcludedPeople([
    { name: 'Papa', active: false, exclude_from_food_budget: true },
  ]);
  const operations = [
    { person: 'Papa', category: 'nourriture', amount: 16.14 },
    { person: 'Foyer', category: 'nourriture', amount: 25 },
  ];

  assert.equal(householdFoodTotal(operations, excludedPeople), 25);
});

test('la couleur du budget nourriture suit cinq seuils proportionnels', () => {
  assert.equal(foodBudgetVisualStatus(399.99, 500).key, 'green');
  assert.equal(foodBudgetVisualStatus(400, 500).key, 'orange');
  assert.equal(foodBudgetVisualStatus(474.99, 500).key, 'orange');
  assert.equal(foodBudgetVisualStatus(475, 500).key, 'red');
  assert.equal(foodBudgetVisualStatus(500, 500).key, 'red');
  assert.equal(foodBudgetVisualStatus(500.01, 500).key, 'dark-red');
  assert.equal(foodBudgetVisualStatus(550, 500).key, 'dark-red');
  assert.equal(foodBudgetVisualStatus(550.01, 500).key, 'black');
  assert.equal(foodBudgetVisualStatus(593.99, 500).key, 'black');
});

test('les seuils visuels évoluent avec le montant du budget', () => {
  assert.equal(foodBudgetVisualStatus(479.99, 600).key, 'green');
  assert.equal(foodBudgetVisualStatus(480, 600).key, 'orange');
  assert.equal(foodBudgetVisualStatus(570, 600).key, 'red');
  assert.equal(foodBudgetVisualStatus(600.01, 600).key, 'dark-red');
  assert.equal(foodBudgetVisualStatus(660.01, 600).key, 'black');
});
