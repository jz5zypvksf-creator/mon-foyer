import { isMastercardPaymentMethod } from './cardPaymentRules.js';

export function sortedBeneficiaryOptions(values = []) {
  const unique = new Map();
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => {
      const key = value.toLocaleLowerCase('fr-BE');
      if (!unique.has(key)) unique.set(key, value);
    });

  return [...unique.values()]
    .sort((left, right) => left.localeCompare(right, 'fr-BE', { sensitivity: 'base' }));
}

export function recurringRecognitionPresentation(paymentMethod) {
  if (isMastercardPaymentMethod(paymentMethod)) {
    return {
      legend: 'Identification Mastercard (facultatif)',
      fieldLabel: 'Libellé apparaissant sur le relevé Mastercard',
      placeholder: 'Ex. APPLE.COM/BILL, PAYPAL SMARTWORKOUT…',
      containsLabel: 'Le libellé Mastercard contient ce texte',
      exactLabel: 'Le libellé Mastercard correspond exactement',
      hint: "L’achat est enregistré au mois de l’abonnement et affecte le budget du mois du prélèvement Belfius suivant.",
    };
  }

  return {
    legend: 'Identification Belfius (facultatif)',
    fieldLabel: 'Communication libre / motif Belfius',
    placeholder: 'Ex. Pension, Pour voiture, POL. DROIT COM…',
    containsLabel: 'La communication Belfius contient ce texte',
    exactLabel: 'La communication Belfius correspond exactement',
    hint: 'Ces informations servent au rapprochement avec les mouvements Belfius.',
  };
}

export function recurringStructuredCommunication(paymentMethod, value) {
  return isMastercardPaymentMethod(paymentMethod) ? '' : String(value || '').trim();
}
