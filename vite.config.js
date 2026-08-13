import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// RC2.4.5 — correctif ciblé du moteur d'audit.
// Une empreinte Belfius enregistrée sur un frais récurrent est une identité bancaire
// permanente : elle doit primer sur le jour théorique du prélèvement et sur la date
// générée dans Mon Foyer. Les banques peuvent comptabiliser une domiciliation plusieurs
// jours avant/après le jour habituel sans changer l'identité du contrat.
function belfiusPersistentFingerprintFix() {
  return {
    name: 'mon-foyer-belfius-persistent-fingerprint-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/BelfiusAudit.jsx') && !id.endsWith('\\src\\BelfiusAudit.jsx')) return null;

      const oldCandidates = `  const candidates = (recurringExpenses || []).filter((expense) => {
    const recurringAmount = Math.abs(Number(expense.amount) || 0);
    const recurringDay = Number(expense.day) || 1;
    return recurringBelongsToAppRow(expense, appRow)
      && Math.abs(recurringAmount - operationAmount) <= AMOUNT_TOLERANCE
      && Math.abs(recurringDay - day) <= DATE_TOLERANCE_DAYS;
  });`;

      const newCandidates = `  const amountAndIdentityCandidates = (recurringExpenses || []).filter((expense) => {
    const recurringAmount = Math.abs(Number(expense.amount) || 0);
    return recurringBelongsToAppRow(expense, appRow)
      && Math.abs(recurringAmount - operationAmount) <= AMOUNT_TOLERANCE;
  });
  // L'empreinte bancaire prime sur le jour habituel : elle reste valable d'un CSV à l'autre.
  const candidates = amountAndIdentityCandidates.filter((expense) => {
    const recurringDay = Number(expense.day) || 1;
    return Math.abs(recurringDay - day) <= DATE_TOLERANCE_DAYS;
  });`;

      const oldCommunication = `  if (bankCommunication) {
    const exactCommunication = candidates.find((expense) => recurringCommunication(expense) === bankCommunication);
    if (exactCommunication) return { ...exactCommunication, __communicationMatch: true };
  }
  const freeCommunication = candidates.find((expense) => recurringFreeCommunicationMatch(bankRow, expense));`;

      const newCommunication = `  if (bankCommunication) {
    const exactCommunication = amountAndIdentityCandidates.find((expense) => {
      const expected = recurringCommunication(expense);
      return expected && (bankCommunication.includes(expected) || expected.includes(bankCommunication));
    });
    if (exactCommunication) return { ...exactCommunication, __communicationMatch: true };
  }
  const freeCommunication = amountAndIdentityCandidates.find((expense) => recurringFreeCommunicationMatch(bankRow, expense));`;

      const oldGate = `  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income');
  if (!directionMatches || amountDelta > AMOUNT_TOLERANCE || dayDelta > DATE_TOLERANCE_DAYS) return null;

  const directLabel = labelsLikelyMatch(bankRow, appRow);
  const alias = aliasMatch(bankRow, appRow);
  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);`;

      const newGate = `  const directionMatches = (bankRow.amount > 0) === (appRow.type === 'income');
  if (!directionMatches || amountDelta > AMOUNT_TOLERANCE) return null;

  // Chercher d'abord l'identité bancaire persistante. Une empreinte exacte autorise
  // un écart de date supérieur à la tolérance habituelle.
  const recurring = findRecurringMatch(bankRow, appRow, recurringExpenses);
  if (recurring && recurring.__freeCommunicationMatch) {
    return {
      auto: true,
      confidence: 100,
      reason: \`Communication libre Belfius reconnue + frais récurrent : \${recurring.label}\`,
      recurring,
    };
  }
  if (recurring && recurring.__communicationMatch) {
    return {
      auto: true,
      confidence: 100,
      reason: \`Communication structurée Belfius + frais récurrent : \${recurring.label}\`,
      recurring,
    };
  }
  if (dayDelta > DATE_TOLERANCE_DAYS) return null;

  const directLabel = labelsLikelyMatch(bankRow, appRow);
  const alias = aliasMatch(bankRow, appRow);`;

      let patched = code
        .replace(oldCandidates, newCandidates)
        .replace(oldCommunication, newCommunication)
        .replace(oldGate, newGate);

      // Les deux blocs suivants existent encore dans la source originale. Ils deviennent
      // inaccessibles pour les empreintes fortes (retour ci-dessus) mais restent nécessaires
      // aux correspondances récurrentes classiques dans la fenêtre de date.
      if (patched === code) {
        throw new Error('RC2.4.5: le moteur Belfius a changé; correctif non appliqué pour éviter un build trompeur.');
      }
      return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [belfiusPersistentFingerprintFix(), react()],
});
