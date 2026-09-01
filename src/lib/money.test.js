import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMoney, parseMoney } from '../domain/money/money.js';

test('parseMoney accepte les saisies belges et internationales usuelles', () => {
  assert.equal(parseMoney('1 250,45 €'), 1250.45);
  assert.equal(parseMoney('1.250,45 EUR'), 1250.45);
  assert.equal(parseMoney('1,250.45'), 1250.45);
  assert.equal(parseMoney(' 5,45 '), 5.45);
  assert.equal(parseMoney('(20,00 €)'), -20);
  assert.ok(Number.isNaN(parseMoney('montant inconnu')));
});

test('formatMoney impose toujours exactement deux décimales en euros', () => {
  assert.equal(formatMoney(20), '20,00 €');
  assert.equal(formatMoney('5,45'), '5,45 €');
  assert.equal(formatMoney('1 250'), '1 250,00 €');
  assert.equal(formatMoney(Number.NaN), '0,00 €');
});
