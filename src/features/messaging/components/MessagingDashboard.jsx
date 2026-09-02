import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { formatMoney, parseMoney } from '../../../domain/money/money.js';
import { fetchMessages, insertMessage, markMessagesAsRead } from '../api/messagingRepository.js';
import useRealtimeMessages from '../hooks/useRealtimeMessages.js';
import './MessagingDashboard.css';

const MAX_MESSAGE_LENGTH = 4000;
const EURO_MENTION = /€\s*(-?[\d\s.]+(?:,\d{1,2})?)|(-?[\d\s.]+(?:[,.]\d{1,2})?)\s*€/g;

function normalizeEuroMentions(content) {
  return String(content || '').replace(EURO_MENTION, (match, prefixed, suffixed) => {
    const amount = parseMoney(prefixed || suffixed);
    return Number.isFinite(amount) ? formatMoney(amount) : match;
  });
}

function mergeChronologically(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((left, right) => {
    const dateOrder = String(left.created_at).localeCompare(String(right.created_at));
    return dateOrder || String(left.id).localeCompare(String(right.id));
  });
}

function messageTime(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

export default function MessagingDashboard({
  supabase,
  currentUserId,
  currentUserName,
  peerId,
  peerName,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const inputRef = useRef(null);
  const historyRef = useRef(null);

  const handleRealtimeMessages = useCallback((incoming) => {
    setMessages((current) => mergeChronologically(current, incoming));
  }, []);

  const realtime = useRealtimeMessages({
    supabase,
    userId: currentUserId,
    peerId,
    onMessages: handleRealtimeMessages,
    enabled: Boolean(supabase && currentUserId && peerId),
  });

  useEffect(() => {
    if (!supabase || !currentUserId || !peerId) return undefined;
    let active = true;
    setNotice('');

    fetchMessages(supabase, { userId: currentUserId, peerId })
      .then((rows) => {
        if (!active) return;
        setMessages((current) => mergeChronologically(current, rows));
        if (rows.length > 0) realtime.setCursor(rows[rows.length - 1]);
      })
      .catch(() => {
        if (active) setNotice("L'historique sera rechargé dès le retour de la connexion.");
      });

    return () => { active = false; };
  }, [currentUserId, peerId, supabase]);

  useEffect(() => {
    if (!supabase || !currentUserId || !peerId || messages.length === 0) return;
    const hasUnread = messages.some((message) => (
      message.recipient_id === currentUserId
      && message.sender_id === peerId
      && !message.is_read
    ));
    if (!hasUnread) return;

    markMessagesAsRead(supabase, { userId: currentUserId, peerId })
      .then((updated) => {
        const updatedIds = new Set(updated.map((message) => message.id));
        setMessages((current) => current.map((message) => (
          updatedIds.has(message.id) ? { ...message, is_read: true } : message
        )));
      })
      .catch(() => {});
  }, [currentUserId, messages, peerId, supabase]);

  useEffect(() => {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [messages.length]);

  const connection = !navigator.onLine || realtime.status === 'offline' || realtime.error
    ? { label: 'Hors ligne', className: 'offline' }
    : realtime.status === 'connected'
      ? { label: 'Temps réel actif', className: 'online' }
      : { label: 'Connexion…', className: 'connecting' };

  const send = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || !supabase || !currentUserId || !peerId) return;

    setSending(true);
    setNotice('');
    try {
      const message = await insertMessage(supabase, {
        senderId: currentUserId,
        recipientId: peerId,
        content,
      });
      setMessages((current) => mergeChronologically(current, [message]));
      realtime.setCursor(message);
      setDraft('');
      window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.setSelectionRange(0, 0);
      });
    } catch {
      setNotice("Le message n'a pas été envoyé. Votre texte est conservé.");
    } finally {
      setSending(false);
    }
  };

  if (!peerId) {
    return (
      <section className="messaging-dashboard messaging-setup" aria-labelledby="messaging-title">
        <h2 id="messaging-title">Messages du foyer</h2>
        <p>La messagerie est prête. Les identifiants Supabase d’Alain et Esther doivent encore être associés à l’application.</p>
      </section>
    );
  }

  return (
    <section className="messaging-dashboard" aria-labelledby="messaging-title">
      <header className="messaging-header">
        <div>
          <p className="messaging-kicker">Conversation privée</p>
          <h2 id="messaging-title">{peerName}</h2>
        </div>
        <span className={`messaging-connection ${connection.className}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {connection.label}
        </span>
      </header>

      <div className="messaging-history" ref={historyRef} aria-live="polite" aria-label={`Conversation avec ${peerName}`}>
        {messages.length === 0 && (
          <div className="messaging-empty">
            <strong>Commencez la conversation</strong>
            <span>Les messages échangés entre Alain et Esther apparaîtront ici.</span>
          </div>
        )}

        {messages.map((message) => {
          const mine = message.sender_id === currentUserId;
          return (
            <article className={mine ? 'messaging-bubble mine' : 'messaging-bubble'} key={message.id}>
              <span className="messaging-author">{mine ? currentUserName : peerName}</span>
              <p>{normalizeEuroMentions(message.content)}</p>
              <time dateTime={message.created_at}>{messageTime(message.created_at)}</time>
            </article>
          );
        })}
      </div>

      <footer className="messaging-composer">
        {notice && <p className="messaging-notice" role="alert">{notice}</p>}
        <form onSubmit={send}>
          <label className="sr-only" htmlFor="messaging-draft">Écrire un message</label>
          <textarea
            id="messaging-draft"
            ref={inputRef}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            rows="1"
            enterKeyHint="send"
            placeholder="Écrire un message…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Envoyer le message">
            <Send size={20} />
          </button>
        </form>
        <span className="messaging-count">{draft.length.toLocaleString('fr-BE')} / 4 000</span>
      </footer>
    </section>
  );
}
