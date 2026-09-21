import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BelfiusAudit from './BelfiusAudit.jsx';
import { loadPersistedAudit } from './lib/belfiusAuditStorage.js';
import { findOutstandingRecurringExpenses } from './lib/budgetAnalysisRules.js';
import {
  bankRowFingerprint,
  loadBankMatchConfirmations,
  persistBankMatchConfirmations,
} from './lib/belfiusConfirmationRules.js';

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

it('updates every ordinary pending recurrence after CSV upload', async () => {
  const ordinaryRecurring = [{ id: 'psa', label: 'PSA Finance', amount: 478.78,
    day: 15, paymentMethod: 'Compte Belfius', frequency: 'monthly' }];
  function OrdinaryHarness() {
    const [audit, setAudit] = useState(null);
    const pending = findOutstandingRecurringExpenses({ recurringExpenses: ordinaryRecurring,
      selectedMonth: '2026-09', currentDate: '2026-09-19', bankRows: audit?.rows || [] });
    return <><output data-testid="ordinary-pending">{pending.length}</output>
      <BelfiusAudit operations={[]} recurringExpenses={ordinaryRecurring} selectedMonth="2026-09"
        appBelfiusBalance={0} onCsvImported={setAudit} /></>;
  }

  const view = render(<OrdinaryHarness />);
  expect(screen.getByTestId('ordinary-pending').textContent).toBe('1');
  const csv = 'Compte contrepartie;Date de comptabilisation;Montant;Nom contrepartie;Transaction;Communications\nBE00;14/09/2026;-478,78;STELLANTIS FINANCIAL SERVICES BELUX SA;DOMICILIATION;';
  fireEvent.change(view.container.querySelector('input[type="file"]'), { target: { files: [{
    name: 'bank.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer,
  }] } });
  await waitFor(() => expect(screen.getByTestId('ordinary-pending').textContent).toBe('0'));
});

it('restaure après rechargement une confirmation bancaire vers plusieurs échéances', () => {
  const bankRows = [{
    id: 'bank-mega', date: '2026-09-01', amount: -350, amountCents: -35000,
    label: 'MEGA (POWER ONLINE SA)', communication: 'ME1063232DOM001',
  }];
  const megaRecurring = [
    { id: 'mega-electricity', label: 'MEGA Électricité', amount: 220, day: 3, paymentMethod: 'Compte Belfius' },
    { id: 'mega-gas', label: 'MEGA Gaz', amount: 130, day: 3, paymentMethod: 'Compte Belfius' },
  ];
  persistBankMatchConfirmations([{
    bankFingerprint: bankRowFingerprint(bankRows[0], bankRows),
    targets: megaRecurring.map((expense) => ({
      recurringExpenseId: expense.id,
      appId: '',
      label: expense.label,
      amountCents: Math.round(expense.amount * 100),
    })),
    source: 'exact-group',
    confirmedAt: '2026-09-21T10:00:00.000Z',
  }]);

  const reloaded = loadBankMatchConfirmations();
  const pending = findOutstandingRecurringExpenses({
    recurringExpenses: megaRecurring,
    bankRows,
    bankMatchConfirmations: reloaded,
    selectedMonth: '2026-09',
    currentDate: '2026-09-21',
  });

  expect(reloaded).toHaveLength(1);
  expect(reloaded[0].targets.map((target) => target.recurringExpenseId)).toEqual([
    'mega-electricity', 'mega-gas',
  ]);
  expect(pending).toEqual([]);
});

it('le bouton Valider persiste la décision et la retire immédiatement des confirmations', async () => {
  localStorage.setItem('mon-foyer-belfius-audit-v1', JSON.stringify({
    rows: [{
      id: 'bank-manual', date: '2026-09-05', amount: -47.72, amountCents: -4772,
      label: 'AUTRE COMMERCANT', communication: '', details: '',
    }],
    balance: 100,
    balanceDate: '21-09-26',
  }));
  const onChange = vi.fn();
  const view = render(<BelfiusAudit
    operations={[{
      id: 'app-manual', date: '2026-09-05', amount: 47.72, type: 'fixed',
      label: 'Dépense reconnue par Alain', paymentMethod: 'Compte Belfius',
    }]}
    recurringExpenses={[]}
    selectedMonth="2026-09"
    appBelfiusBalance={100}
    onBankMatchConfirmationsChange={onChange}
  />);

  fireEvent.click(screen.getByRole('button', { name: /Valider/ }));

  await waitFor(() => expect(screen.queryByRole('button', { name: /Valider/ })).not.toBeInTheDocument());
  const persisted = loadBankMatchConfirmations();
  expect(persisted).toHaveLength(1);
  expect(persisted[0].targets[0].appId).toBe('app-manual');
  expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ bankFingerprint: expect.stringContaining('occurrence:0') }),
  ]));
  view.unmount();
});
