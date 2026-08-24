import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bankPersonAliasMatch,
  isBankCreditAppOperation,
} from '../belfiusMatchingRules.js';

test('un remboursement est une entrée bancaire', () => {
  assert.equal(isBankCreditAppOperation({ type: 'reimbursement' }), true);
  assert.equal(isBankCreditAppOperation({ type: 'income' }), true);
  assert.equal(isBankCreditAppOperation({ type: 'variable' }), false);
});

test('PLUTA JANINA est reconnu comme alias bancaire de Nonna', () => {
  const bankRow = {
    label: 'PLUTA JANINA',
    communication: '2 cubis / Scottex / fruits de juin et juillet',
  };
  assert.equal(bankPersonAliasMatch(bankRow, {
    person: 'Nonna',
    label: 'Remboursement Nonna',
  }), true);
  assert.equal(bankPersonAliasMatch(bankRow, {
    person: 'Papa',
    label: 'Remboursement Papa',
  }), false);
});
