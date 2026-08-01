import { useEffect, useMemo, useState } from 'react';
import { Landmark, X } from 'lucide-react';
import App from './App.jsx';
import { householdId, isSupabaseConfigured, supabase } from './lib/supabase';
import './reconciliation.css';

const STORAGE_KEY = 'mon-foyer-v1';
const BELFIUS = 'Compte Belfius';

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAmount(value) {
  return Number(String(value).replace(',', '.').trim());
}

function formatCurrency(value) {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value) || 0);
}

function paymentMethodOf(operation) {
  return operation.payment_method || operation.paymentMethod || BELFIUS;
}

function calculateBelfiusBalance(operations, cutoff) {
  return operations
    .filter((operation) => operation.date <= cutoff && paymentMethodOf(operation) === BELFIUS)
    .reduce((balance, operation) => {
      const amount = Number(operation.amount) || 0;
      return balance + (operation.type === 'income' ? amount : -amount);
    }, 0);
}

function readLocalState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function addLocalAdjustment(operation) {
  const state = readLocalState();
  const operations = Array.isArray(state.operations) ? state.operations : [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...state,
    operations: [operation, ...operations],
  }));
}

export default function AppWithReconciliation() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [realBalance, setRealBalance] = useState('');
  const [comment, setComment] = useState('Rapprochement avec Belfius');
  const [calculatedBalance, setCalculatedBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [canReconcile, setCanReconcile] = useState(!isSupabaseConfigured);

  const difference = useMemo(() => {
    const real = parseAmount(realBalance);
    return Number.isFinite(real) ? real - calculatedBalance : 0;
  }, [calculatedBalance, realBalance]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setCanReconcile(Boolean(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCanReconcile(Boolean(session));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    async function loadBalance() {
      setLoading(true);
      setStatus('');

      if (isSupabaseConfigured && supabase && householdId) {
        const { data, error } = await supabase
          .from('operations')
          .select('date, type, amount, payment_method')
          .eq('household_id', householdId)
          .lte('date', date);

        if (!cancelled) {
          if (error) {
            setStatus(`Impossible de calculer le solde : ${error.message}`);
          } else {
            setCalculatedBalance(calculateBelfiusBalance(data || [], date));
          }
        }
      } else if (!cancelled) {
        const state = readLocalState();
        setCalculatedBalance(calculateBelfiusBalance(state.operations || [], date));
      }

      if (!cancelled) setLoading(false);
    }

    loadBalance();
    return () => { cancelled = true; };
  }, [date, open]);

  async function saveAdjustment(event) {
    event.preventDefault();
    const real = parseAmount(realBalance);

    if (!Number.isFinite(real)) {
      setStatus('Indique le solde réel affiché dans Belfius.');
      return;
    }

    if (Math.abs(difference) < 0.005) {
      setStatus('Le solde Mon Foyer correspond déjà au solde Belfius.');
      return;
    }

    setLoading(true);
    setStatus('');

    const operation = {
      id: crypto.randomUUID(),
      date,
      person: 'Foyer',
      type: difference > 0 ? 'income' : 'variable',
      category: difference > 0 ? 'revenus' : 'divers',
      store: '',
      paymentMethod: BELFIUS,
      label: `Ajustement Belfius${comment.trim() ? ` — ${comment.trim()}` : ''}`,
      amount: Math.abs(difference),
    };

    if (isSupabaseConfigured && supabase && householdId) {
      const { error } = await supabase.from('operations').insert({
        household_id: householdId,
        date: operation.date,
        person: operation.person,
        type: operation.type,
        category: operation.category,
        store: null,
        label: operation.label,
        amount: operation.amount,
        payment_method: operation.paymentMethod,
      });

      if (error) {
        setLoading(false);
        setStatus(`Ajustement non enregistré : ${error.message}`);
        return;
      }
    } else {
      addLocalAdjustment(operation);
    }

    localStorage.setItem('mon-foyer-last-reconciliation', JSON.stringify({
      date,
      realBalance: real,
      difference,
      recordedAt: new Date().toISOString(),
    }));

    setStatus('Solde Belfius rapproché. Actualisation…');
    window.setTimeout(() => window.location.reload(), 500);
  }

  return (
    <>
      <App />

      {canReconcile && (
        <button
          type="button"
          className="reconciliation-fab"
          onClick={() => setOpen(true)}
          aria-label="Rapprocher le solde Belfius"
        >
          <Landmark size={21} />
          <span>Rapprocher Belfius</span>
        </button>
      )}

      {open && (
        <div className="reconciliation-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="reconciliation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reconciliation-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="reconciliation-kicker">Rapprochement bancaire</p>
                <h2 id="reconciliation-title">Aligner Mon Foyer sur Belfius</h2>
              </div>
              <button type="button" className="reconciliation-close" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>

            <div className="reconciliation-summary">
              <div>
                <span>Solde calculé</span>
                <strong>{loading ? 'Calcul…' : formatCurrency(calculatedBalance)}</strong>
              </div>
              <div>
                <span>Écart à enregistrer</span>
                <strong className={difference < 0 ? 'negative' : ''}>{formatCurrency(difference)}</strong>
              </div>
            </div>

            <form onSubmit={saveAdjustment}>
              <label>
                Solde réel Belfius
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={realBalance}
                  onChange={(event) => setRealBalance(event.target.value)}
                  autoFocus
                />
              </label>

              <label>
                Date du solde
                <input type="date" value={date} max={todayIso()} onChange={(event) => setDate(event.target.value)} />
              </label>

              <label>
                Commentaire
                <input type="text" value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>

              <p className="reconciliation-help">
                L’écart sera conservé dans l’historique comme une opération « Ajustement Belfius ».
              </p>

              {status && <p className="reconciliation-status">{status}</p>}

              <div className="reconciliation-actions">
                <button type="button" className="secondary" onClick={() => setOpen(false)}>Annuler</button>
                <button type="submit" disabled={loading}>
                  {loading ? 'Enregistrement…' : 'Valider le rapprochement'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
