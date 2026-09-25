import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BelfiusAudit from './BelfiusAudit.jsx';
import OperationHistory from './features/operations/OperationHistory.jsx';
import { loadPersistedAudit } from './lib/belfiusAuditStorage.js';
import { findOutstandingRecurringExpenses } from './lib/budgetAnalysisRules.js';
import {
  AWAITING_CSV_DISPLAY_STATUS,
  buildRecurringHistoryPresentationRows,
  CONFIRMED_CSV_DISPLAY_STATUS,
} from './features/operations/recurringHistoryPresentation.js';
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

it('remplace les cinq attentes historiques par des lignes blanches après le CSV réel', async () => {
  const ordinaryRecurring = [
    { id: 'ethias', label: 'ETHIAS Maison 1', amount: 651.97, day: 1,
      category: 'assurances', paymentMethod: 'Compte Belfius', frequency: 'monthly' },
    { id: 'ag', label: 'AG Assurance Maison Esther', amount: 41.78, day: 1,
      category: 'assurances', paymentMethod: 'Compte Belfius', frequency: 'monthly' },
    { id: 'home', label: 'Remboursement maison Esther', amount: 76.64, day: 1,
      category: 'emprunt_maison', paymentMethod: 'Compte Belfius', frequency: 'monthly' },
    { id: 'household-savings', label: 'Épargne frais divers foyer', amount: 100, day: 1,
      category: 'epargne', directDebitReference: '18833985', paymentMethod: 'Compte Belfius', frequency: 'monthly' },
    { id: 'taxes', label: 'Taxes / Impôts', amount: 300, day: 1,
      category: 'epargne', directDebitReference: '20401142', paymentMethod: 'Compte Belfius', frequency: 'monthly' },
  ];
  const savingsGoals = [
    { id: 'house', label: 'Maison', active: true, standingOrderReference: '18833985' },
    { id: 'taxes-goal', label: 'Taxes / Impôts', active: true, standingOrderReference: '20401142' },
  ];
  function OrdinaryHarness() {
    const [audit, setAudit] = useState(null);
    const pending = findOutstandingRecurringExpenses({ recurringExpenses: ordinaryRecurring,
      savingsGoals, selectedMonth: '2026-09', currentDate: '2026-09-24', bankRows: audit?.rows || [] });
    return <><output data-testid="ordinary-pending">{pending.length}</output>
      <BelfiusAudit operations={[]} recurringExpenses={ordinaryRecurring} selectedMonth="2026-09"
        appBelfiusBalance={0} onCsvImported={setAudit} /></>;
  }

  const view = render(<OrdinaryHarness />);
  expect(screen.getByTestId('ordinary-pending').textContent).toBe('5');
  const csv = [
    'Compte contrepartie;Date de comptabilisation;Montant;Nom contrepartie;Transaction;Communications',
    'BE73;01/09/2026;-651,97;ETHIAS nv / ETHIAS SA;VOTRE DOMICILIATION EUROPEENNE 82769215152101;',
    'BE94;01/09/2026;-41,78;AG INSURANCE;VOTRE DOMICILIATION EUROPEENNE 100106706;',
    'BE17;01/09/2026;-76,64;AG Insurance nv / AG Insurance SA;VOTRE DOMICILIATION EUROPEENNE 053124603120;',
    'BE25;03/09/2026;-100,00;Wileur Du Bois;ORDRE PERMANENT 18833985;',
    'BE59;01/09/2026;-300,00;Esther Brigante;ORDRE PERMANENT INSTANTANE 20401142;',
  ].join('\r\n');
  fireEvent.change(view.container.querySelector('input[type="file"]'), { target: { files: [{
    name: 'bank.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer,
  }] } });
  await waitFor(() => expect(screen.getByTestId('ordinary-pending').textContent).toBe('0'));
  view.unmount();

  const confirmedPresentationRows = buildRecurringHistoryPresentationRows({
    recurringExpenses: ordinaryRecurring,
    outstandingRecurringExpenses: [],
    monthOperations: [],
    selectedMonth: '2026-09',
    balanceCutoff: '2026-09-24',
    hasImportedCsv: true,
  });
  expect(confirmedPresentationRows).toHaveLength(5);
  expect(confirmedPresentationRows.every((row) => row.csvConfirmedByImport)).toBe(true);

  const waiting = {
    id: 'waiting', date: '2026-09-18', person: 'Foyer', type: 'fixed', category: 'divers',
    label: 'Échéance toujours en attente', amount: 50, paymentMethod: 'Compte Belfius',
    virtualRecurring: true, pendingCsvImport: true, statusLabel: "Débité en banque - En attente d'import CSV",
  };
  const confirmed = confirmedPresentationRows;
  render(<OperationHistory
    operations={[]}
    monthOperations={[waiting, ...confirmed]}
    filteredMonthOperations={[waiting, ...confirmed]}
    categories={[]}
    selectedMonth="2026-09"
    historySearch=""
    setHistorySearch={vi.fn()}
    historyType="all"
    setHistoryType={vi.fn()}
    historyPerson="all"
    setHistoryPerson={vi.fn()}
    historyPeople={[]}
    historyCategory="all"
    setHistoryCategory={vi.fn()}
    historyPaymentMethod="all"
    setHistoryPaymentMethod={vi.fn()}
    showReviewOnly={false}
    setShowReviewOnly={vi.fn()}
    reviewMap={new Map()}
    historyTotals={{ balance: 0, income: 0, expenses: 0 }}
    paymentBalances={{}}
    today="2026-09-24"
    onEditOperation={vi.fn()}
    onDeleteOperation={vi.fn()}
  />);

  expect(screen.getByText('Échéance toujours en attente').closest('article'))
    .toHaveClass('virtual-recurring');
  expect(screen.getByText(AWAITING_CSV_DISPLAY_STATUS)).toBeInTheDocument();
  ordinaryRecurring.forEach((expense) => {
    const confirmedRow = screen.getByText(expense.label).closest('article');
    expect(confirmedRow).toHaveClass('csv-confirmed');
    expect(confirmedRow).not.toHaveClass('virtual-recurring');
    expect(confirmedRow.querySelector('.virtual-recurring-status')).toHaveTextContent(CONFIRMED_CSV_DISPLAY_STATUS);
  });
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
