const STORE_REQUIRED_OPERATION_TYPES = new Set(['fixed', 'variable']);

export function operationRequiresStore(type) {
  return STORE_REQUIRED_OPERATION_TYPES.has(type);
}

export function operationStoreValue(type, store) {
  if (type === 'card_settlement') return 'Mastercard';
  return operationRequiresStore(type) ? String(store || '') : '';
}
