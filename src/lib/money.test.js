import assert from 'node:assert/strict';
import test from 'node:test';
import { amountCents, formatMoney, formatMoneyInput, moneyToCents, parseMoney } from '../domain/money/money.js';

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
  assert.equal(formatMoney(parseMoney('5,45')), '5,45 €');
  assert.equal(formatMoney(parseMoney('1 250')), '1 250,00 €');
  assert.equal(formatMoney(Number.NaN), '0,00 €');
});

test('formatMoneyInput impose une virgule et deux décimales dans les champs', () => {
  assert.equal(formatMoneyInput(130), '130,00');
  assert.equal(formatMoneyInput('130.'), '130,00');
  assert.equal(formatMoneyInput('130,0'), '130,00');
  assert.equal(formatMoneyInput('9.99'), '9,99');
  assert.equal(formatMoneyInput(''), '');
  assert.equal(formatMoneyInput('à corriger'), 'à corriger');
});

test('les rapprochements utilisent des centimes entiers pour le CSV et le JSON historique', () => {
  assert.equal(moneyToCents('-651,97'), -65197);
  assert.equal(moneyToCents(-41.78), -4178);
  assert.equal(amountCents({ amount: 100 }), 10000);
  assert.equal(amountCents({ amount: 999, amountCents: -30000 }), -30000);
  assert.equal(amountCents({ amount: 9.99, amountCents: null }), 999);
});
