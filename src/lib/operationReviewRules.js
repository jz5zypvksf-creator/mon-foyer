export const OPERATION_REVIEW_STATUSES = Object.freeze({
  UNREVIEWED: 'unreviewed',
  VERIFIED: 'verified',
  DISPUTED: 'disputed',
  RESOLVED: 'resolved',
});

export function normalizeReviewStatus(value) {
  return Object.values(OPERATION_REVIEW_STATUSES).includes(value)
    ? value
    : OPERATION_REVIEW_STATUSES.UNREVIEWED;
}

export function reviewReasonsForOperation(operation, detectedReasons = []) {
  const status = normalizeReviewStatus(operation?.reviewStatus || operation?.review_status);
  if (status === OPERATION_REVIEW_STATUSES.VERIFIED || status === OPERATION_REVIEW_STATUSES.RESOLVED) return [];
  if (status === OPERATION_REVIEW_STATUSES.DISPUTED) return ['paiement contesté auprès de la banque'];
  return detectedReasons;
}

export function reviewStatusLabel(value) {
  const status = normalizeReviewStatus(value);
  if (status === OPERATION_REVIEW_STATUSES.VERIFIED) return 'Vérifié';
  if (status === OPERATION_REVIEW_STATUSES.DISPUTED) return 'Contesté';
  if (status === OPERATION_REVIEW_STATUSES.RESOLVED) return 'Résolu / remboursé';
  return 'À vérifier';
}

