import { householdId, isSupabaseConfigured, supabase } from '../infrastructure/supabase/supabaseClient.js';

export const VAPID_PUBLIC_KEY = 'BIpAhkVcn54rJHbk3zyUqNYGLgzaHy84d_vX36-6V6CkEtDtGgrmuR2GQ3jB0OF2kp4Xdr0TXiQtkKksghVP8aQ';

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function subscriptionKeys(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || '',
    auth: json.keys?.auth || '',
  };
}

export function pushSupported() {
  return Boolean(
    'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window,
  );
}

export async function currentUserId() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
}

export async function ensurePushSubscription(userId) {
  if (!pushSupported() || Notification.permission !== 'granted') return null;
  if (!userId || !householdId || !supabase) return null;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const keys = subscriptionKeys(subscription);
  if (!keys.endpoint || !keys.p256dh || !keys.auth) {
    throw new Error('Abonnement push incomplet.');
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    household_id: householdId,
    user_id: userId,
    endpoint: keys.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' });

  if (error) throw error;
  return subscription;
}

export async function syncReminderPreferences({
  userId,
  settings,
  lastBackupAt,
  lastCsvImportAt,
}) {
  if (!userId || !householdId || !supabase) return;
  const { error } = await supabase.from('reminder_preferences').upsert({
    household_id: householdId,
    user_id: userId,
    backup_enabled: Boolean(settings.backupEnabled),
    backup_every_days: Number(settings.backupEveryDays || 7),
    csv_enabled: Boolean(settings.csvEnabled),
    csv_every_days: Number(settings.csvEveryDays || 7),
    last_backup_at: lastBackupAt || null,
    last_csv_import_at: lastCsvImportAt || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'household_id,user_id' });
  if (error) throw error;
}
