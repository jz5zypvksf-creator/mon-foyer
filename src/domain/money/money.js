/**
 * Convertit une saisie monétaire humaine en nombre.
 * Accepte notamment les espaces ordinaires/insécables, EUR, €, la virgule
 * décimale belge et le point décimal. Une valeur invalide retourne NaN afin
 * que les formulaires puissent la refuser explicitement.
 */
export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === 'bigint') return Number(value);
  if (value == null) return Number.NaN;

  let normalized = String(value)
    .trim()
    .replace(/\((.*)\)/, '-$1')
    .replace(/(?:EUR|€)/gi, '')
    .replace(/[\s\u00a0\u202f']/g, '');

  if (!normalized) return Number.NaN;

  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? /\./g : /,/g;
    normalized = normalized.replace(thousandsSeparator, '');
    if (decimalSeparator === ',') normalized = normalized.replace(',', '.');
  } else if (commaIndex >= 0) {
    normalized = normalized.replace(/,/g, '.');
  }

  const decimalPoints = normalized.match(/\./g)?.length || 0;
  if (decimalPoints > 1) {
    const lastPoint = normalized.lastIndexOf('.');
    normalized = `${normalized.slice(0, lastPoint).replace(/\./g, '')}${normalized.slice(lastPoint)}`;
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return Number.NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Formate toujours un montant EUR avec exactement deux décimales. */
export function formatMoney(value) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}
