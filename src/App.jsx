import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Beef,
  BusFront,
  CalendarDays,
  Car,
  CircleEllipsis,
  Edit3,
  Fuel,
  HeartPulse,
  Home,
  HomeIcon,
  KeyRound,
  Landmark,
  Leaf,
  ListChecks,
  LogOut,
  Mail,
  MessageCircle,
  PiggyBank,
  Plus,
  ReceiptText,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  TrendingUp,
  Trash2,
  Umbrella,
  Utensils,
  CarFront,
  Droplets,
  Flame,
  Zap,
  WalletCards,
} from 'lucide-react';
import { householdId, isSupabaseConfigured, supabase } from './lib/supabase';

const FOOD_BUDGET = 500;
const STORAGE_KEY = 'mon-foyer-v1';
const USE_REMOTE_BUDGET = isSupabaseConfigured && supabase && householdId;
const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

const iconMap = {
  nourriture: ShoppingBasket,
  restaurant: Utensils,
  jardin: Leaf,
  carburant: Fuel,
  transports_publics: BusFront,
  sante: HeartPulse,
  habitation: HomeIcon,
  assurances: ShieldCheck,
  loisirs: Umbrella,
  divers: CircleEllipsis,
  revenus: TrendingUp,
  emprunt_maison: HomeIcon,
  emprunt_voiture: CarFront,
  eau: Droplets,
  gaz: Flame,
  electricite: Zap,
};

const categoryColors = {
  nourriture: '#2f7d57',
  restaurant: '#d07a3f',
  jardin: '#7bbf91',
  carburant: '#b34b4b',
  transports_publics: '#2f6f9f',
  sante: '#bf5f82',
  habitation: '#24618a',
  assurances: '#6f7cb8',
  emprunt_maison: '#163a5f',
  emprunt_voiture: '#4d7c9f',
  eau: '#4aa3c7',
  gaz: '#d49a35',
  electricite: '#d6b72f',
  loisirs: '#7c63b6',
  divers: '#657382',
};

const defaultState = {
  stores: ['Colruyt', 'Delhaize', 'Lidl', 'Aldi', 'Carrefour', 'Blanche', 'Intratuin', 'Restaurant', 'Brasserie', 'Pharmacie'],
  categories: [
    { id: 'nourriture', label: 'Nourriture', icon: 'nourriture', type: 'variable' },
    { id: 'restaurant', label: 'Restaurant', icon: 'restaurant', type: 'variable' },
    { id: 'jardin', label: 'Jardin', icon: 'jardin', type: 'variable' },
    { id: 'carburant', label: 'Carburant', icon: 'carburant', type: 'variable' },
    { id: 'transports_publics', label: 'Transports publics', icon: 'transports_publics', type: 'variable' },
    { id: 'sante', label: 'Santé', icon: 'sante', type: 'variable' },
    { id: 'habitation', label: 'Habitation', icon: 'habitation', type: 'fixed' },
    { id: 'assurances', label: 'Assurances', icon: 'assurances', type: 'fixed' },
    { id: 'emprunt_maison', label: 'Emprunt maison', icon: 'emprunt_maison', type: 'fixed' },
    { id: 'emprunt_voiture', label: 'Emprunt voiture', icon: 'emprunt_voiture', type: 'fixed' },
    { id: 'eau', label: 'Eau', icon: 'eau', type: 'fixed' },
    { id: 'gaz', label: 'Gaz', icon: 'gaz', type: 'fixed' },
    { id: 'electricite', label: 'Électricité', icon: 'electricite', type: 'fixed' },
    { id: 'loisirs', label: 'Loisirs', icon: 'loisirs', type: 'variable' },
    { id: 'divers', label: 'Divers', icon: 'divers', type: 'variable' },
    { id: 'revenus', label: 'Revenus', icon: 'revenus', type: 'income' },
  ],
  savingsGoals: [
    { id: 'voiture', label: 'Voiture', target: 6000, saved: 1200 },
    { id: 'vacances', label: 'Vacances', target: 2500, saved: 650 },
    { id: 'maison', label: 'Maison', target: 20000, saved: 4200 },
    { id: 'urgence', label: "Fonds d'urgence", target: 5000, saved: 1800 },
    { id: 'autre', label: 'Autre', target: 1000, saved: 150 },
  ],
  recurringFixedExpenses: [],
  operations: [
    { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), person: 'Alain', type: 'income', category: 'divers', store: '', label: 'Salaire Alain', amount: 2450 },
    { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), person: 'Esther', type: 'income', category: 'divers', store: '', label: 'Salaire Esther', amount: 2180 },
    { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), person: 'Foyer', type: 'fixed', category: 'habitation', store: '', label: 'Loyer', amount: 980 },
    { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), person: 'Esther', type: 'variable', category: 'nourriture', store: 'Colruyt', label: 'Courses semaine', amount: 86.4 },
  ],
};

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultState;
    const parsed = JSON.parse(stored);
    return {
      ...defaultState,
      ...parsed,
      categories: mergeCategories(defaultState.categories, parsed.categories || []),
    };
  } catch {
    return defaultState;
  }
}

function mergeCategories(baseCategories, storedCategories) {
  const merged = [...baseCategories];
  storedCategories.forEach((category) => {
    if (!merged.some((item) => item.id === category.id)) {
      merged.push(category);
    }
  });
  return merged;
}

function makeCategoryId(label) {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `categorie_${Date.now()}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function makeEmptyOperation() {
  return {
    id: '',
    date: new Date().toISOString().slice(0, 10),
    person: 'Foyer',
    type: 'variable',
    category: 'nourriture',
    store: 'Colruyt',
    label: '',
    amount: '',
  };
}

function makeEmptyRecurringFixedExpense() {
  return {
    label: '',
    amount: '',
    day: 1,
    person: 'Foyer',
    category: 'habitation',
  };
}

function dateInMonth(month, day) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day) || 1, 1), lastDay);
  return `${month}-${String(safeDay).padStart(2, '0')}`;
}

function fixedExpenseSignature(operation) {
  return [
    operation.date,
    operation.person,
    operation.category,
    operation.label.trim().toLowerCase(),
    Number(operation.amount).toFixed(2),
  ].join('|');
}

function calculateTotals(operations) {
  const base = { income: 0, fixed: 0, variable: 0, food: 0 };
  operations.forEach((operation) => {
    const amount = Number(operation.amount);
    if (operation.type === 'income') base.income += amount;
    if (operation.type === 'fixed') base.fixed += amount;
    if (operation.type === 'variable') base.variable += amount;
    if (operation.category === 'nourriture') base.food += amount;
  });
  return { ...base, balance: base.income - base.fixed - base.variable };
}

function normalizeRemoteState(remote) {
  return {
    operations: remote.operations.map((operation) => ({
      ...operation,
      amount: Number(operation.amount),
      store: operation.store || '',
    })),
    stores: remote.stores.map((store) => store.name),
    savingsGoals: remote.savingsGoals.map((goal) => ({
      ...goal,
      target: Number(goal.target),
      saved: Number(goal.saved),
    })),
  };
}

export default function App() {
  const [data, setData] = useState(loadState);
  const [activeView, setActiveView] = useState('home');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [draft, setDraft] = useState(makeEmptyOperation);
  const [recurringDraft, setRecurringDraft] = useState(makeEmptyRecurringFixedExpense);
  const [editingId, setEditingId] = useState(null);
  const [newStore, setNewStore] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('variable');
  const [categoryStatus, setCategoryStatus] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatAuthor, setChatAuthor] = useState('Alain');
  const [chatStatus, setChatStatus] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [messageNotice, setMessageNotice] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState('all');
  const [historyPerson, setHistoryPerson] = useState('all');
  const [historyCategory, setHistoryCategory] = useState('all');
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [syncStatus, setSyncStatus] = useState(USE_REMOTE_BUDGET ? 'Synchronisation...' : 'Mode local');
  const [operationStatus, setOperationStatus] = useState('');
  const [migrationStatus, setMigrationStatus] = useState('');
  const [recurringStatus, setRecurringStatus] = useState('');
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const activeViewRef = useRef(activeView);

  const saveData = (nextData) => {
    setData(nextData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
  };

  const mergeData = (partialData) => {
    setData((current) => {
      const nextData = { ...current, ...partialData };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
      return nextData;
    });
  };

  const monthOperations = useMemo(
    () => data.operations.filter((operation) => operation.date.startsWith(selectedMonth)),
    [data.operations, selectedMonth],
  );

  const totals = useMemo(() => {
    return calculateTotals(monthOperations);
  }, [monthOperations]);

  const categoryTotals = useMemo(() => {
    return data.categories.map((category) => ({
      ...category,
      total: monthOperations
        .filter((operation) => operation.category === category.id && operation.type !== 'income')
        .reduce((sum, operation) => sum + Number(operation.amount), 0),
    }));
  }, [data.categories, monthOperations]);

  const reviewMap = useMemo(() => {
    const signatures = new Map();
    monthOperations.forEach((operation) => {
      const signature = [
        operation.date,
        operation.person,
        operation.type,
        operation.category,
        operation.store || '',
        operation.label.trim().toLowerCase(),
        Number(operation.amount).toFixed(2),
      ].join('|');
      signatures.set(signature, (signatures.get(signature) || 0) + 1);
    });

    return monthOperations.reduce((alerts, operation) => {
      const reasons = [];
      const amount = Number(operation.amount);
      const signature = [
        operation.date,
        operation.person,
        operation.type,
        operation.category,
        operation.store || '',
        operation.label.trim().toLowerCase(),
        amount.toFixed(2),
      ].join('|');

      if (!operation.label.trim()) reasons.push('libellé manquant');
      if (!amount || amount <= 0) reasons.push('montant à vérifier');
      if (operation.type !== 'income' && amount >= 1000) reasons.push('montant élevé');
      if (signatures.get(signature) > 1) reasons.push('doublon possible');

      if (reasons.length > 0) alerts.set(operation.id, reasons);
      return alerts;
    }, new Map());
  }, [monthOperations]);

  const filteredMonthOperations = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    return monthOperations.filter((operation) => {
      const category = data.categories.find((item) => item.id === operation.category);
      const haystack = [
        operation.label,
        operation.person,
        operation.store,
        category?.label,
        operation.date,
      ].join(' ').toLowerCase();

      if (showReviewOnly && !reviewMap.has(operation.id)) return false;
      if (historyType !== 'all' && operation.type !== historyType) return false;
      if (historyPerson !== 'all' && operation.person !== historyPerson) return false;
      if (historyCategory !== 'all' && operation.category !== historyCategory) return false;
      if (search && !haystack.includes(search)) return false;
      return true;
    });
  }, [data.categories, historyCategory, historyPerson, historySearch, historyType, monthOperations, reviewMap, showReviewOnly]);

  const foodRatio = Math.min((totals.food / FOOD_BUDGET) * 100, 100);

  const annualReview = useMemo(() => {
    const selectedYear = selectedMonth.slice(0, 4);
    const previousYear = String(Number(selectedYear) - 1);
    const annualOperations = data.operations.filter((operation) => operation.date.startsWith(selectedYear));
    const previousOperations = data.operations.filter((operation) => operation.date.startsWith(previousYear));
    const annualTotals = calculateTotals(annualOperations);
    const previousTotals = calculateTotals(previousOperations);
    const annualExpenseTotal = annualTotals.fixed + annualTotals.variable;
    const previousExpenseTotal = previousTotals.fixed + previousTotals.variable;

    const months = MONTH_LABELS.map((label, index) => {
      const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
      const monthTotals = calculateTotals(data.operations.filter((operation) => operation.date.startsWith(monthKey)));
      return {
        label,
        monthKey,
        ...monthTotals,
        expenses: monthTotals.fixed + monthTotals.variable,
      };
    });

    const categories = data.categories.map((category) => ({
      ...category,
      total: annualOperations
        .filter((operation) => operation.category === category.id && operation.type !== 'income')
        .reduce((sum, operation) => sum + Number(operation.amount), 0),
    }));

    return {
      year: selectedYear,
      previousYear,
      totals: annualTotals,
      expenses: annualExpenseTotal,
      previousExpenses: previousExpenseTotal,
      difference: annualExpenseTotal - previousExpenseTotal,
      hasPreviousYear: previousOperations.length > 0,
      months,
      categories,
    };
  }, [data.operations, data.categories, selectedMonth]);

  useEffect(() => {
    activeViewRef.current = activeView;
    if (activeView === 'messages') {
      setUnreadMessages(0);
      setMessageNotice('');
    }
  }, [activeView]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    let mounted = true;

    supabase.auth.getSession().then(({ data: authData }) => {
      if (!mounted) return;
      setSession(authData.session);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!USE_REMOTE_BUDGET || !session) return undefined;

    let ignore = false;

    async function loadBudget() {
      const [operationsResult, storesResult, goalsResult] = await Promise.all([
        supabase.from('operations').select('id, date, person, type, category, store, label, amount').eq('household_id', householdId).order('date', { ascending: false }),
        supabase.from('stores').select('id, name').eq('household_id', householdId).order('name', { ascending: true }),
        supabase.from('savings_goals').select('id, label, target, saved').eq('household_id', householdId).order('created_at', { ascending: true }),
      ]);

      if (ignore) return;

      if (operationsResult.error || storesResult.error || goalsResult.error) {
        setSyncStatus('Mode local, Supabase indisponible');
        return;
      }

      let remoteStores = storesResult.data || [];
      let remoteGoals = goalsResult.data || [];

      if (remoteStores.length === 0) {
        const { data: insertedStores } = await supabase
          .from('stores')
          .insert(defaultState.stores.map((name) => ({ household_id: householdId, name })))
          .select('id, name');
        remoteStores = insertedStores || [];
      }

      if (remoteGoals.length === 0) {
        const { data: insertedGoals } = await supabase
          .from('savings_goals')
          .insert(defaultState.savingsGoals.map(({ label, target, saved }) => ({ household_id: householdId, label, target, saved })))
          .select('id, label, target, saved');
        remoteGoals = insertedGoals || [];
      }

      mergeData(normalizeRemoteState({
        operations: operationsResult.data || [],
        stores: remoteStores,
        savingsGoals: remoteGoals,
      }));
      setSyncStatus('Synchronise avec Supabase');
    }

    loadBudget();

    const channel = supabase
      .channel('budget-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operations' }, async () => {
        const { data: rows } = await supabase
          .from('operations')
          .select('id, date, person, type, category, store, label, amount')
          .eq('household_id', householdId)
          .order('date', { ascending: false });
        if (rows) mergeData({ operations: rows.map((row) => ({ ...row, amount: Number(row.amount), store: row.store || '' })) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, async () => {
        const { data: rows } = await supabase.from('stores').select('name').eq('household_id', householdId).order('name', { ascending: true });
        if (rows) mergeData({ stores: rows.map((row) => row.name) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings_goals' }, async () => {
        const { data: rows } = await supabase
          .from('savings_goals')
          .select('id, label, target, saved')
          .eq('household_id', householdId)
          .order('created_at', { ascending: true });
        if (rows) {
          mergeData({
            savingsGoals: rows.map((row) => ({ ...row, target: Number(row.target), saved: Number(row.saved) })),
          });
        }
      })
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [session]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!draft.label.trim() || !amount) return;

    setOperationStatus('');

    const operation = {
      ...draft,
      amount,
      store: draft.type === 'income' || draft.type === 'fixed' ? '' : draft.store,
      category: draft.type === 'income' ? 'revenus' : draft.category,
      id: editingId || crypto.randomUUID(),
    };

    if (isSupabaseConfigured && !householdId) {
      setOperationStatus("Foyer non configuré: VITE_HOUSEHOLD_ID est manquant.");
      return;
    }

    if (USE_REMOTE_BUDGET) {
      const payload = {
        household_id: householdId,
        date: operation.date,
        person: operation.person,
        type: operation.type,
        category: operation.category,
        store: operation.store || null,
        label: operation.label,
        amount: operation.amount,
      };

      const { data: savedOperation, error } = editingId
        ? await supabase
          .from('operations')
          .update(payload)
          .eq('id', editingId)
          .select('id, household_id, date, person, type, category, store, label, amount')
          .single()
        : await supabase
          .from('operations')
          .insert(payload)
          .select('id, household_id, date, person, type, category, store, label, amount')
          .single();

      if (error) {
        setOperationStatus(`Supabase refuse l'opération: ${error.message}`);
        return;
      }
      operation.id = savedOperation.id;
      setOperationStatus('Opération envoyée vers Supabase.');
    } else if (isSupabaseConfigured) {
      setOperationStatus('Mode local: redémarre Vite pour relire le fichier .env.');
      return;
    }

    const operations = editingId
      ? data.operations.map((item) => (item.id === editingId ? operation : item))
      : [operation, ...data.operations];

    saveData({ ...data, operations });
    setDraft(makeEmptyOperation());
    setEditingId(null);
    if (!USE_REMOTE_BUDGET) setActiveView('history');
  };

  const editOperation = (operation) => {
    setDraft({ ...operation, amount: String(operation.amount) });
    setEditingId(operation.id);
    setActiveView('add');
  };

  const deleteOperation = async (id) => {
    if (!window.confirm('Supprimer cette opération ?')) return;

    if (USE_REMOTE_BUDGET) {
      const { error } = await supabase.from('operations').delete().eq('id', id).eq('household_id', householdId);
      if (error) {
        setSyncStatus(`Suppression impossible: ${error.message}`);
        return;
      }
    }
    saveData({ ...data, operations: data.operations.filter((operation) => operation.id !== id) });
  };

  const addStore = async () => {
    const store = newStore.trim();
    if (!store || data.stores.includes(store)) return;
    if (USE_REMOTE_BUDGET) {
      const { error } = await supabase.from('stores').insert({ household_id: householdId, name: store });
      if (error) {
        setMigrationStatus(`Point de vente non envoyé: ${error.message}`);
        return;
      }
    }
    saveData({ ...data, stores: [...data.stores, store] });
    setNewStore('');
  };

  const deleteStore = async (store) => {
    if (!window.confirm(`Supprimer le point de vente "${store}" ?`)) return;

    if (USE_REMOTE_BUDGET) {
      await supabase.from('stores').delete().eq('name', store).eq('household_id', householdId);
    }
    saveData({ ...data, stores: data.stores.filter((item) => item !== store) });
  };

  const addCategory = () => {
    const label = newCategory.trim();
    if (!label) return;

    const id = makeCategoryId(label);
    if (data.categories.some((category) => category.id === id || category.label.toLowerCase() === label.toLowerCase())) {
      setCategoryStatus('Cette catégorie existe déjà.');
      return;
    }

    saveData({
      ...data,
      categories: [
        ...data.categories,
        {
          id,
          label,
          icon: 'divers',
          type: newCategoryType,
          custom: true,
        },
      ],
    });
    setNewCategory('');
    setNewCategoryType('variable');
    setCategoryStatus('Catégorie ajoutée.');
  };

  const deleteCategory = (category) => {
    if (!category.custom) {
      setCategoryStatus('Les catégories standard ne peuvent pas être supprimées.');
      return;
    }

    if (data.operations.some((operation) => operation.category === category.id)) {
      setCategoryStatus('Cette catégorie est utilisée dans l’historique.');
      return;
    }

    if (!window.confirm(`Supprimer la catégorie "${category.label}" ?`)) return;
    saveData({
      ...data,
      categories: data.categories.filter((item) => item.id !== category.id),
    });
    setCategoryStatus('Catégorie supprimée.');
  };

  const updateGoal = async (id, field, value) => {
    const numericValue = Number(value);
    setData((current) => {
      const nextData = {
        ...current,
        savingsGoals: current.savingsGoals.map((goal) =>
          goal.id === id ? { ...goal, [field]: numericValue } : goal,
        ),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
      return nextData;
    });

    if (USE_REMOTE_BUDGET) {
      const { error } = await supabase
        .from('savings_goals')
        .update({ [field]: numericValue })
        .eq('id', id)
        .eq('household_id', householdId);

      if (error) {
        setSyncStatus(`Erreur épargne: ${error.message}`);
      }
    }
  };

  const addRecurringFixedExpense = (event) => {
    event.preventDefault();
    const amount = Number(recurringDraft.amount);
    const label = recurringDraft.label.trim();

    if (!label || !amount) {
      setRecurringStatus('Indique un libellé et un montant.');
      return;
    }

    const fixedExpense = {
      id: crypto.randomUUID(),
      label,
      amount,
      day: Math.min(Math.max(Number(recurringDraft.day) || 1, 1), 31),
      person: recurringDraft.person,
      category: recurringDraft.category,
    };

    saveData({
      ...data,
      recurringFixedExpenses: [...(data.recurringFixedExpenses || []), fixedExpense],
    });
    setRecurringDraft(makeEmptyRecurringFixedExpense());
    setRecurringStatus('Frais fixe récurrent ajouté.');
  };

  const deleteRecurringFixedExpense = (id) => {
    if (!window.confirm('Supprimer ce frais fixe récurrent ?')) return;

    saveData({
      ...data,
      recurringFixedExpenses: (data.recurringFixedExpenses || []).filter((expense) => expense.id !== id),
    });
    setRecurringStatus('Frais fixe récurrent supprimé.');
  };

  const generateRecurringFixedExpenses = async () => {
    const fixedExpenses = data.recurringFixedExpenses || [];

    if (fixedExpenses.length === 0) {
      setRecurringStatus("Ajoute d'abord au moins un frais fixe récurrent.");
      return;
    }

    const existing = new Set(
      data.operations
        .filter((operation) => operation.type === 'fixed' && operation.date.startsWith(selectedMonth))
        .map(fixedExpenseSignature),
    );

    const generatedOperations = fixedExpenses
      .map((expense) => ({
        id: crypto.randomUUID(),
        date: dateInMonth(selectedMonth, expense.day),
        person: expense.person,
        type: 'fixed',
        category: expense.category,
        store: '',
        label: expense.label,
        amount: Number(expense.amount),
      }))
      .filter((operation) => !existing.has(fixedExpenseSignature(operation)));

    if (generatedOperations.length === 0) {
      setRecurringStatus('Tous les frais fixes existent déjà pour ce mois.');
      return;
    }

    let savedOperations = generatedOperations;

    if (USE_REMOTE_BUDGET) {
      const payload = generatedOperations.map((operation) => ({
        household_id: householdId,
        date: operation.date,
        person: operation.person,
        type: operation.type,
        category: operation.category,
        store: null,
        label: operation.label,
        amount: operation.amount,
      }));

      const { data: insertedRows, error } = await supabase
        .from('operations')
        .insert(payload)
        .select('id, date, person, type, category, store, label, amount');

      if (error) {
        setRecurringStatus(`Generation impossible: ${error.message}`);
        return;
      }

      savedOperations = (insertedRows || []).map((operation) => ({
        ...operation,
        amount: Number(operation.amount),
        store: operation.store || '',
      }));
    }

    saveData({
      ...data,
      operations: [...savedOperations, ...data.operations],
    });
    setRecurringStatus(`${savedOperations.length} frais fixe(s) ajoute(s) pour ${selectedMonth}.`);
  };

  const refreshFromSupabase = async () => {
    if (!USE_REMOTE_BUDGET) {
      setMigrationStatus('Supabase ou le foyer ne sont pas configurés.');
      return;
    }

    setMigrationStatus('Rechargement depuis Supabase...');

    const [operationsResult, storesResult, goalsResult] = await Promise.all([
      supabase
        .from('operations')
        .select('id, date, person, type, category, store, label, amount')
        .eq('household_id', householdId)
        .order('date', { ascending: false }),
      supabase
        .from('stores')
        .select('id, name')
        .eq('household_id', householdId)
        .order('name', { ascending: true }),
      supabase
        .from('savings_goals')
        .select('id, label, target, saved')
        .eq('household_id', householdId)
        .order('created_at', { ascending: true }),
    ]);

    if (operationsResult.error || storesResult.error || goalsResult.error) {
      setMigrationStatus('Rechargement impossible: Supabase indisponible.');
      return;
    }

    mergeData(normalizeRemoteState({
      operations: operationsResult.data || [],
      stores: storesResult.data || [],
      savingsGoals: goalsResult.data || [],
    }));
    setSyncStatus('Synchronise avec Supabase');
    setMigrationStatus('Données locales remplacées par Supabase.');
  };

  const migrateLocalData = async () => {
    if (!USE_REMOTE_BUDGET) {
      setMigrationStatus('Supabase ou le foyer ne sont pas configurés.');
      return;
    }

    setMigrationStatus('Migration en cours...');

    const [operationsResult, storesResult, goalsResult] = await Promise.all([
      supabase
        .from('operations')
        .select('date, person, type, category, store, label, amount')
        .eq('household_id', householdId),
      supabase
        .from('stores')
        .select('name')
        .eq('household_id', householdId),
      supabase
        .from('savings_goals')
        .select('label')
        .eq('household_id', householdId),
    ]);

    if (operationsResult.error || storesResult.error || goalsResult.error) {
      setMigrationStatus('Migration impossible: lecture Supabase refusée.');
      return;
    }

    const signature = (operation) => [
      operation.date,
      operation.person,
      operation.type,
      operation.category,
      operation.store || '',
      operation.label,
      Number(operation.amount).toFixed(2),
    ].join('|');

    const existing = new Set((operationsResult.data || []).map(signature));
    const missingOperations = data.operations
      .filter((operation) => !existing.has(signature(operation)))
      .map((operation) => ({
        household_id: householdId,
        date: operation.date,
        person: operation.person,
        type: operation.type,
        category: operation.category,
        store: operation.store || null,
        label: operation.label,
        amount: Number(operation.amount),
      }));

    const existingStores = new Set((storesResult.data || []).map((store) => store.name.toLowerCase()));
    const missingStores = data.stores
      .filter((store) => !existingStores.has(store.toLowerCase()))
      .map((name) => ({ household_id: householdId, name }));

    const existingGoals = new Set((goalsResult.data || []).map((goal) => goal.label.toLowerCase()));
    const missingGoals = data.savingsGoals
      .filter((goal) => !existingGoals.has(goal.label.toLowerCase()))
      .map(({ label, target, saved }) => ({
        household_id: householdId,
        label,
        target: Number(target),
        saved: Number(saved),
      }));

    if (missingOperations.length > 0) {
      const { error: insertError } = await supabase.from('operations').insert(missingOperations);
      if (insertError) {
        setMigrationStatus(`Migration impossible: ${insertError.message}`);
        return;
      }
    }

    if (missingStores.length > 0) {
      const { error: storeError } = await supabase.from('stores').insert(missingStores);
      if (storeError) {
        setMigrationStatus(`Migration points de vente impossible: ${storeError.message}`);
        return;
      }
    }

    if (missingGoals.length > 0) {
      const { error: goalError } = await supabase.from('savings_goals').insert(missingGoals);
      if (goalError) {
        setMigrationStatus(`Migration épargne impossible: ${goalError.message}`);
        return;
      }
    }

    setMigrationStatus(`${missingOperations.length} opération(s), ${missingStores.length} point(s) de vente et ${missingGoals.length} objectif(s) envoyé(s) vers Supabase.`);
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setChatStatus('Supabase non configuré.');
      return undefined;
    }

    if (!session) return undefined;

    let ignore = false;

    async function loadMessages() {
      const { data: rows, error } = await supabase
        .from('messages')
        .select('id, author, content, created_at')
        .eq('household_id', householdId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (ignore) return;
      if (error) {
        setChatStatus("Impossible de charger les messages.");
        return;
      }

      setMessages(rows || []);
      setChatStatus('');
    }

    loadMessages();

    const channel = supabase
      .channel('messages-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new.household_id !== householdId) return;
          setMessages((current) => {
            if (current.some((message) => message.id === payload.new.id)) return current;
            if (activeViewRef.current !== 'messages') {
              setUnreadMessages((count) => count + 1);
              setMessageNotice(`Nouveau message de ${payload.new.author}`);
            }
            return [...current, payload.new];
          });
        },
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [session]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const content = chatDraft.trim();
    if (!content || !supabase || !householdId) return;

    setChatStatus('Envoi...');
    const { data: row, error } = await supabase
      .from('messages')
      .insert({ household_id: householdId, author: chatAuthor, content })
      .select('id, author, content, created_at')
      .single();

    if (error) {
      setChatStatus("Le message n'a pas pu être envoyé.");
      return;
    }

    setMessages((current) => (current.some((message) => message.id === row.id) ? current : [...current, row]));
    setChatDraft('');
    setChatStatus('');
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (!authReady) {
    return (
      <div className="app-shell">
        <section className="panel auth-panel">
          <h1>Mon Foyer</h1>
          <p className="hint">Connexion en cours...</p>
        </section>
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <AuthGate />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Alain & Esther</p>
          <h1>Mon Foyer</h1>
        </div>
        <label className="month-picker">
          <CalendarDays size={18} />
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
        </label>
      </header>

      {messageNotice && activeView !== 'messages' && (
        <button type="button" className="message-notice" onClick={() => setActiveView('messages')}>
          <MessageCircle size={18} />
          <span>{messageNotice}</span>
        </button>
      )}

      <main className="content">
        {activeView === 'home' && (
          <section className="view">
            <div className="hero-panel">
              <div>
                <span>Solde du mois</span>
                <strong>{formatCurrency(totals.balance)}</strong>
              </div>
              <PiggyBank size={42} />
            </div>

            <div className="stats-grid">
              <StatCard icon={Banknote} label="Revenus" value={formatCurrency(totals.income)} />
              <StatCard icon={Landmark} label="Frais fixes" value={formatCurrency(totals.fixed)} />
              <StatCard icon={WalletCards} label="Variables" value={formatCurrency(totals.variable)} />
            </div>

            <section className="panel">
              <div className="section-title">
                <h2>Budget nourriture</h2>
                <span>{formatCurrency(totals.food)} / {formatCurrency(FOOD_BUDGET)}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${foodRatio}%` }} />
              </div>
              <p className="hint">{FOOD_BUDGET - totals.food >= 0 ? `${formatCurrency(FOOD_BUDGET - totals.food)} disponibles` : `${formatCurrency(totals.food - FOOD_BUDGET)} au-dessus de l'idéal`}</p>
            </section>

            <ExpenseChart categories={categoryTotals} />

            <AnnualReview review={annualReview} />

            <section className="panel">
              <div className="section-title">
                <h2>Catégories</h2>
                <span>{monthOperations.length} opérations</span>
              </div>
              <div className="category-list">
                {categoryTotals.map((category) => (
                  <CategoryRow key={category.id} category={category} />
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="section-title">
                <h2>Catégories</h2>
                <span>{data.categories.filter((category) => category.type !== 'income').length}</span>
              </div>
              <div className="category-form">
                <input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Nouvelle catégorie"
                />
                <select value={newCategoryType} onChange={(event) => setNewCategoryType(event.target.value)}>
                  <option value="variable">Dépense variable</option>
                  <option value="fixed">Frais fixe</option>
                </select>
                <button type="button" onClick={addCategory}>
                  <Plus size={20} />
                </button>
              </div>
              <div className="chip-list">
                {data.categories
                  .filter((category) => category.type !== 'income')
                  .map((category) => (
                    <button
                      className={category.custom ? 'chip' : 'chip locked'}
                      key={category.id}
                      type="button"
                      onClick={() => deleteCategory(category)}
                    >
                      {category.label}
                      {category.custom ? <Trash2 size={14} /> : null}
                    </button>
                  ))}
              </div>
              {categoryStatus && <p className="hint">{categoryStatus}</p>}
            </section>

            <section className="panel">
              <div className="section-title">
                <h2>Epargne</h2>
                <span>{formatCurrency(data.savingsGoals.reduce((sum, goal) => sum + goal.saved, 0))}</span>
              </div>
              <div className="goals-grid">
                {data.savingsGoals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} />
                ))}
              </div>
            </section>
          </section>
        )}

        {activeView === 'add' && (
          <section className="view">
            <form className="panel form-panel" onSubmit={handleSubmit}>
              <div className="section-title">
                <h2>{editingId ? 'Modifier' : 'Ajouter'} une operation</h2>
                {editingId && (
                  <button type="button" className="text-button" onClick={() => { setEditingId(null); setDraft(makeEmptyOperation()); }}>
                    Annuler
                  </button>
                )}
              </div>

              <label>
                Type
                <select
                  value={draft.type}
                  onChange={(event) => {
                    const type = event.target.value;
                    const nextCategory = type === 'income'
                      ? 'revenus'
                      : type === 'fixed'
                        ? 'habitation'
                        : draft.category === 'revenus' || data.categories.find((category) => category.id === draft.category)?.type === 'fixed'
                          ? 'nourriture'
                          : draft.category;
                    setDraft({
                      ...draft,
                      type,
                      category: nextCategory,
                    });
                  }}
                >
                  <option value="income">Revenus</option>
                  <option value="fixed">Frais fixes</option>
                  <option value="variable">Dépenses variables</option>
                </select>
              </label>

              <label>
                Libellé
                <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Ex. Courses, salaire, assurance" />
              </label>

              <div className="form-row">
                <label>
                  Montant
                  <input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="0,00" />
                </label>
                <label>
                  Date
                  <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
                </label>
              </div>

              <div className={draft.type === 'income' ? 'form-row single' : 'form-row'}>
                <label>
                  Personne
                  <select value={draft.person} onChange={(event) => setDraft({ ...draft, person: event.target.value })}>
                    <option>Foyer</option>
                    <option>Alain</option>
                    <option>Esther</option>
                  </select>
                </label>
                {draft.type !== 'income' && (
                  <label>
                    Catégorie
                    <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                      {data.categories
                        .filter((category) => {
                          if (draft.type === 'fixed') return category.type === 'fixed';
                          return category.type !== 'income';
                        })
                        .map((category) => (
                          <option key={category.id} value={category.id}>{category.label}</option>
                        ))}
                    </select>
                  </label>
                )}
              </div>

              {draft.type === 'variable' && (
                <label>
                  Point de vente
                  <select value={draft.store} onChange={(event) => setDraft({ ...draft, store: event.target.value })}>
                    {data.stores.map((store) => (
                      <option key={store}>{store}</option>
                    ))}
                  </select>
                </label>
              )}

              <button className="primary-button" type="submit">
                <Plus size={20} />
                {editingId ? 'Enregistrer' : 'Ajouter'}
              </button>
              {operationStatus && <p className="hint status-error">{operationStatus}</p>}
            </form>
          </section>
        )}

        {activeView === 'history' && (
          <section className="view">
            <div className="panel">
              <div className="section-title">
                <h2>Historique</h2>
                <span>{filteredMonthOperations.length} / {monthOperations.length} lignes</span>
              </div>
              <div className="history-tools">
                <input
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Rechercher"
                />
                <div className="filter-grid">
                  <select value={historyType} onChange={(event) => setHistoryType(event.target.value)} aria-label="Type">
                    <option value="all">Tous les types</option>
                    <option value="income">Revenus</option>
                    <option value="fixed">Frais fixes</option>
                    <option value="variable">Dépenses variables</option>
                  </select>
                  <select value={historyPerson} onChange={(event) => setHistoryPerson(event.target.value)} aria-label="Personne">
                    <option value="all">Toutes les personnes</option>
                    <option>Foyer</option>
                    <option>Alain</option>
                    <option>Esther</option>
                  </select>
                </div>
                <div className="filter-grid">
                  <select value={historyCategory} onChange={(event) => setHistoryCategory(event.target.value)} aria-label="Catégorie">
                    <option value="all">Toutes les catégories</option>
                    {data.categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={showReviewOnly ? 'review-filter active' : 'review-filter'}
                    onClick={() => setShowReviewOnly((current) => !current)}
                  >
                    À vérifier {reviewMap.size > 0 ? `(${reviewMap.size})` : ''}
                  </button>
                </div>
              </div>
              <div className="operation-list">
                {filteredMonthOperations.length === 0 && <p className="empty-state">Aucune opération pour ces critères.</p>}
                {filteredMonthOperations.map((operation) => (
                  <OperationRow
                    key={operation.id}
                    operation={operation}
                    categories={data.categories}
                    alerts={reviewMap.get(operation.id)}
                    onEdit={editOperation}
                    onDelete={deleteOperation}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {activeView === 'messages' && (
          <section className="view chat-view">
            <section className="panel chat-panel">
              <div className="section-title">
                <h2>Messages du foyer</h2>
                <span>{messages.length} messages</span>
              </div>

              <div className="message-list">
                {messages.length === 0 && (
                  <p className="empty-state">Aucun message pour le moment.</p>
                )}
                {messages.map((message) => (
                  <article
                    className={message.author === chatAuthor ? 'message-bubble mine' : 'message-bubble'}
                    key={message.id}
                  >
                    <div>
                      <strong>{message.author}</strong>
                      <span>{new Date(message.created_at).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>

              <form className="chat-form" onSubmit={sendMessage}>
                <select value={chatAuthor} onChange={(event) => setChatAuthor(event.target.value)} aria-label="Auteur">
                  <option>Alain</option>
                  <option>Esther</option>
                </select>
                <input
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder="Ecrire un message"
                />
                <button type="submit" aria-label="Envoyer">
                  <Send size={19} />
                </button>
              </form>
              {chatStatus && <p className="hint">{chatStatus}</p>}
            </section>
          </section>
        )}

        {activeView === 'settings' && (
          <section className="view">
            <section className="panel">
              <div className="section-title">
                <h2>Points de vente</h2>
                <span>{data.stores.length}</span>
              </div>
              <div className="inline-form">
                <input value={newStore} onChange={(event) => setNewStore(event.target.value)} placeholder="Nouveau point de vente" />
                <button type="button" onClick={addStore}><Plus size={20} /></button>
              </div>
              <div className="chip-list">
                {data.stores.map((store) => (
                  <button className="chip" key={store} type="button" onClick={() => deleteStore(store)}>
                    {store}
                    <Trash2 size={14} />
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="section-title">
                <h2>Frais fixes récurrents</h2>
                <span>{(data.recurringFixedExpenses || []).length}</span>
              </div>

              <form className="recurring-form" onSubmit={addRecurringFixedExpense}>
                <label>
                  Libellé
                  <input
                    value={recurringDraft.label}
                    onChange={(event) => setRecurringDraft({ ...recurringDraft, label: event.target.value })}
                    placeholder="Ex. Emprunt maison"
                  />
                </label>
                <div className="recurring-grid">
                  <label>
                    Montant
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={recurringDraft.amount}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, amount: event.target.value })}
                      placeholder="0,00"
                    />
                  </label>
                  <label>
                    Jour
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={recurringDraft.day}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, day: event.target.value })}
                    />
                  </label>
                </div>
                <div className="recurring-grid">
                  <label>
                    Personne
                    <select
                      value={recurringDraft.person}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, person: event.target.value })}
                    >
                      <option>Foyer</option>
                      <option>Alain</option>
                      <option>Esther</option>
                    </select>
                  </label>
                  <label>
                    Catégorie
                    <select
                      value={recurringDraft.category}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, category: event.target.value })}
                    >
                      {data.categories
                        .filter((category) => category.type === 'fixed')
                        .map((category) => (
                          <option key={category.id} value={category.id}>{category.label}</option>
                        ))}
                    </select>
                  </label>
                </div>
                <button className="primary-button" type="submit">
                  <Plus size={20} />
                  Ajouter le frais fixe
                </button>
              </form>

              <div className="recurring-list">
                {(data.recurringFixedExpenses || []).length === 0 && (
                  <p className="empty-state">Aucun frais fixe récurrent configuré.</p>
                )}
                {(data.recurringFixedExpenses || []).map((expense) => {
                  const category = data.categories.find((item) => item.id === expense.category);
                  return (
                    <article className="recurring-row" key={expense.id}>
                      <div>
                        <strong>{expense.label}</strong>
                        <span>{formatCurrency(expense.amount)} - jour {expense.day} - {expense.person} - {category?.label || 'Frais fixe'}</span>
                      </div>
                      <button type="button" onClick={() => deleteRecurringFixedExpense(expense.id)} aria-label="Supprimer">
                        <Trash2 size={16} />
                      </button>
                    </article>
                  );
                })}
              </div>

              <button className="secondary-button" type="button" onClick={generateRecurringFixedExpenses}>
                Générer les frais fixes du mois
              </button>
              {recurringStatus && <p className="hint">{recurringStatus}</p>}
            </section>

            <section className="panel">
              <div className="section-title">
                <h2>Structure future</h2>
                <span>Supabase</span>
              </div>
              <p className="hint">
                {syncStatus}. Les données sont séparées en opérations, catégories, points de vente et objectifs d'épargne.
              </p>
              <button className="secondary-button" type="button" onClick={refreshFromSupabase}>
                Recharger depuis Supabase
              </button>
              <button className="secondary-button" type="button" onClick={migrateLocalData}>
                Envoyer les données locales vers Supabase
              </button>
              {migrationStatus && <p className="hint">{migrationStatus}</p>}
            </section>

            <section className="panel">
              <div className="section-title">
                <h2>Connexion</h2>
                <span>Alain & Esther</span>
              </div>
              <p className="hint">{session?.user?.email}</p>
              <button className="secondary-button" type="button" onClick={signOut}>
                Se déconnecter
              </button>
            </section>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navigation principale">
        <NavButton icon={Home} label="Accueil" active={activeView === 'home'} onClick={() => setActiveView('home')} />
        <NavButton icon={Plus} label="Ajouter" active={activeView === 'add'} onClick={() => setActiveView('add')} />
        <NavButton icon={ReceiptText} label="Historique" active={activeView === 'history'} onClick={() => setActiveView('history')} />
        <NavButton icon={MessageCircle} label="Messages" badge={unreadMessages} active={activeView === 'messages'} onClick={() => setActiveView('messages')} />
        <NavButton icon={Settings} label="Réglages" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
      </nav>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <article className="stat-card">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function CategoryRow({ category }) {
  const Icon = iconMap[category.icon] || CircleEllipsis;
  return (
    <div className="category-row">
      <span className="icon-bubble"><Icon size={18} /></span>
      <span>{category.label}</span>
      <strong>{formatCurrency(category.total)}</strong>
    </div>
  );
}

function GoalCard({ goal, onUpdate }) {
  const ratio = goal.target ? Math.min((goal.saved / goal.target) * 100, 100) : 0;
  return (
    <article className="goal-card">
      <div className="goal-head">
        <strong>{goal.label}</strong>
        <span>{Math.round(ratio)}%</span>
      </div>
      <div className="progress-track slim">
        <div className="progress-fill green" style={{ width: `${ratio}%` }} />
      </div>
      <div className="goal-inputs">
        <label>
          Mis de côté (épargne)
          <input type="number" min="0" value={goal.saved} onChange={(event) => onUpdate(goal.id, 'saved', event.target.value)} />
        </label>
        <label>
          Objectif
          <input type="number" min="0" value={goal.target} onChange={(event) => onUpdate(goal.id, 'target', event.target.value)} />
        </label>
      </div>
    </article>
  );
}

function ExpenseChart({ categories }) {
  const rows = categories
    .filter((category) => category.type !== 'income' && category.total > 0)
    .sort((left, right) => right.total - left.total);
  const total = rows.reduce((sum, category) => sum + category.total, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <section className="panel">
      <div className="section-title">
        <h2>Répartition des dépenses</h2>
        <span>{formatCurrency(total)}</span>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">Aucune dépense à afficher pour ce mois.</p>
      ) : (
        <div className="expense-chart">
          <div className="donut-wrap" aria-label="Répartition des dépenses par catégorie">
            <svg className="donut" viewBox="0 0 140 140" role="img">
              <circle className="donut-bg" cx="70" cy="70" r={radius} />
              {rows.map((category) => {
                const percentage = category.total / total;
                const dash = percentage * circumference;
                const segment = (
                  <circle
                    className="donut-segment"
                    cx="70"
                    cy="70"
                    key={category.id}
                    r={radius}
                    stroke={categoryColors[category.id] || categoryColors.divers}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += dash;
                return segment;
              })}
            </svg>
            <div className="donut-center">
              <strong>{formatCurrency(total)}</strong>
              <span>Dépenses</span>
            </div>
          </div>

          <div className="chart-legend">
            {rows.map((category) => {
              const percentage = Math.round((category.total / total) * 100);
              return (
                <div className="legend-row" key={category.id}>
                  <span className="legend-dot" style={{ background: categoryColors[category.id] || categoryColors.divers }} />
                  <span>{category.label}</span>
                  <strong>{formatCurrency(category.total)}</strong>
                  <em>{percentage}%</em>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function AnnualReview({ review }) {
  const topCategories = review.categories
    .filter((category) => category.type !== 'income' && category.total > 0)
    .sort((left, right) => right.total - left.total)
    .slice(0, 4);
  const comparisonText = review.hasPreviousYear
    ? `${review.difference >= 0 ? '+' : ''}${formatCurrency(review.difference)} vs ${review.previousYear}`
    : 'Comparaison disponible après une année complète';

  return (
    <section className="panel annual-panel">
      <div className="section-title">
        <h2>Bilan annuel {review.year}</h2>
        <span>{formatCurrency(review.expenses)}</span>
      </div>

      <div className="annual-summary">
        <div>
          <span>Revenus</span>
          <strong>{formatCurrency(review.totals.income)}</strong>
        </div>
        <div>
          <span>Frais fixes</span>
          <strong>{formatCurrency(review.totals.fixed)}</strong>
        </div>
        <div>
          <span>Variables</span>
          <strong>{formatCurrency(review.totals.variable)}</strong>
        </div>
        <div>
          <span>Solde</span>
          <strong>{formatCurrency(review.totals.balance)}</strong>
        </div>
      </div>

      <p className="hint">
        Nourriture: {formatCurrency(review.totals.food)} / {formatCurrency(FOOD_BUDGET * 12)} sur l'année. {comparisonText}.
      </p>

      {topCategories.length > 0 && (
        <div className="annual-categories">
          {topCategories.map((category) => (
            <span key={category.id}>
              {category.label}: <strong>{formatCurrency(category.total)}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="annual-months">
        {review.months.map((month) => (
          <div className="annual-month-row" key={month.monthKey}>
            <span>{month.label}</span>
            <strong>{formatCurrency(month.expenses)}</strong>
            <em>{formatCurrency(month.balance)}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function OperationRow({ operation, categories, alerts, onEdit, onDelete }) {
  const category = categories.find((item) => item.id === operation.category);
  const Icon = iconMap[category?.icon] || CircleEllipsis;
  const sign = operation.type === 'income' ? '+' : '-';

  return (
    <article className={alerts?.length ? 'operation-row needs-review' : 'operation-row'}>
      <span className="icon-bubble"><Icon size={18} /></span>
      <div>
        <strong>{operation.label}</strong>
        <span>{operation.date} · {operation.person}{operation.store ? ` · ${operation.store}` : ''}</span>
        {alerts?.length > 0 && <em>À vérifier: {alerts.join(', ')}</em>}
      </div>
      <strong className={operation.type === 'income' ? 'amount income' : 'amount'}>
        {sign}{formatCurrency(operation.amount)}
      </strong>
      <button type="button" onClick={() => onEdit(operation)} aria-label="Modifier">
        <Edit3 size={17} />
      </button>
      <button type="button" onClick={() => onDelete(operation.id)} aria-label="Supprimer">
        <Trash2 size={17} />
      </button>
    </article>
  );
}

function NavButton({ icon: Icon, label, active, badge = 0, onClick }) {
  return (
    <button type="button" className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>
      {badge > 0 && <span className="nav-badge">{badge > 9 ? '9+' : badge}</span>}
      <Icon size={22} />
      <span>{label}</span>
    </button>
  );
}

function AuthGate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  const signIn = async (event) => {
    event.preventDefault();
    setStatus('Connexion...');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setStatus(error ? `Connexion impossible: ${error.message}` : '');
  };

  const signUp = async () => {
    setStatus('Creation du compte...');
    const { error } = await supabase.auth.signUp({ email, password });
    setStatus(error ? `Creation impossible: ${error.message}` : 'Compte cree. Verifie tes e-mails si Supabase demande une confirmation.');
  };

  return (
    <div className="app-shell">
      <section className="panel auth-panel">
        <div className="auth-icon">
          <KeyRound size={28} />
        </div>
        <p className="eyebrow">Alain & Esther</p>
        <h1>Mon Foyer</h1>
        <p className="hint">Connecte-toi pour synchroniser le budget et les messages du foyer.</p>

        <form className="auth-form" onSubmit={signIn}>
          <label>
            E-mail
            <span>
              <Mail size={18} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nom@email.com" required />
            </span>
          </label>
          <label>
            Mot de passe
            <span>
              <KeyRound size={18} />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 6 caracteres" required />
            </span>
          </label>
          <button className="primary-button" type="submit">Se connecter</button>
          <button className="secondary-button" type="button" onClick={signUp}>Creer le compte</button>
        </form>

        {status && <p className="hint">{status}</p>}
      </section>
    </div>
  );
}
