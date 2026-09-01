import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('le type remboursement reste disponible dans le formulaire et les filtres', () => {
  const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const options = appSource.match(/<option value="reimbursement">Remboursement<\/option>/g) || [];

  assert.equal(options.length, 2);
});
