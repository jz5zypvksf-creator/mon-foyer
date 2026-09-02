import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMessages, messageCursor } from '../api/messagingRepository.js';

const RETRY_DELAYS = [1000, 2000, 5000, 10000, 20000];
const TOKEN_REFRESH_MARGIN_MS = 60_000;

function retryDelay(attempt) {
  return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
}

export default function useRealtimeMessages({
  supabase,
  userId,
  peerId,
  onMessages,
  enabled = true,
}) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const channelRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const tokenTimerRef = useRef(null);
  const attemptRef = useRef(0);
  const cursorRef = useRef(null);
  const mountedRef = useRef(false);
  const connectRef = useRef(null);

  const deliverMissedMessages = useCallback(async () => {
    if (!supabase || !userId || !peerId) return [];
    const messages = await fetchMessages(supabase, {
      userId,
      peerId,
      after: cursorRef.current,
    });
    if (messages.length > 0) {
      cursorRef.current = messageCursor(messages[messages.length - 1]);
      onMessages?.(messages);
    }
    return messages;
  }, [onMessages, peerId, supabase, userId]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    if (tokenTimerRef.current) window.clearTimeout(tokenTimerRef.current);
    reconnectTimerRef.current = null;
    tokenTimerRef.current = null;
  }, []);

  const refreshRealtimeToken = useCallback(async () => {
    if (!supabase) return;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    let session = sessionData.session;
    const expiresAtMs = Number(session?.expires_at || 0) * 1000;

    if (session && expiresAtMs - Date.now() <= TOKEN_REFRESH_MARGIN_MS) {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      session = data.session;
    }

    if (!session?.access_token) throw new Error('Session de messagerie expirée.');
    supabase.realtime.setAuth(session.access_token);

    const nextRefreshMs = Math.max(
      30_000,
      (Number(session.expires_at || 0) * 1000) - Date.now() - TOKEN_REFRESH_MARGIN_MS,
    );
    if (tokenTimerRef.current) window.clearTimeout(tokenTimerRef.current);
    tokenTimerRef.current = window.setTimeout(() => {
      refreshRealtimeToken().catch((refreshError) => {
        if (mountedRef.current) setError(refreshError);
        connectRef.current?.();
      });
    }, nextRefreshMs);
  }, [supabase]);

  const disconnect = useCallback(async () => {
    clearTimers();
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel && supabase) await supabase.removeChannel(channel);
  }, [clearTimers, supabase]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !supabase || !userId || !peerId) {
      setStatus('idle');
      return () => { mountedRef.current = false; };
    }

    const scheduleReconnect = () => {
      if (!mountedRef.current || !navigator.onLine || reconnectTimerRef.current) return;
      const delay = retryDelay(attemptRef.current);
      attemptRef.current += 1;
      setStatus('reconnecting');
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connectRef.current?.();
      }, delay);
    };

    const connect = async () => {
      if (!mountedRef.current || !navigator.onLine) {
        setStatus('offline');
        return;
      }

      try {
        setStatus('connecting');
        setError(null);
        if (channelRef.current) await supabase.removeChannel(channelRef.current);
        await refreshRealtimeToken();

        const channel = supabase.channel(`user:${userId}:messages`, {
          config: { private: true },
        });
        channelRef.current = channel;
        channel
          .on('broadcast', { event: 'message_created' }, () => {
            deliverMissedMessages().catch((deliveryError) => setError(deliveryError));
          })
          .subscribe((nextStatus, subscribeError) => {
            if (!mountedRef.current) return;
            if (nextStatus === 'SUBSCRIBED') {
              attemptRef.current = 0;
              setStatus('connected');
              deliverMissedMessages().catch((deliveryError) => setError(deliveryError));
              return;
            }
            if (subscribeError) setError(subscribeError);
            if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT' || nextStatus === 'CLOSED') {
              scheduleReconnect();
            }
          });
      } catch (connectError) {
        if (mountedRef.current) setError(connectError);
        scheduleReconnect();
      }
    };
    connectRef.current = connect;

    const handleOnline = () => {
      attemptRef.current = 0;
      connect();
    };
    const handleOffline = () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      setStatus('offline');
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') connect();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    connect();

    return () => {
      mountedRef.current = false;
      connectRef.current = null;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      disconnect();
    };
  }, [deliverMissedMessages, disconnect, enabled, peerId, refreshRealtimeToken, supabase, userId]);

  return {
    status,
    error,
    reconnect: () => connectRef.current?.(),
    setCursor: (message) => { cursorRef.current = messageCursor(message); },
  };
}
