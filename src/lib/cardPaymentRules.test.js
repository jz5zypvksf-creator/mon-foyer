import assert from 'node:assert/strict';
import test from 'node:test';

import { mastercardSettlementDate } from './cardPaymentRules.js';

test('un achat avant la clôture du 7 est prélevé le 16 du même mois', () => {
  assert.equal(mastercardSettlementDate('2026-08-03'), '2026-08-17');
});

test('un achat après la clôture du 7 est prélevé le 16 du mois suivant', () => {
  assert.equal(mastercardSettlementDate('2026-08-19'), '2026-09-16');
  assert.equal(mastercardSettlementDate('2026-08-22'), '2026-09-16');
});
