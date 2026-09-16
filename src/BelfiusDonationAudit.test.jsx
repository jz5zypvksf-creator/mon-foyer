import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BelfiusAudit, { reconcileBelfiusRows } from './BelfiusAudit.jsx';

const amounts = [30, 30, 10, 10, 10, 10];
const bank = amounts.map((amount, i) => ({ id: `bank-${i}`, date: '2026-09-02', amount: -amount,
  label: 'DONATE.JW.ORG-CGJG', details: `REF. : BANK${i}` }));
const app = amounts.map((amount, i) => ({ id: `app-${i}`, date: '2026-09-02', amount,
  type: 'variable', category: 'dons', person: 'Foyer', store: 'JW.Org',
  label: `DONATE.JW.ORG-CGJG - Destination ${i}` }));
const recurring = [{ id: 'total', label: 'DONATE.JW.ORG-CGJG - Dons', amount: 100,
  day: 1, category: 'dons', person: 'Foyer', free_communication: 'DONATE.JW.ORG-CGJG' }];

describe('ventilation mensuelle des dons', () => {
  it('ne reprojette pas 100 euros ni six confirmations après une ventilation complète', () => {
    const result = reconcileBelfiusRows(bank, app, '2026-09', recurring);
    expect(result.donationAllocation.status).toBe('matched');
    expect(result.appRows).toHaveLength(0);
    expect(result.review).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
  });

  it('affiche 20 euros manquants sans certifier les 80 euros saisis comme complets', () => {
    localStorage.setItem('mon-foyer-belfius-audit-v1', JSON.stringify({ rows: bank, balance: 900, balanceDate: '16/09/2026' }));
    const onAuditSnapshot = vi.fn();
    render(<BelfiusAudit operations={app.slice(0, 4)} recurringExpenses={recurring}
      selectedMonth="2026-09" appBelfiusBalance={900} onAuditSnapshot={onAuditSnapshot} />);
    expect(screen.getByText(/Reste à ventiler/)).toHaveTextContent(/10.*10.*20/);
    expect(screen.queryByText('Comptabilité conforme')).not.toBeInTheDocument();
    expect(onAuditSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ remaining: 1, clean: false }));
    const result = reconcileBelfiusRows(bank, app.slice(0, 4), '2026-09', recurring);
    expect(result.groups).toHaveLength(0);
    expect(result.review).toHaveLength(0);
  });
});
