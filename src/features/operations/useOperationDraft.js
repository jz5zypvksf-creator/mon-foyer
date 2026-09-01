import { useCallback, useState } from 'react';

export function createEmptyOperationDraft() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return {
    id: '', date, person: 'Foyer', type: 'variable', category: 'nourriture', store: '',
    paymentMethod: 'Compte Belfius', label: '', amount: '', recurrence: 'once',
    recurringDay: now.getDate(), recurringId: '', structuredCommunication: '',
    directDebitReference: '', freeCommunication: '', freeCommunicationMode: 'contains',
    savingsSource: '', savingsGoalId: '', savingsDirection: '', budgetMonth: date.slice(0, 7),
    incomeKind: 'other', incomeSource: '', settlesPaymentMethod: '', settlementDate: '',
    reviewStatus: 'unreviewed', reviewNote: '', reviewedBy: '', reviewedAt: '',
    disputeReference: '', resolvedAt: '',
  };
}

export default function useOperationDraft({ createEmptyDraft = createEmptyOperationDraft } = {}) {
  const [draft, setDraft] = useState(createEmptyDraft);
  const [editingId, setEditingId] = useState(null);

  const resetDraft = useCallback(() => {
    setDraft(createEmptyDraft());
    setEditingId(null);
  }, [createEmptyDraft]);

  const startEditing = useCallback((operation) => {
    setDraft({ ...createEmptyDraft(), ...operation, amount: String(operation?.amount ?? '') });
    setEditingId(operation?.id || null);
  }, [createEmptyDraft]);

  return { draft, setDraft, editingId, setEditingId, resetDraft, startEditing };
}
