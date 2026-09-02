const STORE_REQUIRED_OPERATION_TYPES = new Set(['fixed', 'variable']);

export function operationRequiresStore(type) {
  return STORE_REQUIRED_OPERATION_TYPES.has(type);
}

export function operationStoreValue(type, store) {
  if (type === 'card_settlement') return 'Mastercard';
  return operationRequiresStore(type) ? String(store || '') : '';
}

/** Remplace une écriture après confirmation Supabase sans muter l'historique courant. */
export function replaceOperationById(operations = [], editingId = '', updatedOperation) {
  if (!editingId || !updatedOperation) return operations;
  return operations.map((operation) => (
    operation.id === editingId ? updatedOperation : operation
  ));
}
