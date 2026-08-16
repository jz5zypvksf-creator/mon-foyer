import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Hotel, MapPin, Plane, ReceiptText, Save, Utensils } from 'lucide-react';
import BeobankStatementImport from './BeobankStatementImport.jsx';
import './LeisureVacations.css';

const STORAGE_KEY = 'mon-foyer-leisure-v1';
const CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant', icon: Utensils },
  { value: 'hotel', label: 'Hôtel', icon: Hotel },
  { value: 'flight', label: 'Voyage en avion', icon: Plane },
  { value: 'package', label: 'Avion + hôtel', icon: Plane },
  { value: 'other-expense', label: 'Autre type de dépense', icon: ReceiptText },
  { value: 'other', label: 'Autre loisir', icon: ReceiptText },
];

function money(value) {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function loadEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeDraft() {
  return { date: today(), amount: '', vendor: '', place: '', category: 'restaurant', note: '' };
}

export default function LeisureVacations({ goal, onUpdateGoal, onBack }) {
  const [entries, setEntries] = useState(loadEntries);
  const [draft, setDraft] = useState(makeDraft);
  const [manualBalance, setManualBalance] = useState(String(goal?.saved ?? 0));
  const [status, setStatus] = useState('');

  const balance = Number(goal?.saved || 0);
  const totalSpent = useMemo(() => entries.reduce((sum, row) => sum + Number(row.amount || 0), 0), [entries]);
  const sortedEntries = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [entries]);

  useEffect(() => {
    setManualBalance(String(Number(goal?.saved || 0).toFixed(2)).replace('.', ','));
  }, [goal?.id, goal?.saved]);

  const persistEntries = (next) => {
    setEntries(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const updateBalance = async (nextBalance) => {
    if (!goal) return;
    await onUpdateGoal(goal.id, 'saved', Math.max(0, Number(nextBalance) || 0));
  };

  const submitExpense = async (event) => {
    event.preventDefault();
    const amount = Number(String(draft.amount).replace(',', '.'));
    if (!amount || amount <= 0 || !draft.vendor.trim() || !draft.place.trim() || !draft.date) {
      setStatus('Indique la date, le montant, le vendeur et le lieu.');
      return;
    }
    if (amount > balance) {
      setStatus(`Cette dépense dépasse le solde disponible (${money(balance)}).`);
      return;
    }

    const row = {
      id: crypto.randomUUID(),
      ...draft,
      vendor: draft.vendor.trim(),
      place: draft.place.trim(),
      note: draft.note.trim(),
      amount,
      createdAt: new Date().toISOString(),
      balanceAfter: balance - amount,
    };
    persistEntries([row, ...entries]);
    await updateBalance(balance - amount);
    setManualBalance(String((balance - amount).toFixed(2)).replace('.', ','));
    setDraft(makeDraft());
    setStatus('Dépense enregistrée et solde Vacances/Loisirs mis à jour dans les deux écrans.');
  };

  const applyManualBalance = async () => {
    const value = Number(String(manualBalance).replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) {
      setStatus('Indique un solde Beobank valide.');
      return;
    }
    await updateBalance(value);
    setStatus('Solde Beobank mis à jour et synchronisé avec Épargne Vacances/Loisirs.');
  };

  const removeEntry = async (row) => {
    if (!window.confirm(`Supprimer la dépense « ${row.vendor} » ? Le montant sera recrédité.`)) return;
    persistEntries(entries.filter((item) => item.id !== row.id));
    await updateBalance(balance + Number(row.amount || 0));
    setManualBalance(String((balance + Number(row.amount || 0)).toFixed(2)).replace('.', ','));
    setStatus('Dépense supprimée et montant recrédité dans Vacances/Loisirs.');
  };

  return (
    <section className="view leisure-view">
      <div className="leisure-topline">
        <button type="button" className="leisure-back" onClick={onBack}><ArrowLeft size={18} /> Mon Foyer</button>
        <span>Loisirs / Vacances</span>
      </div>

      <section className="leisure-hero">
        <div>
          <span>Solde disponible Beobank</span>
          <strong>{money(balance)}</strong>
          <small>Synchronisé avec Épargne · Vacances/Loisirs</small>
        </div>
        <Plane size={42} />
      </section>

      <div className="leisure-grid">
        <section className="panel leisure-balance-card">
          <div className="section-title"><h2>Mettre le solde à jour</h2></div>
          <div className="leisure-balance-row">
            <input value={manualBalance} inputMode="decimal" onChange={(e) => setManualBalance(e.target.value)} aria-label="Solde Beobank" />
            <button type="button" className="secondary-button" onClick={applyManualBalance}><Save size={17} /> Actualiser</button>
          </div>
          <BeobankStatementImport currentBalance={balance} onApply={(nextBalance) => { setManualBalance(String(nextBalance).replace('.', ',')); updateBalance(nextBalance); setStatus('Solde Beobank importé et synchronisé.'); }} />
        </section>

        <section className="panel leisure-summary-card">
          <div><span>Dépenses enregistrées</span><strong>{money(totalSpent)}</strong></div>
          <div><span>Nombre de dépenses</span><strong>{entries.length}</strong></div>
        </section>
      </div>

      <form className="panel leisure-form" onSubmit={submitExpense}>
        <div className="section-title"><h2>Ajouter une dépense loisirs</h2></div>
        <div className="leisure-form-grid">
          <label>Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          <label>Montant<input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0,00" /></label>
          <label>Vendeur / prestataire<input value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} placeholder="Ex. TUI, restaurant, hôtel" /></label>
          <label>Lieu<input value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} placeholder="Ex. Antalya, Liège" /></label>
          <label>Catégorie<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="leisure-note">Note<input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Ex. dîner anniversaire, acompte voyage…" /></label>
        </div>
        <button className="primary-button" type="submit">+ Enregistrer la dépense</button>
        {status && <p className="hint">{status}</p>}
      </form>

      <section className="panel leisure-history">
        <div className="section-title"><h2>Historique Loisirs/Vacances</h2><span>{entries.length} ligne(s)</span></div>
        {sortedEntries.length === 0 && <p className="empty-state">Aucune dépense loisirs enregistrée.</p>}
        {sortedEntries.map((row) => {
          const category = CATEGORIES.find((item) => item.value === row.category) || CATEGORIES[CATEGORIES.length - 1];
          const Icon = category.icon;
          return (
            <article className="leisure-history-row" key={row.id}>
              <div className="leisure-history-icon"><Icon size={18} /></div>
              <div className="leisure-history-copy">
                <strong>{row.vendor}</strong>
                <span><CalendarDays size={13} /> {row.date} · <MapPin size={13} /> {row.place}</span>
                <span>{category.label}{row.note ? ` · ${row.note}` : ''}</span>
              </div>
              <div className="leisure-history-amount"><strong>-{money(row.amount)}</strong><button type="button" onClick={() => removeEntry(row)}>Supprimer</button></div>
            </article>
          );
        })}
      </section>
    </section>
  );
}
