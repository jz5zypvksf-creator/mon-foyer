import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mastercardRecurringForecast,
  mastercardSettlementDate,
  nextMastercardSettlementDate,
  recurringSourceMonthForBudget,
} from './cardPaymentRules.js';

test('un achat avant la clôture du 7 est prélevé le 16 du même mois', () => {
  assert.equal(mastercardSettlementDate('2026-08-03'), '2026-08-17');
});

test('un achat après la clôture du 7 est prélevé le 16 du mois suivant', () => {
  assert.equal(mastercardSettlementDate('2026-08-19'), '2026-09-16');
  assert.equal(mastercardSettlementDate('2026-08-22'), '2026-09-16');
});

test('la prévision Mastercard lit les achats récurrents du mois précédent', () => {
  assert.equal(
    recurringSourceMonthForBudget('Mastercard Platinum •••• 4397', '2026-09'),
    '2026-08',
  );
  assert.equal(recurringSourceMonthForBudget('Compte Belfius', '2026-09'), '2026-09');
});

test('projette une récurrence Mastercard dans le cycle ouvert après le 15', () => {
  const result = mastercardRecurringForecast({
    asOfDate: '2026-09-19',
    recurringExpenses: [{
      id: 'icloud', label: 'APPLE.COM/BILL — Icloud Mastercard', amount: 9.99,
      day: 22, frequency: 'monthly', startDate: '2026-09-01',
      paymentMethod: 'Mastercard Platinum •••• 4397',
    }],
  });
  assert.equal(result.nextDebitDate, '2026-10-16');
  assert.equal(result.total, 9.99);
  assert.deepEqual(result.charges.map((charge) => charge.expectedDate), ['2026-09-22']);
});

test('ne double pas une récurrence Mastercard déjà matérialisée', () => {
  const recurringExpenses = [{
    id: 'icloud', label: 'APPLE.COM/BILL — Icloud Mastercard', freeCommunication: 'APPLE.COM/BILL',
    amount: 9.99, day: 22, frequency: 'monthly', startDate: '2026-09-01',
    paymentMethod: 'Mastercard Platinum •••• 4397',
  }];
  const result = mastercardRecurringForecast({
    asOfDate: '2026-09-23',
    recurringExpenses,
    operations: [{
      date: '2026-09-22', label: 'APPLE.COM/BILL', amount: 9.99,
      paymentMethod: 'Mastercard Platinum •••• 4397', settlementDate: '2026-10-16', type: 'fixed',
    }],
  });
  assert.equal(result.total, 0);
  assert.deepEqual(result.charges, []);
});

test('passe au cycle suivant dès que le règlement du 16 est enregistré', () => {
  const operations = [{
    date: '2026-10-16', type: 'card_settlement', amount: 9.99,
    paymentMethod: 'Compte Belfius', settlesPaymentMethod: 'Mastercard Platinum •••• 4397',
  }];
  assert.equal(nextMastercardSettlementDate('2026-10-16', operations), '2026-11-16');
});
