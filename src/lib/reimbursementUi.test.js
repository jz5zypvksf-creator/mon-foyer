import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('le type remboursement reste disponible dans le formulaire et les filtres', () => {
  const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const formSource = readFileSync(new URL('../features/operations/OperationForm.jsx', import.meta.url), 'utf8');
  const historySource = readFileSync(new URL('../features/operations/OperationHistory.jsx', import.meta.url), 'utf8');
  const optionPattern = /<option value="reimbursement">Remboursement<\/option>/g;

  assert.match(appSource, /import OperationForm from '.\/features\/operations\/OperationForm\.jsx';/);
  assert.match(appSource, /<OperationForm[\s\S]*<option value="reimbursement">Remboursement<\/option>[\s\S]*<\/OperationForm>/);
  assert.match(formSource, /« reimbursement » reste un type valide/);
  assert.equal((appSource.match(optionPattern) || []).length, 1);
  assert.equal((historySource.match(optionPattern) || []).length, 1);
});
