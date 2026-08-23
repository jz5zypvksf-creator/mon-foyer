import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMastercardStatementCommunication,
  isMastercardStatementRow,
  mastercardStatementMatchEvidence,
} from './mastercardStatementRules.js';

test('reconnaît la référence stable quel que soit le numéro et le montant', () => {
  assert.equal(isMastercardStatementCommunication(
    'RELEVE MASTERCARD NUMERO 219 REF. : 080758H228556 VAL. 17-08',
  ), true);
  assert.equal(isMastercardStatementRow({
    amount: -53.93,
    details: 'RELEVE MASTERCARD NUMERO 188 REF. : variable',
  }), true);
});

test('ne rapproche le relevé qu’avec un véritable règlement Mastercard', () => {
  const bankRow = {
    date: '2026-08-17',
    amount: -116.92,
    details: 'RELEVE MASTERCARD NUMERO 219 REF. : variable',
  };
  assert.equal(mastercardStatementMatchEvidence(bankRow, {
    date: '2026-08-17', amount: 116.92, paymentMethod: 'Compte Belfius',
  }), null);
  assert.equal(mastercardStatementMatchEvidence(bankRow, {
    date: '2026-08-17', amount: 116.92, paymentMethod: 'Compte Belfius',
    settlesPaymentMethod: 'Mastercard Platinum •••• 4397',
  })?.confidence, 100);
});

test('un montant différent reste une anomalie à contrôler', () => {
  const evidence = mastercardStatementMatchEvidence({
    date: '2026-08-17', amount: -116.92,
    communication: 'RELEVE MASTERCARD NUMERO 219',
  }, {
    date: '2026-08-17', amount: 115,
    settlesPaymentMethod: 'Mastercard Platinum •••• 4397',
  });
  assert.equal(evidence, null);
});
