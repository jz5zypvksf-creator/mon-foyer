export const BACKUP_FORMAT = 'mon-foyer-backup';
export const BACKUP_VERSION = 1;

export const BACKUP_TABLES = [
  { name: 'categories', label: 'Types de frais', onConflict: 'household_id,category_id' },
  { name: 'stores', label: 'Points de vente', onConflict: 'id' },
  { name: 'savings_goals', label: 'Objectifs d’épargne', onConflict: 'id' },
  { name: 'recurring_fixed_expenses', label: 'Frais fixes récurrents', onConflict: 'id' },
  { name: 'operations', label: 'Opérations', onConflict: 'id' },
  { name: 'leisure_expenses', label: 'Dépenses Loisirs', onConflict: 'id' },
  { name: 'messages', label: 'Messages', onConflict: 'id' },
  { name: 'bank_snapshots', label: 'Dernier audit Belfius', onConflict: 'household_id' },
];

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createBackupEnvelope(payload) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    checksum: await sha256(JSON.stringify(payload)),
    payload,
  };
}

export function backupCounts(tables = {}) {
  return Object.fromEntries(
    BACKUP_TABLES.map(({ name }) => [name, Array.isArray(tables[name]) ? tables[name].length : 0]),
  );
}

export function rowsForCurrentHousehold(rows, currentHouseholdId) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    household_id: currentHouseholdId,
  }));
}

export async function parseBackup(text, currentHouseholdId) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error('Le fichier sélectionné n’est pas un fichier JSON valide.');
  }

  if (envelope?.format !== BACKUP_FORMAT || envelope?.version !== BACKUP_VERSION) {
    throw new Error('Ce fichier n’est pas une sauvegarde Mon Foyer compatible.');
  }
  if (!envelope.payload || envelope.payload.householdId !== currentHouseholdId) {
    throw new Error('Cette sauvegarde appartient à un autre foyer.');
  }
  for (const { name } of BACKUP_TABLES) {
    if (!Array.isArray(envelope.payload.tables?.[name])) {
      throw new Error('Sauvegarde incomplète : ' + name + ' est absent.');
    }
  }

  const actualChecksum = await sha256(JSON.stringify(envelope.payload));
  if (actualChecksum !== envelope.checksum) {
    throw new Error('Le fichier a été modifié ou endommagé depuis sa création.');
  }

  return {
    ...envelope,
    counts: backupCounts(envelope.payload.tables),
  };
}
