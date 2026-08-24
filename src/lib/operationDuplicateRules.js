function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelSimilarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aw = new Set(a.split(' ').filter((word) => word.length > 2));
  const bw = new Set(b.split(' ').filter((word) => word.length > 2));
  if (!aw.size || !bw.size) return 0;
  const common = [...aw].filter((word) => bw.has(word)).length;
  return common / Math.max(aw.size, bw.size);
}

const paymentMethod = (operation) => (
  operation?.paymentMethod || operation?.payment_method || 'Compte Belfius'
);

export function findPotentialOperationDuplicate(candidate, operations = [], excludedId = '') {
  const amount = Number(candidate?.amount || 0);
  return operations
    .filter((operation) => !excludedId || operation.id !== excludedId)
    .map((operation) => {
      if (String(operation.date || '') !== String(candidate.date || '')) return null;
      if (Math.abs(Number(operation.amount || 0) - amount) > 0.005) return null;
      if (paymentMethod(operation) !== paymentMethod(candidate)) return null;
      if ((operation.person || 'Foyer') !== (candidate.person || 'Foyer')) return null;

      const sameType = (operation.type || '') === (candidate.type || '');
      const sameCategory = (operation.category || '') === (candidate.category || '');
      const storedStore = normalize(operation.store);
      const candidateStore = normalize(candidate.store);
      const sameStore = Boolean(storedStore && candidateStore && storedStore === candidateStore);
      const similarity = labelSimilarity(operation.label, candidate.label);
      const exact = sameType && sameCategory && sameStore && similarity === 1;
      const probable = sameType && (sameStore || (sameCategory && similarity >= 0.72));
      if (!exact && !probable) return null;
      return { operation, confidence: exact ? 'exact' : 'probable' };
    })
    .filter(Boolean)
    .sort((left, right) => (left.confidence === 'exact' ? -1 : 1))[0] || null;
}

