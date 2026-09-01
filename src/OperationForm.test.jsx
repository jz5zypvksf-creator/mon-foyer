import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const { supabaseFrom } = vi.hoisted(() => ({ supabaseFrom: vi.fn() }));

vi.mock('./lib/supabase', () => ({
  householdId: '',
  isSupabaseConfigured: false,
  supabase: { from: supabaseFrom },
}));

const STORAGE_KEY = 'mon-foyer-v1';

function storedOperation(overrides = {}) {
  return {
    id: 'operation-a-modifier',
    date: '2026-09-01',
    person: 'Foyer',
    type: 'reimbursement',
    category: 'divers',
    store: '',
    paymentMethod: 'Compte Belfius',
    label: 'Remboursement test',
    amount: 10,
    ...overrides,
  };
}

async function openAddForm(user) {
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  return screen.getByRole('heading', { name: /Ajouter une operation/i }).closest('form');
}

describe('formulaire des opérations', () => {
  beforeEach(() => {
    localStorage.clear();
    supabaseFrom.mockReset();
  });

  it('annule une modification, vide les champs et ne contacte jamais Supabase', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ operations: [storedOperation()] }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Historique' }));
    const operationRow = screen.getByText('Remboursement test').closest('article');
    await user.click(within(operationRow).getByRole('button', { name: 'Modifier' }));

    const amount = screen.getByRole('textbox', { name: 'Montant' });
    await user.clear(amount);
    await user.type(amount, '42,50');
    await user.click(screen.getAllByRole('button', { name: 'Annuler' }).at(-1));

    expect(screen.getByRole('heading', { name: /Ajouter une operation/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Libellé' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Montant' })).toHaveValue('');
    expect(screen.getByText(/Aucune opération n’a été enregistrée/i)).toBeInTheDocument();
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it('enregistre des données normalisées quand le formulaire est valide', async () => {
    const user = userEvent.setup();
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(<App />);
    const form = await openAddForm(user);

    await user.selectOptions(within(form).getByRole('combobox', { name: 'Type' }), 'reimbursement');
    await user.type(within(form).getByRole('textbox', { name: 'Libellé' }), '  Remboursement Esther  ');
    await user.clear(within(form).getByRole('textbox', { name: 'Montant' }));
    await user.type(within(form).getByRole('textbox', { name: 'Montant' }), '42,50');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      const writes = storageSpy.mock.calls
        .filter(([key]) => key === STORAGE_KEY)
        .map(([, value]) => JSON.parse(value));
      expect(writes.some((state) => state.operations?.some((operation) => (
        operation.label === 'Remboursement Esther'
        && operation.amount === 42.5
        && operation.type === 'reimbursement'
        && operation.store === ''
      )))).toBe(true);
    });
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it('signale un formulaire vide et bloque son envoi', async () => {
    const user = userEvent.setup();
    render(<App />);
    const form = await openAddForm(user);
    const submit = within(form).getByRole('button', { name: 'Enregistrer' });

    expect(within(form).getByRole('alert')).toHaveTextContent(/libellé et un montant supérieur à zéro/i);
    expect(submit).toBeDisabled();
    await user.click(submit);

    expect(supabaseFrom).not.toHaveBeenCalled();
  });
});
