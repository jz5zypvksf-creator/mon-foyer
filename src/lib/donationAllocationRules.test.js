import test from 'node:test';
import assert from 'node:assert/strict';
import { auditJwDonationAllocation } from './donationAllocationRules.js';
import { findPotentialOperationDuplicate } from './operationDuplicateRules.js';

const amounts = [30, 30, 10, 10, 10, 10];
const banks = amounts.map((amount, index) => ({ id: `bank-${index}`, date: '2026-09-02',
  amount: -amount, label: 'DONATE.JW.ORG-CGJG', details: `REF. : BANK${index}` }));
const apps = amounts.map((amount, index) => ({ id: `app-${index}`, date: '2026-09-02',
  amount, type: 'variable', person: 'Foyer', category: 'dons', store: 'JW.Org',
  label: `DONATE.JW.ORG-CGJG - Destination ${index}`, payment_method: 'Compte Belfius' }));

test('les six dons distincts sont rapprochés ensemble sans inventer de correspondance individuelle', () => {
  const result = auditJwDonationAllocation(banks, apps, '2026-09');
  assert.equal(result.status, 'matched');
  assert.equal(result.bankTotal, 100);
  assert.equal(result.appTotal, 100);
  assert.deepEqual(result.app, apps);
  assert.deepEqual(result.remainingAmounts, []);
});

test('une ventilation de 80 euros conserve les deux débits de 10 euros à compléter', () => {
  const result = auditJwDonationAllocation(banks, apps.slice(0, 4), '2026-09');
  assert.equal(result.status, 'incomplete');
  assert.equal(result.difference, 20);
  assert.deepEqual(result.remainingAmounts, [10, 10]);
});

test('un total identique ne valide pas une distribution de montants différente', () => {
  const result = auditJwDonationAllocation(banks, [{ ...apps[0], amount: 50 }, { ...apps[1], amount: 50 }], '2026-09');
  assert.equal(result.status, 'mismatch');
  assert.equal(result.difference, 0);
});

test('une référence bancaire répétée ou manquante reste à vérifier', () => {
  assert.equal(auditJwDonationAllocation([...banks.slice(0, 5), banks[4]], apps, '2026-09').status, 'ambiguous');
  assert.equal(auditJwDonationAllocation(banks.map(row => ({ ...row, details: '' })), apps, '2026-09').status, 'ambiguous');
});

test('le même don saisi deux fois reste un doublon', () => {
  const duplicate = { ...apps[4], id: 'duplicate' };
  assert.equal(auditJwDonationAllocation(banks, [...apps.slice(0, 5), duplicate], '2026-09').status, 'ambiguous');
  assert.equal(findPotentialOperationDuplicate(duplicate, [apps[4]]).confidence, 'exact');
});

test('deux destinations différentes ne déclenchent plus le faux doublon de saisie', () => {
  assert.equal(findPotentialOperationDuplicate(apps[1], [apps[0]]), null);
  assert.equal(findPotentialOperationDuplicate(apps[3], [apps[2]]), null);
});

test('le mois précédent, les remboursements et les espèces ne complètent pas la ventilation', () => {
  const result = auditJwDonationAllocation(banks, [ ...apps.slice(0, 4),
    { ...apps[4], date: '2026-08-02' }, { ...apps[5], payment_method: 'Espèces' },
    { ...apps[5], type: 'reimbursement' },
  ], '2026-09');
  assert.equal(result.status, 'incomplete');
  assert.equal(result.appTotal, 80);
});

test('le total historique non ventilé reste traité par le regroupement existant', () => {
  assert.equal(auditJwDonationAllocation(banks, [{ ...apps[0], label: 'JW Donate', amount: 100 }], '2026-09'), null);
});

test('80 euros rapprochés ne valident pas une prévision de 100 euros', () => {
  const result = auditJwDonationAllocation(banks.slice(0, 4), apps.slice(0, 4), '2026-09', [{ label: 'JW Donate', amount: 100 }]);
  assert.equal(result.status, 'expected-mismatch');
  assert.equal(result.expectedTotal, 100);
});
