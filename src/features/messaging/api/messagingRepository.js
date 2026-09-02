const MESSAGE_COLUMNS = 'id, sender_id, recipient_id, content, created_at, is_read';

function requireClient(client) {
  if (!client) throw new Error('Client Supabase de messagerie indisponible.');
}

function requireUuid(value, label) {
  if (!value || typeof value !== 'string') throw new Error(`${label} est requis.`);
}

function isAfterCursor(message, cursor) {
  if (!cursor?.createdAt) return true;
  if (message.created_at > cursor.createdAt) return true;
  return message.created_at === cursor.createdAt && message.id > (cursor.id || '');
}

export function messageCursor(message) {
  if (!message) return null;
  return { createdAt: message.created_at, id: message.id };
}

export async function fetchMessages(client, { userId, peerId, after = null, limit = 100 }) {
  requireClient(client);
  requireUuid(userId, 'Utilisateur');
  requireUuid(peerId, 'Correspondant');

  let query = client
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)));

  // Include equal timestamps, then remove the already-consumed row locally.
  // This prevents loss when two messages share the same PostgreSQL timestamp.
  if (after?.createdAt) query = query.gte('created_at', after.createdAt);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter((message) => isAfterCursor(message, after));
}

export async function insertMessage(client, { senderId, recipientId, content }) {
  requireClient(client);
  requireUuid(senderId, 'Expéditeur');
  requireUuid(recipientId, 'Destinataire');
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) throw new Error('Le message ne peut pas être vide.');
  if (normalizedContent.length > 4000) throw new Error('Le message dépasse 4 000 caractères.');

  const { data, error } = await client
    .from('messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, content: normalizedContent })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function markMessagesAsRead(client, { userId, peerId }) {
  requireClient(client);
  requireUuid(userId, 'Utilisateur');
  requireUuid(peerId, 'Correspondant');

  const { data, error } = await client
    .from('messages')
    .update({ is_read: true })
    .eq('recipient_id', userId)
    .eq('sender_id', peerId)
    .eq('is_read', false)
    .select('id');

  if (error) throw error;
  return data || [];
}
