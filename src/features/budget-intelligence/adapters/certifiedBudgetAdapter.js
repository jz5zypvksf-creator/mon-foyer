function immutableArray(value) {
  return Object.freeze(Array.isArray(value) ? value.map((item) => Object.freeze({ ...item })) : []);
}

/**
 * Construit un contrat de lecture pour l'interface d'intelligence budgétaire.
 * Aucun montant n'est recalculé et aucune opération brute n'entre dans ce module.
 */
export function adaptCertifiedBudgetInputs({ monthlyAudit, budgetAnalysis, anomalySummary } = {}) {
  const analysis = budgetAnalysis || {};
  const audit = monthlyAudit
    ? Object.freeze({ ...monthlyAudit, anomalies: immutableArray(monthlyAudit.anomalies) })
    : null;

  return Object.freeze({
    monthlyAudit: audit,
    budgetAnalysis: Object.freeze({
      ...analysis,
      current: Object.freeze({ ...(analysis.current || {}) }),
      status: Object.freeze({ ...(analysis.status || {}) }),
      history: immutableArray(analysis.history),
      trend: analysis.trend ? Object.freeze({ ...analysis.trend }) : null,
      emergency: Object.freeze({ ...(analysis.emergency || {}) }),
    }),
    anomalySummary: Object.freeze({
      total: Number(anomalySummary?.total || 0),
      items: immutableArray(anomalySummary?.items),
    }),
  });
}
