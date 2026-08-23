import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeFoodBudgetPace, recommendFoodBudget } from './foodBudgetAnalysisRules.js';

test('le rythme alimentaire compare le budget journalier aux jours écoulés', () => {
  const analysis = analyzeFoodBudgetPace({
    monthKey: '2026-08',
    budget: 500,
    spent: 230,
    currentDate: '2026-08-23',
  });

  assert.equal(analysis.totalDays, 31);
  assert.equal(analysis.elapsedDays, 23);
  assert.equal(analysis.budgetPerDay, 16.13);
  assert.equal(analysis.actualPerDay, 10);
  assert.equal(analysis.projectedMonth, 310);
  assert.equal(analysis.remainingPerDay, 33.75);
  assert.equal(analysis.status, 'on-track');
});

test('aucune recommandation ne paraît avant trois mois terminés', () => {
  const recommendation = recommendFoodBudget({
    operations: [
      { date: '2026-06-15', category: 'nourriture', person: 'Foyer', amount: 450 },
      { date: '2026-07-15', category: 'nourriture', person: 'Foyer', amount: 470 },
    ],
    currentBudget: 500,
    currentDate: '2026-08-23',
  });

  assert.equal(recommendation.ready, false);
  assert.equal(recommendation.missingMonths, 1);
});

test('la recommandation après trois mois est prudente et exclut Papa', () => {
  const operations = [
    { date: '2026-05-15', category: 'nourriture', person: 'Foyer', amount: 560 },
    { date: '2026-06-15', category: 'nourriture', person: 'Foyer', amount: 580 },
    { date: '2026-07-15', category: 'nourriture', person: 'Foyer', amount: 600 },
    { date: '2026-07-16', category: 'nourriture', person: 'Papa', amount: 100 },
  ];
  const recommendation = recommendFoodBudget({
    operations,
    currentBudget: 500,
    excludedPeople: ['Papa'],
    currentDate: '2026-08-23',
  });

  assert.equal(recommendation.ready, true);
  assert.equal(recommendation.average, 580);
  assert.equal(recommendation.median, 580);
  assert.equal(recommendation.suggestedBudget, 525);
  assert.equal(recommendation.adjustment, 25);
  assert.equal(recommendation.effectiveMonth, '2026-09');
});

