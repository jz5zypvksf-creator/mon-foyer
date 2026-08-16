import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Hotel, MapPin, Pencil, Plane, ReceiptText, Save, Utensils, X } from 'lucide-react';
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

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function money(value) {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function currentMonth() {
  return today().slice(0, 7);
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
  const [editingId, setEditingId] = useState(null);
  const [manualBalance, setManualBalance] = useState(String(goal?.saved ?? 0));
  const [status, setStatus] = useState('');
  const [historyMode, setHistoryMode] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentMonth().slice(0, 4));

  const balance = Number(goal?.saved || 0);
  const selectedMonthEntries = useMemo(
    () => entries.filter((row) => String(row.date || '').startsWith(selectedMonth)),
    [entries, selectedMonth],
  );
  const selectedYearEntries = useMemo(
    () => entries.filter((row) => String(row.date || '').startsWith(selectedYear)),
    [entries, selectedYear],
  );
  const monthlySpent = useMemo(
    () => selectedMonthEntries.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [selectedMonthEntries],
  );
  const annualSpent = useMemo(
    () => selectedYearEntries.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [selectedYearEntries],
  );
  const annualMonths = useMemo(() => MONTH_NAMES.map((label, index) => {
    const key = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
    const rows = entries.filter((row) => String(row.date || '').startsWith(key));
    return {
      key,
      label,
      count: rows.length,
      total: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  }), [entries, selectedYear]);
  const visibleEntries = historyMode === 'month' ? selectedMonthEntries : selectedYearEntries;
  const sortedEntries = useMemo(
    () => [...visibleEntries].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [visibleEntries],
  );

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

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(makeDraft());
    setStatus('');
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setDraft({
      date: row.date,
      amount: String(Number(row.amount || 0).toFixed(2)).replace('.', ','),
      vendor: row.vendor || '',
      place: row.place || '',
      category: row.category || 'restaurant',
      note: row.note || '',
    });
    setStatus('Modification en cours : corrige les informations puis enregistre.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitExpense = async (event) => {
    event.preventDefault();
    const amount = Number(String(draft.amount).replace(',', '.'));
    if (!amount || amount <= 0 || !draft.vendor.trim() || !draft.place.trim() || !draft.date) {
      setStatus('Indique la date, le montant, le vendeur et le lieu.');
      return;
    }

    const existing = editingId ? entries.find((row) => row.id === editingId) : null;
    const previousAmount = Number(existing?.amount || 0);
    const availableForEdit = balance + previousAmount;
    if (amount > availableForEdit) {
      setStatus(`Cette dépense dépasse le solde disponible après correction (${money(availableForEdit)}).`);
      return;
    }

    if (existing) {
      const nextBalance = balance + previousAmount - amount;
      const next = entries.map((row) => row.id === editingId ? {
        ...row,
        ...draft,
        vendor: draft.vendor.trim(),
        place: draft.place.trim(),
        note: draft.note.trim(),
        amount,
        updatedAt: new Date().toISOString(),
        balanceAfter: nextBalance,
      } : row);
      persistEntries(next);
      await updateBalance(nextBalance);
      setManualBalance(String(nextBalance.toFixed(2)).replace('.', ','));
      setEditingId(null);
      setDraft(makeDraft());
      setStatus('Dépense modifiée. Le solde Beobank et Épargne Vacances/Loisirs ont été recalculés.');
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
    setSelectedMonth(row.date.slice(0, 7));
    setSelectedYear(row.date.slice(0, 4));
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
    if (editingId === row.id) cancelEdit();
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
          <div><span>Dépenses du mois</span><strong>{money(monthlySpent)}</strong><small>{selectedMonth}</small></div>
          <div><span>Nombre de dépenses</span><strong>{selectedMonthEntries.length}</strong><small>ce mois</small></div>
        </section>
      </div>

      <form className="panel leisure-form" onSubmit={submitExpense}>
        <div className="section-title">
          <h2>{editingId ? 'Modifier une dépense loisirs' : 'Ajouter une dépense loisirs'}</h2>
          {editingId && <button type="button" className="leisure-cancel-edit" onClick={cancelEdit}><X size={16} /> Annuler</button>}
        </div>
        <div className="leisure-form-grid">
          <label>Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          <label>Montant<input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0,00" /></label>
          <label>Vendeur / prestataire<input value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} placeholder="Ex. TUI, restaurant, hôtel" /></label>
          <label>Lieu<input value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} placeholder="Ex. Antalya, Liège" /></label>
          <label>Catégorie<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="leisure-note">Note<input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Ex. dîner anniversaire, acompte voyage…" /></label>
        </div>
        <button className="primary-button" type="submit">{editingId ? '✓ Enregistrer les modifications' : '+ Enregistrer la dépense'}</button>
        {status && <p className="hint">{status}</p>}
      </form>

      <section className="panel leisure-history">
        <div className="section-title leisure-history-title">
          <div><h2>Historique Loisirs/Vacances</h2><span>{sortedEntries.length} ligne(s)</span></div>
          <div className="leisure-history-tabs">
            <button type="button" className={historyMode === 'month' ? 'active' : ''} onClick={() => setHistoryMode('month')}>Mois</button>
            <button type="button" className={historyMode === 'year' ? 'active' : ''} onClick={() => setHistoryMode('year')}>Année</button>
          </div>
        </div>

        {historyMode === 'month' ? (
          <div className="leisure-period-summary">
            <label>Mois<input type="month" value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setSelectedYear(e.target.value.slice(0, 4)); }} /></label>
            <div><span>Total du mois</span><strong>{money(monthlySpent)}</strong></div>
            <div><span>Dépenses</span><strong>{selectedMonthEntries.length}</strong></div>
          </div>
        ) : (
          <>
            <div className="leisure-period-summary leisure-year-summary">
              <label>Année<input type="number" min="2000" max="2100" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value.slice(0, 4))} /></label>
              <div><span>Total annuel</span><strong>{money(annualSpent)}</strong></div>
              <div><span>Dépenses</span><strong>{selectedYearEntries.length}</strong></div>
            </div>
            <div className="leisure-month-grid">
              {annualMonths.map((month) => (
                <button type="button" key={month.key} className={month.total > 0 ? 'has-spend' : ''} onClick={() => { setSelectedMonth(month.key); setHistoryMode('month'); }}>
                  <span>{month.label}</span>
                  <strong>{money(month.total)}</strong>
                  <small>{month.count} dépense{month.count === 1 ? '' : 's'}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {sortedEntries.length === 0 && <p className="empty-state">Aucune dépense loisirs enregistrée pour cette période.</p>}
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
              <div className="leisure-history-amount">
                <strong>-{money(row.amount)}</strong>
                <div className="leisure-row-actions">
                  <button type="button" className="edit" onClick={() => startEdit(row)}><Pencil size={15} /> Modifier</button>
                  <button type="button" className="delete" onClick={() => removeEntry(row)}>Supprimer</button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}
