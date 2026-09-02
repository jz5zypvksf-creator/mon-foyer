import { useMemo } from 'react';
import {
  analyzeFoodBudgetPace,
  recommendFoodBudget,
} from '../../../lib/foodBudgetAnalysisRules.js';

export default function useFoodBudgetInsights({
  operations = [],
  budgetSettings = [],
  selectedMonth = '',
  currentBudget = 0,
  spent = 0,
  excludedPeople = [],
  currentDate = '',
}) {
  const pace = useMemo(() => analyzeFoodBudgetPace({
    monthKey: selectedMonth,
    budget: currentBudget,
    spent,
    currentDate,
  }), [currentBudget, currentDate, selectedMonth, spent]);

  const recommendation = useMemo(() => recommendFoodBudget({
    operations,
    budgetSettings,
    currentBudget,
    excludedPeople,
    currentDate,
  }), [budgetSettings, currentBudget, currentDate, excludedPeople, operations]);

  return { pace, recommendation };
}
