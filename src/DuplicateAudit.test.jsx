import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import DuplicateAudit from './DuplicateAudit.jsx';

afterEach(cleanup);
const donations = ['Œuvre mondiale', 'Assemblée Herstal', 'Assemblée régionale',
  'Assemblée de circonscription', 'Construction salles', 'Construction audio vidéo']
  .map((destination, index) => ({ id: String(index), date: '2026-09-02',
    label: `DONATE.JW.ORG-CGJG - ${destination}`, amount: index < 2 ? 30 : 10,
    type: 'variable', person: 'Foyer', store: 'JW.Org', category: 'dons' }));

it('does not display the seven false pairs for six distinct donation destinations', () => {
  render(<DuplicateAudit operations={donations} selectedMonth="2026-09" />);
  expect(screen.getByText(/Aucun doublon exact ou probable/)).toBeTruthy();
});

it('still displays an actual duplicate of the same donation', () => {
  render(<DuplicateAudit operations={[...donations, { ...donations[0], id: 'copy' }]} />);
  expect(screen.getByText('Doublons exacts')).toBeTruthy();
});
