import { foodBudgetForMonth } from './configurationRules.js';
import { householdFoodTotal } from './foodBudgetRules.js';

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function validMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

export function daysInMonth(monthKey) {
  if (!validMonthKey(monthKey)) return 0;
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function nextMonthKey(monthKey) {
  if (!validMonthKey(monthKey)) return '';
  const [year, month] = monthKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function foodBudgetProgressStatus(spent, budget) {
  const safeBudget = Number(budget) || 0;
  const safeSpent = Math.max(Number(spent) || 0, 0);
  if (safeBudget <= 0 || safeSpent > safeBudget) return 'exceeded';
  const ratio = safeSpent / safeBudget;
  if (ratio >= 0.95) return 'danger';
  if (ratio >= 0.8) return 'warning';
  return 'safe';
}

export function analyzeFoodBudgetPace({ monthKey, budget, spent, currentDate }) {
  const totalDays = daysInMonth(monthKey);
  const currentMonth = String(currentDate || '').slice(0, 7);
  const currentDay = Number(String(currentDate || '').slice(8, 10));
  const elapsedDays = monthKey < currentMonth
    ? totalDays
    : monthKey === currentMonth
      ? Math.min(Math.max(currentDay, 1), totalDays)
      : 0;
  const remainingDays = monthKey === currentMonth ? Math.max(totalDays - elapsedDays, 0) : 0;
  const safeBudget = Math.max(Number(budget) || 0, 0);
  const safeSpent = Math.max(Number(spent) || 0, 0);
  const remaining = safeBudget - safeSpent;
  const actualPerDay = elapsedDays ? safeSpent / elapsedDays : 0;

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    budgetPerDay: totalDays ? roundMoney(safeBudget / totalDays) : 0,
    actualPerDay: roundMoney(actualPerDay),
    projectedMonth: monthKey < currentMonth
      ? roundMoney(safeSpent)
      : monthKey === currentMonth
        ? roundMoney(actualPerDay * totalDays)
        : 0,
    remaining: roundMoney(remaining),
    remainingPerDay: remainingDays ? roundMoney(Math.max(remaining, 0) / remainingDays) : 0,
    status: remaining < 0 ? 'over' : actualPerDay > (totalDays ? safeBudget / totalDays : 0) ? 'watch' : 'on-track',
  };
}

export function recommendFoodBudget({
  operations = [],
  budgetSettings = [],
  currentBudget,
  excludedPeople = [],
  currentDate,
}) {
  const currentMonth = String(currentDate || '').slice(0, 7);
  const completedMonths = [...new Set(operations
    .map((operation) => String(operation?.date || '').slice(0, 7))
    .filter((monthKey) => validMonthKey(monthKey) && monthKey < currentMonth))]
    .sort()
    .slice(-3);

  const auditedMonths = completedMonths.map((monthKey) => {
    const monthOperations = operations.filter((operation) => String(operation?.date || '').startsWith(monthKey));
    return {
      monthKey,
      spent: roundMoney(householdFoodTotal(monthOperations, excludedPeople)),
      budget: foodBudgetForMonth(budgetSettings, monthKey),
    };
  });

  if (auditedMonths.length < 3) {
    return {
      ready: false,
      auditedMonths,
      requiredMonths: 3,
      missingMonths: 3 - auditedMonths.length,
    };
  }

  const spending = auditedMonths.map((month) => month.spent);
  const average = roundMoney(spending.reduce((sum, value) => sum + value, 0) / spending.length);
  const median = [...spending].sort((left, right) => left - right)[1];
  const targetWithBuffer = roundMoney(median * 1.05);
  const safeCurrentBudget = Math.max(Number(currentBudget) || 0, 0);
  const maximumMonthlyChange = roundMoney(Math.min(Math.max(safeCurrentBudget * 0.05, 5), 25));
  const difference = targetWithBuffer - safeCurrentBudget;
  const limitedDifference = Math.max(-maximumMonthlyChange, Math.min(maximumMonthlyChange, difference));
  const suggestedBudget = Math.abs(difference) < 5
    ? safeCurrentBudget
    : roundMoney(safeCurrentBudget + limitedDifference);

  return {
    ready: true,
    auditedMonths,
    average,
    median: roundMoney(median),
    targetWithBuffer,
    maximumMonthlyChange,
    suggestedBudget,
    adjustment: roundMoney(suggestedBudget - safeCurrentBudget),
    effectiveMonth: nextMonthKey(currentMonth),
  };
}
