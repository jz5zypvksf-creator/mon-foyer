import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import BelfiusAudit from './BelfiusAudit.jsx';
import { loadPersistedAudit } from './lib/belfiusAuditStorage.js';
import { findOutstandingRecurringExpenses } from './lib/budgetAnalysisRules.js';

afterEach(() => { cleanup(); localStorage.clear(); });
const recurring = [{ id: 'savings', label: 'Épargne véhicule', amount: 100,
  day: 1, directDebitReference: '12345678' }];
function Harness() {
  const [audit, setAudit] = useState(loadPersistedAudit);
  const pending = findOutstandingRecurringExpenses({ recurringExpenses: recurring,
    selectedMonth: '2026-09', currentDate: '2026-09-16', bankRows: audit?.rows || [] });
  return <><output data-testid="pending">{pending.length}</output>
    <BelfiusAudit operations={[]} recurringExpenses={recurring} selectedMonth="2026-09"
      appBelfiusBalance={0} onCsvImported={setAudit} /></>;
}
it('updates pending savings on upload and keeps the result after reopening', async () => {
  const view = render(<Harness />);
  expect(screen.getByTestId('pending').textContent).toBe('1');
  const csv = 'Compte contrepartie;Date de comptabilisation;Montant;Nom contrepartie;Transaction;Communications\nBE00;04/09/2026;-100,00;Epargne;ORDRE PERMANENT 12345678;';
  fireEvent.change(view.container.querySelector('input[type="file"]'), { target: { files: [{
    name: 'bank.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer,
  }] } });
  await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('0'));
  view.unmount();
  render(<Harness />);
  expect(screen.getByTestId('pending').textContent).toBe('0');
});
