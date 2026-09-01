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
  Repeat2,
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
import BelfiusAudit from './BelfiusAudit.jsx';
import BudgetAnalysis from './BudgetAnalysis.jsx';
import MonthEndAudit from './MonthEndAudit.jsx';
import DesktopDashboard from './DesktopDashboard.jsx';
import DataBackupRecovery from './DataBackupRecovery.jsx';
import ProtectedSettings from './ProtectedSettings.jsx';
import SavingsInterface, { REQUIRED_SAVINGS_GOALS, savingsBucketForDisplay } from './SavingsInterface.jsx';
import {
  enqueueOperationMutation,
  isRetryableSyncError,
  readOperationOutbox,
  writeOperationOutbox,
} from './lib/syncOutbox.js';
import { analyzeBudget } from './lib/budgetAnalysisRules.js';
import { accountingNature, isBudgetExpense, isInternalTransfer } from './lib/accountingClassification.js';
import { belongsToHouseholdFoodBudget, foodBudgetVisualStatus } from './lib/foodBudgetRules.js';
import {
  DEFAULT_CARE_PEOPLE,
  DEFAULT_FOOD_BUDGET,
  activeCarePeople,
  annualFoodBudget,
  configuredCarePeople,
  foodBudgetExcludedPeople,
  foodBudgetForMonth,
  peopleOptions,
  reimbursementTrackedPeople,
} from './lib/configurationRules.js';
import {
  applySavingsOperationChange,
  calculateLiveBankSnapshot,
  calculatePaymentMethodBalances,
  capturePaymentOperationState,
  matchesRecordedSavingsDeposit,
} from './lib/accountingLedger.js';
import {
  isMastercardPaymentMethod,
  MASTERCARD_MASKED_NUMBER,
  MASTERCARD_PAYMENT_METHOD,
  mastercardSettlementDate,
  recurringSourceMonthForBudget,
} from './lib/cardPaymentRules.js';
import { isMastercardStatementCommunication } from './lib/mastercardStatementRules.js';
import { LAST_BACKUP_STORAGE_KEY } from './lib/backupRules.js';
import { buildDailyBudgetSeries, buildMonthClosingChecks } from './lib/desktopDashboardRules.js';
import { incomeReceivedForNextMonth } from './lib/monthlyAccountingPresentation.js';
import { findPotentialOperationDuplicate } from './lib/operationDuplicateRules.js';
import { operationRequiresStore, operationStoreValue } from './lib/operationFormRules.js';
import {
  OPERATION_REVIEW_STATUSES,
  normalizeReviewStatus,
  reviewReasonsForOperation,
  reviewStatusLabel,
} from './lib/operationReviewRules.js';
import {
  recurringRecognitionPresentation,
  recurringStructuredCommunication,
  sortedBeneficiaryOptions,
} from './lib/recurringExpenseRules.js';

const FOOD_BUDGET = DEFAULT_FOOD_BUDGET;
const STORAGE_KEY = 'mon-foyer-v1';
const USE_REMOTE_BUDGET = isSupabaseConfigured && supabase && householdId;
const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const PAYMENT_METHODS = ['Compte Belfius', 'Chèques repas Alain', 'Chèques repas Esther', MASTERCARD_PAYMENT_METHOD];
const RECURRENCE_OPTIONS = [
  { value: 'once', label: 'Une seule fois', months: 0 },
  { value: 'monthly', label: 'Mensuelle', months: 1 },
  { value: 'quarterly', label: 'Trimestrielle', months: 3 },
  { value: 'semiannual', label: 'Semestrielle', months: 6 },
  { value: 'annual', label: 'Annuelle', months: 12 },
];
const OVERDRAFT_PAYMENT_METHODS = ['Compte Belfius', MASTERCARD_PAYMENT_METHOD];
const OPERATION_COLUMNS = 'id, date, person, type, category, store, label, amount, payment_method, settles_payment_method, settlement_date, savings_goal_id, savings_direction, accounting_nature, budget_month, income_kind, income_source, review_status, review_note, reviewed_by, reviewed_at, dispute_reference, resolved_at, created_at';
const LEGACY_OPERATION_COLUMNS = 'id, date, person, type, category, store, label, amount';
const APPLIED_SAVINGS_STORAGE_KEY = 'mon-foyer-belfius-savings-applied-v1';

function savingsBucketForGoal(goal) {
  if (goal?.bucket) return goal.bucket;
  const text = String(goal?.label || goal?.id || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (text.includes('vacance') || text.includes('loisir')) return 'vacances';
  if (text.includes('garage') || text.includes('entretien vehicule')) return 'garage';
  if (text.includes('taxe') || text.includes('impot')) return 'taxes';
  if (text === 'voiture' || text.includes('solde peugeot') || text.includes('epargne voiture')) return 'solde_peugeot';
  if (text === 'maison' || text.includes('frais divers maison') || text.includes('frais divers foyer') || text.includes('epargne maison')) return 'frais_maison';
  if (text.includes('pension alain')) return 'pension_alain';
  if (text.includes('pension esther')) return 'pension_esther';
  if (text.includes('pension')) return 'pension';
  if (text.includes('urgence')) return 'urgence';
  return String(goal?.id || 'autre');
}

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
    { id: 'coiffeur', label: 'Coiffeur', icon: 'divers', type: 'variable' },
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
    { id: 'pension', label: 'Pension A&E', target: 0, saved: 0 },
    { id: 'vacances', label: 'Vacances', target: 2500, saved: 650 },
    { id: 'maison', label: 'Maison', target: 20000, saved: 4200 },
    { id: 'urgence', label: "Fonds d'urgence", target: 5000, saved: 1800 },
    { id: 'autre', label: 'Autre', target: 1000, saved: 150 },
  ],
  recurringFixedExpenses: [],
  operations: [
    { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), person: 'Alain', type: 'income', category: 'divers', store: '', paymentMethod: 'Compte Belfius', label: 'Salaire Alain', amount: 2450 },
    { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), person: 'Esther', type: 'income', category: 'divers', store: '', paymentMethod: 'Compte Belfius', label: 'Salaire Esther', amount: 2180 },
    { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), person: 'Foyer', type: 'fixed', category: 'habitation', store: '', paymentMethod: 'Compte Belfius', label: 'Loyer', amount: 980 },
    { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), person: 'Esther', type: 'variable', category: 'nourriture', store: 'Colruyt', paymentMethod: 'Compte Belfius', label: 'Courses semaine', amount: 86.4 },
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
      operations: (parsed.operations || defaultState.operations).map(normalizeOperation),
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
  return sortCategories(merged);
}

function sortCategories(categories) {
  return [...categories].sort((left, right) => {
    if (left.type === 'income' && right.type !== 'income') return 1;
    if (left.type !== 'income' && right.type === 'income') return -1;
    return left.label.localeCompare(right.label, 'fr', { sensitivity: 'base' });
  });
}

function isExpenseCategory(category) {
  return category.type !== 'income'
    && category.id !== 'revenus'
    && category.label.trim().toLowerCase() !== 'revenus';
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

function formatSupabaseCategoryError(error) {
  if (!error?.message) return 'Type de frais non envoyé vers Supabase.';
  if (error.message.includes("Could not find the table 'public.categories'")) {
    return "Type de frais non envoyé: la table Supabase 'categories' n'existe pas encore. Lance le script supabase-categories-sync.sql dans Supabase.";
  }
  return `Type de frais non envoyé: ${error.message}`;
}

function formatSupabaseRecurringError(error) {
  if (!error?.message) return 'Frais fixe non envoyé vers Supabase.';
  if (error.message.includes("Could not find the table 'public.recurring_fixed_expenses'")) {
    return "Frais fixe non envoyé: la table Supabase 'recurring_fixed_expenses' n'existe pas encore. Lance le script supabase-recurring-fixed-expenses.sql dans Supabase.";
  }
  return `Frais fixe non envoyé: ${error.message}`;
}

function parseDecimal(value) {
  if (typeof value === 'number') return value;
  return Number(String(value).replace(',', '.').trim());
}

function normalizeOperation(operation) {
  return {
    ...operation,
    amount: Number(operation.amount),
    store: operation.store || '',
    paymentMethod: operation.payment_method || operation.paymentMethod || 'Compte Belfius',
    settlesPaymentMethod: operation.settles_payment_method || operation.settlesPaymentMethod || '',
    settlementDate: operation.settlement_date || operation.settlementDate || '',
    savingsGoalId: operation.savings_goal_id || operation.savingsGoalId || '',
    savingsDirection: operation.savings_direction || operation.savingsDirection || '',
    accountingNature: operation.accounting_nature || operation.accountingNature || accountingNature(operation),
    budgetMonth: operation.budget_month || operation.budgetMonth || inferredBudgetMonth(operation),
    incomeKind: operation.income_kind || operation.incomeKind || (String(operation.label || '').toLowerCase().includes('salaire') ? 'salary' : 'other'),
    incomeSource: operation.income_source || operation.incomeSource || '',
    reviewStatus: normalizeReviewStatus(operation.review_status || operation.reviewStatus),
    reviewNote: operation.review_note || operation.reviewNote || '',
    reviewedBy: operation.reviewed_by || operation.reviewedBy || '',
    reviewedAt: operation.reviewed_at || operation.reviewedAt || '',
    disputeReference: operation.dispute_reference || operation.disputeReference || '',
    resolvedAt: operation.resolved_at || operation.resolvedAt || '',
    createdAt: operation.created_at || operation.createdAt || '',
  };
}

function canPaymentMethodGoNegative(method) {
  return OVERDRAFT_PAYMENT_METHODS.includes(method);
}

function calculatePaymentBalances(operations) {
  return calculatePaymentMethodBalances(operations, PAYMENT_METHODS);
}

function isMissingPaymentColumn(error) {
  return error?.message?.includes('payment_method') || error?.message?.includes('schema cache');
}

function formatSupabaseOperationError(error) {
  if (isMissingPaymentColumn(error)) {
    return "Opération non envoyée: la colonne Supabase 'payment_method' n'existe pas encore. Lance le script supabase-payment-method.sql dans Supabase.";
  }
  return `Supabase refuse l'opération: ${error.message}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function currentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isLastDayOfMonth(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

function nextMonthKey(dateValue) {
  const [year, month] = String(dateValue || '').slice(0, 7).split('-').map(Number);
  if (!year || !month) return currentMonth();
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
}

function inferredBudgetMonth(operation) {
  const date = String(operation?.date || '');
  const paymentMethod = operation?.payment_method || operation?.paymentMethod || '';
  const settlementDate = operation?.settlement_date || operation?.settlementDate || '';
  if (isMastercardPaymentMethod(paymentMethod) && settlementDate) return settlementDate.slice(0, 7);
  const salary = operation?.income_kind === 'salary' || operation?.incomeKind === 'salary'
    || String(operation?.label || '').toLowerCase().includes('salaire');
  return salary && Number(date.slice(8, 10)) >= 24 ? nextMonthKey(date) : date.slice(0, 7);
}

function makeEmptyOperation() {
  return {
    id: '',
    date: new Date().toISOString().slice(0, 10),
    person: 'Foyer',
    type: 'variable',
    category: 'nourriture',
    store: '',
    paymentMethod: 'Compte Belfius',
    label: '',
    amount: '',
    recurrence: 'once',
    recurringDay: new Date().getDate(),
    recurringId: '',
    structuredCommunication: '',
    directDebitReference: '',
    freeCommunication: '',
    freeCommunicationMode: 'contains',
    savingsSource: '',
    savingsGoalId: '',
    savingsDirection: '',
    budgetMonth: currentMonth(),
    incomeKind: 'other',
    incomeSource: '',
    settlesPaymentMethod: '',
    settlementDate: '',
    reviewStatus: OPERATION_REVIEW_STATUSES.UNREVIEWED,
    reviewNote: '',
    reviewedBy: '',
    reviewedAt: '',
    disputeReference: '',
    resolvedAt: '',
  };
}

function makeEmptyRecurringFixedExpense() {
  return {
    label: '',
    amount: '',
    day: 1,
    frequency: 'monthly',
    startDate: currentDate(),
    person: 'Foyer',
    category: 'habitation',
    structuredCommunication: '',
    freeCommunication: '',
    freeCommunicationMode: 'contains',
    paymentMethod: 'Compte Belfius',
  };
}

function dateInMonth(month, day) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day) || 1, 1), lastDay);
  return `${month}-${String(safeDay).padStart(2, '0')}`;
}

function recurrenceLabel(value) {
  return RECURRENCE_OPTIONS.find((option) => option.value === value)?.label || 'Mensuelle';
}

function isRecurringDueInMonth(expense, month) {
  const frequency = expense.frequency || 'monthly';
  const interval = RECURRENCE_OPTIONS.find((option) => option.value === frequency)?.months || 1;
  const start = expense.startDate || expense.start_date || `${month}-01`;
  const [startYear, startMonth] = start.slice(0, 7).split('-').map(Number);
  const [year, monthNumber] = month.split('-').map(Number);
  const distance = (year - startYear) * 12 + (monthNumber - startMonth);
  return distance >= 0 && distance % interval === 0;
}

function fixedExpenseSignature(operation) {
  return [
    operation.date,
    operation.person,
    operation.category,
    operation.paymentMethod || operation.payment_method || 'Compte Belfius',
    operation.label.trim().toLowerCase(),
    Number(operation.amount).toFixed(2),
  ].join('|');
}

function recurringExpenseSignature(expense) {
  return [
    expense.label.trim().toLowerCase(),
    Number(expense.amount).toFixed(2),
    Number(expense.day),
    expense.person,
    expense.category,
    expense.paymentMethod || expense.payment_method || 'Compte Belfius',
    expense.frequency || 'monthly',
  ].join('|');
}

function isBelfiusAdjustment(operation) {
  return operation.label?.startsWith('Ajustement Belfius');
}

function calculateTotals(operations, reimbursablePeople = DEFAULT_CARE_PEOPLE) {
  const base = { income: 0, reimbursements: 0, fixed: 0, variable: 0, savingsTransfers: 0, food: 0 };
  operations.forEach((operation) => {
    if (isBelfiusAdjustment(operation)) return;
    const amount = Number(operation.amount);
    const nature = accountingNature(operation);
    if (nature === 'income') base.income += amount;
    if (nature === 'reimbursement') base.reimbursements += amount;
    if (nature === 'internal_transfer') base.savingsTransfers += amount;
    if (nature === 'expense' || nature === 'card_purchase') {
      if (operation.type === 'fixed') base.fixed += amount;
      if (operation.type === 'variable') base.variable += amount;
    }
    if (belongsToHouseholdFoodBudget(operation, reimbursablePeople)) base.food += amount;
  });
  return { ...base, balance: base.income + base.reimbursements - base.fixed - base.variable };
}

function normalizeRemoteState(remote) {
  return {
    operations: remote.operations.map(normalizeOperation),
    stores: remote.stores.map((store) => store.name),
    categories: mergeCategories(defaultState.categories, (remote.categories || []).map((category) => ({
      id: category.category_id,
      label: category.label,
      icon: category.icon || 'divers',
      type: category.type,
      custom: true,
    }))),
    savingsGoals: remote.savingsGoals.map((goal) => ({
      ...goal,
      target: Number(goal.target),
      saved: Number(goal.saved),
      monthlyAmount: Number(goal.monthly_amount || 0),
      standingOrderReference: goal.standing_order_reference || '',
      standingOrderDay: goal.standing_order_day || null,
      active: goal.active !== false,
    })),
    recurringFixedExpenses: (remote.recurringFixedExpenses || []).map((expense) => ({
      id: expense.id,
      label: expense.label,
      amount: Number(expense.amount),
      day: Number(expense.day),
      person: expense.person,
      category: expense.category,
      frequency: expense.frequency || 'monthly',
      startDate: expense.start_date || currentDate(),
      structuredCommunication: expense.structured_communication || '',
      directDebitReference: expense.direct_debit_reference || '',
      freeCommunication: expense.free_communication || '',
      freeCommunicationMode: expense.free_communication_mode || 'contains',
      paymentMethod: expense.payment_method || expense.paymentMethod || 'Compte Belfius',
      accountingNature: expense.accounting_nature || expense.accountingNature || accountingNature({ type: 'fixed', ...expense }),
    })),
  };
}

async function selectOperations(order = true) {
  let query = supabase
    .from('operations')
    .select(OPERATION_COLUMNS)
    .eq('household_id', householdId);

  if (order) query = query.order('date', { ascending: false });
  const result = await query;

  if (!isMissingPaymentColumn(result.error)) return result;

  let fallbackQuery = supabase
    .from('operations')
    .select(LEGACY_OPERATION_COLUMNS)
    .eq('household_id', householdId);

  if (order) fallbackQuery = fallbackQuery.order('date', { ascending: false });
  return fallbackQuery;
}

export default function App() {
  const [data, setData] = useState(loadState);
  const [activeView, setActiveView] = useState('home');
  const [bankSavings, setBankSavings] = useState({});
  const [belfiusSnapshot, setBelfiusSnapshot] = useState(null);
  const [monthEndAudit, setMonthEndAudit] = useState(null);
  const [monthEndAuditRunning, setMonthEndAuditRunning] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [draft, setDraft] = useState(makeEmptyOperation);
  const [recurringDraft, setRecurringDraft] = useState(makeEmptyRecurringFixedExpense);
  const [recurringEditingId, setRecurringEditingId] = useState(null);
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
  const [historyPaymentMethod, setHistoryPaymentMethod] = useState('all');
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [syncStatus, setSyncStatus] = useState(USE_REMOTE_BUDGET ? 'Synchronisation...' : 'Mode local');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => readOperationOutbox().length);
  const [operationStatus, setOperationStatus] = useState('');
  const [migrationStatus, setMigrationStatus] = useState('');
  const [recurringStatus, setRecurringStatus] = useState('');
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [remoteBudgetLoaded, setRemoteBudgetLoaded] = useState(!USE_REMOTE_BUDGET);
  const [budgetSettings, setBudgetSettings] = useState([{ effective_month: '2026-08', food_budget: FOOD_BUDGET }]);
  const [carePeople, setCarePeople] = useState(DEFAULT_CARE_PEOPLE.map((name) => ({ name, active: true, tracks_reimbursements: true, exclude_from_food_budget: true })));
  const automaticMonthEndAuditRef = useRef('');
  const activeViewRef = useRef(activeView);

  useEffect(() => {
    const updateConnectionState = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (!online) setSyncStatus('Hors connexion');
    };
    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);
    return () => {
      window.removeEventListener('online', updateConnectionState);
      window.removeEventListener('offline', updateConnectionState);
    };
  }, []);

  useEffect(() => {
    const removeObsoleteBelfiusShortcut = () => {
      document.querySelectorAll('button, a').forEach((element) => {
        if (element.textContent?.trim() === 'Rapprocher Belfius') {
          element.remove();
        }
      });
    };

    removeObsoleteBelfiusShortcut();
    const observer = new MutationObserver(removeObsoleteBelfiusShortcut);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    const existingBuckets = new Set((data.savingsGoals || []).map(savingsBucketForDisplay));
    const missing = REQUIRED_SAVINGS_GOALS.filter((goal) => !existingBuckets.has(goal.bucket));
    if (!missing.length || (USE_REMOTE_BUDGET && (!session || !remoteBudgetLoaded))) return;
    let cancelled = false;
    const ensure = async () => {
      if (USE_REMOTE_BUDGET) {
        const payload = missing.map((goal) => ({ household_id: householdId, label: goal.label, target: 0, saved: 0 }));
        const { data: rows, error } = await supabase.from('savings_goals').insert(payload).select('id, label, target, saved, bucket, monthly_amount, standing_order_reference, standing_order_day, active');
        if (cancelled || error || !rows?.length) return;
        setData((current) => {
          const nextData = { ...current, savingsGoals: [...current.savingsGoals, ...rows.map((row) => ({ ...row, target: Number(row.target), saved: Number(row.saved) }))] };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
          return nextData;
        });
      } else {
        setData((current) => {
          const nowExisting = new Set((current.savingsGoals || []).map(savingsBucketForDisplay));
          const additions = missing.filter((goal) => !nowExisting.has(goal.bucket)).map((goal) => ({ ...goal, id: `local-savings-${goal.bucket}` }));
          if (!additions.length) return current;
          const nextData = { ...current, savingsGoals: [...current.savingsGoals, ...additions] };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
          return nextData;
        });
      }
    };
    ensure();
    return () => { cancelled = true; };
  }, [data.savingsGoals.length, remoteBudgetLoaded, session]);

  const monthOperations = useMemo(
    () => data.operations.filter((operation) => {
      const accountingMonth = isMastercardPaymentMethod(operation.paymentMethod)
        ? (operation.settlementDate || operation.date).slice(0, 7)
        : operation.date.slice(0, 7);
      return accountingMonth === selectedMonth;
    }),
    [data.operations, selectedMonth],
  );

  const activeEntryCarePeople = useMemo(() => activeCarePeople(carePeople), [carePeople]);
  const reimbursablePeople = useMemo(() => reimbursementTrackedPeople(carePeople), [carePeople]);
  const beneficiaryOptions = useMemo(() => sortedBeneficiaryOptions(data.stores), [data.stores]);
  const recurringRecognition = useMemo(
    () => recurringRecognitionPresentation(recurringDraft.paymentMethod),
    [recurringDraft.paymentMethod],
  );
  const foodBudgetExcluded = useMemo(() => foodBudgetExcludedPeople(carePeople), [carePeople]);
  const availablePeople = useMemo(() => peopleOptions(activeEntryCarePeople), [activeEntryCarePeople]);
  const historyPeople = useMemo(() => peopleOptions([
    ...configuredCarePeople(carePeople),
    ...data.operations.map((operation) => operation.person),
  ]), [carePeople, data.operations]);
  const foodBudget = useMemo(() => foodBudgetForMonth(budgetSettings, selectedMonth), [budgetSettings, selectedMonth]);

  const today = currentDate();
  const endOfSelectedMonth = `${selectedMonth}-31`;
  const balanceCutoff = selectedMonth < today.slice(0, 7) ? endOfSelectedMonth : today;

  const effectiveMonthOperations = useMemo(
    () => monthOperations.filter((operation) => operation.date <= balanceCutoff),
    [balanceCutoff, monthOperations],
  );

  const totals = useMemo(() => {
    return calculateTotals(effectiveMonthOperations, foodBudgetExcluded);
  }, [effectiveMonthOperations, foodBudgetExcluded]);

  const fullMonthTotals = useMemo(() => {
    return calculateTotals(monthOperations, foodBudgetExcluded);
  }, [monthOperations, foodBudgetExcluded]);

  const previousMonthBalances = useMemo(() => {
    const firstDayOfSelectedMonth = `${selectedMonth}-01`;
    const previousOperations = data.operations.filter(
      (operation) => operation.date < firstDayOfSelectedMonth,
    );
    return calculatePaymentBalances(previousOperations);
  }, [data.operations, selectedMonth]);

  const previousMonthReport = useMemo(() => {
    const total = PAYMENT_METHODS.reduce(
      (sum, method) => sum + (previousMonthBalances[method] || 0),
      0,
    );
    return Math.max(total, 0);
  }, [previousMonthBalances]);

  const paymentBalances = useMemo(() => {
    const operationsUpToCutoff = data.operations.filter(
      (operation) => operation.date <= balanceCutoff,
    );
    return calculatePaymentBalances(operationsUpToCutoff);
  }, [balanceCutoff, data.operations]);

  const mastercardOutstanding = Math.max(0, -Number(paymentBalances[MASTERCARD_PAYMENT_METHOD] || 0));
  const mastercardNextDebitDate = useMemo(() => data.operations
    .filter((operation) => isMastercardPaymentMethod(operation.paymentMethod)
      && operation.settlementDate
      && operation.settlementDate >= today
      && operation.date <= balanceCutoff)
    .map((operation) => operation.settlementDate)
    .sort()[0] || '', [balanceCutoff, data.operations, today]);

  const liveBelfiusSnapshot = useMemo(
    () => calculateLiveBankSnapshot(belfiusSnapshot, data.operations, today),
    [belfiusSnapshot, data.operations, today],
  );

  const availableForPayments = useMemo(
    () => PAYMENT_METHODS.reduce((sum, method) => {
      if (method === MASTERCARD_PAYMENT_METHOD) return sum;
      if (method === 'Compte Belfius' && liveBelfiusSnapshot) {
        return sum + Number(liveBelfiusSnapshot.expectedBalance || 0);
      }
      return sum + Number(paymentBalances[method] || 0);
    }, 0),
    [liveBelfiusSnapshot, paymentBalances],
  );

  const scheduledExpenses = useMemo(() => {
    const explicitScheduledExpenses = monthOperations
      .filter((operation) => operation.type !== 'income' && operation.date > balanceCutoff);

    const existingFixedSignatures = new Set(
      monthOperations
        .filter((operation) => operation.type === 'fixed')
        .map(fixedExpenseSignature),
    );

    const recurringScheduledExpenses = (data.recurringFixedExpenses || [])
      .map((expense) => {
        const paymentMethod = expense.paymentMethod || expense.payment_method || 'Compte Belfius';
        const sourceMonth = recurringSourceMonthForBudget(paymentMethod, selectedMonth);
        if (!isRecurringDueInMonth(expense, sourceMonth)) return null;
        const purchaseDate = dateInMonth(sourceMonth, expense.day);
        const settlementDate = isMastercardPaymentMethod(paymentMethod)
          ? mastercardSettlementDate(purchaseDate)
          : '';
        return {
        id: `recurring-${expense.id}-${selectedMonth}`,
        date: purchaseDate,
        person: expense.person,
        type: 'fixed',
        category: expense.category,
        store: '',
        paymentMethod,
        settlementDate,
        label: expense.label,
        amount: Number(expense.amount) || 0,
        projectedRecurring: true,
        recurringExpenseId: expense.id,
        frequency: expense.frequency || 'monthly',
        accountingNature: expense.accountingNature || expense.accounting_nature || accountingNature({ type: 'fixed', ...expense }),
        };
      })
      .filter(Boolean)
      .filter((operation) => (
        (operation.settlementDate || operation.date) > balanceCutoff
        && (operation.settlementDate || operation.date).slice(0, 7) === selectedMonth
        && !existingFixedSignatures.has(fixedExpenseSignature(operation))
      ));

    return [...explicitScheduledExpenses, ...recurringScheduledExpenses]
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [
    balanceCutoff,
    data.recurringFixedExpenses,
    monthOperations,
    selectedMonth,
  ]);

  const scheduledExpenseTotal = useMemo(
    () => scheduledExpenses.filter(isBudgetExpense).reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
    [scheduledExpenses],
  );

  const scheduledSavingsTransferTotal = useMemo(
    () => scheduledExpenses.filter(isInternalTransfer).reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
    [scheduledExpenses],
  );

  const scheduledFoodTotal = useMemo(
    () => scheduledExpenses
      .filter((operation) => belongsToHouseholdFoodBudget(operation, foodBudgetExcluded))
      .reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
    [foodBudgetExcluded, scheduledExpenses],
  );

  const remainingFoodBudget = Math.max(foodBudget - totals.food - scheduledFoodTotal, 0);
  const totalRemainingToCover = scheduledExpenseTotal;
  const availableAfterPlannedExpenses = availableForPayments - totalRemainingToCover;
  const forecastStatus = availableAfterPlannedExpenses < 0
    ? { key: 'danger', label: 'Déficit prévisionnel' }
    : availableAfterPlannedExpenses < 50
      ? { key: 'warning', label: 'Marge de sécurité faible' }
      : availableAfterPlannedExpenses >= 500
        ? { key: 'excellent', label: 'Excédent confortable' }
        : { key: 'comfortable', label: 'Situation confortable' };

  const emergencyFundSaved = useMemo(() => {
    const goals = (data.savingsGoals || []).filter((goal) => savingsBucketForDisplay(goal) === 'urgence');
    return goals.reduce((highest, goal) => Math.max(highest, Number(goal.saved || 0)), 0);
  }, [data.savingsGoals]);

  const nextMonthIncomeReceived = useMemo(
    () => incomeReceivedForNextMonth(data.operations, selectedMonth),
    [data.operations, selectedMonth],
  );

  const currentPatrimony = useMemo(() => {
    const activeGoals = (data.savingsGoals || []).filter((goal) => goal.active !== false);
    const beobank = activeGoals
      .filter((goal) => savingsBucketForDisplay(goal) === 'vacances')
      .reduce((highest, goal) => Math.max(highest, Number(goal.saved || 0)), 0);
    const otherSavings = activeGoals
      .filter((goal) => savingsBucketForDisplay(goal) !== 'vacances')
      .reduce((sum, goal) => sum + Number(goal.saved || 0), 0);
    const mealVouchers = PAYMENT_METHODS
      .filter((method) => method.toLowerCase().includes('chèque'))
      .reduce((sum, method) => sum + Number(paymentBalances[method] || 0), 0);
    const belfius = Number(liveBelfiusSnapshot?.expectedBalance ?? paymentBalances['Compte Belfius'] ?? 0);
    return {
      belfius,
      beobank,
      otherSavings,
      mealVouchers,
      mastercard: mastercardOutstanding,
      net: belfius + beobank + otherSavings + mealVouchers - mastercardOutstanding,
    };
  }, [data.savingsGoals, liveBelfiusSnapshot, mastercardOutstanding, paymentBalances]);

  const budgetAnalysis = useMemo(() => analyzeBudget({
    operations: data.operations,
    selectedMonth,
    currentDate: today,
    forecastBalance: availableAfterPlannedExpenses,
    scheduledExpenseTotal,
    scheduledSavingsTransferTotal,
    remainingFoodBudget,
    emergencyFundSaved,
    openingBalance: belfiusSnapshot?.openingBalances?.[selectedMonth] != null || belfiusSnapshot?.openingMonth === selectedMonth
      ? Number(belfiusSnapshot?.openingBalances?.[selectedMonth] ?? belfiusSnapshot.openingBalance ?? 0)
        + PAYMENT_METHODS.filter((method) => method !== 'Compte Belfius' && method !== MASTERCARD_PAYMENT_METHOD)
          .reduce((sum, method) => sum + Number(previousMonthBalances[method] || 0), 0)
      : null,
  }), [
    availableAfterPlannedExpenses,
    data.operations,
    emergencyFundSaved,
    remainingFoodBudget,
    scheduledExpenseTotal,
    scheduledSavingsTransferTotal,
    selectedMonth,
    today,
    belfiusSnapshot?.openingBalance,
    belfiusSnapshot?.openingMonth,
    belfiusSnapshot?.openingBalances,
    previousMonthBalances,
  ]);

  const runMonthEndAudit = async () => {
    if (!USE_REMOTE_BUDGET || !session) return;
    setMonthEndAuditRunning(true);
    const { data: audit, error } = await supabase.rpc('run_month_end_audit', {
      p_household_id: householdId,
      p_month: selectedMonth,
    });
    if (error) {
      setSyncStatus(`Audit mensuel impossible : ${error.message}`);
    } else {
      setMonthEndAudit(audit);
      setSyncStatus('Clôture comptable mensuelle actualisée');
    }
    setMonthEndAuditRunning(false);
  };

  useEffect(() => {
    if (!USE_REMOTE_BUDGET || !session) return;
    let ignore = false;
    supabase.from('monthly_accounting_audits')
      .select('*')
      .eq('household_id', householdId)
      .eq('month', selectedMonth)
      .maybeSingle()
      .then(({ data: audit, error }) => {
        if (!ignore && !error) setMonthEndAudit(audit || null);
      });
    return () => { ignore = true; };
  }, [selectedMonth, session]);

  useEffect(() => {
    const automaticKey = `${householdId}:${today}`;
    if (!USE_REMOTE_BUDGET || !session || !remoteBudgetLoaded
      || selectedMonth !== today.slice(0, 7) || !isLastDayOfMonth(today)
      || automaticMonthEndAuditRef.current === automaticKey) return;
    automaticMonthEndAuditRef.current = automaticKey;
    runMonthEndAudit();
  }, [remoteBudgetLoaded, selectedMonth, session, today]);

  const editingOperation = useMemo(() => {
    return editingId ? data.operations.find((operation) => operation.id === editingId) : null;
  }, [data.operations, editingId]);

  const getAvailablePaymentBalance = (method, operationDate = draft.date) => {
    const operationsBeforePayment = data.operations.filter((operation) => {
      if (editingId && operation.id === editingId) return false;
      return operation.date <= operationDate;
    });

    return calculatePaymentBalances(operationsBeforePayment)[method] || 0;
  };

  const categoryTotals = useMemo(() => {
    return data.categories.map((category) => ({
      ...category,
      total: effectiveMonthOperations
        .filter((operation) => operation.category === category.id && operation.type !== 'income' && !isBelfiusAdjustment(operation))
        .reduce((sum, operation) => sum + Number(operation.amount), 0),
    }));
  }, [data.categories, effectiveMonthOperations]);

  const desktopDailySeries = useMemo(() => buildDailyBudgetSeries({
    operations: data.operations,
    selectedMonth,
    openingBalance: budgetAnalysis.current.openingBalance,
    throughDate: balanceCutoff,
    forecastBalance: budgetAnalysis.forecastBalance,
  }), [balanceCutoff, budgetAnalysis.current.openingBalance, budgetAnalysis.forecastBalance, data.operations, selectedMonth]);

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

      const effectiveReasons = reviewReasonsForOperation(operation, reasons);
      if (effectiveReasons.length > 0) alerts.set(operation.id, effectiveReasons);
      return alerts;
    }, new Map());
  }, [monthOperations]);

  const filteredMonthOperations = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    // L'Historique est le registre des écritures sauvegardées pour le mois choisi.
    // Une écriture future reste visible et est distinguée comme « Prévue » dans la liste.
    return monthOperations.filter((operation) => {
      const category = data.categories.find((item) => item.id === operation.category);
      const haystack = [
        operation.label,
        operation.person,
        operation.store,
        operation.paymentMethod,
        category?.label,
        operation.date,
      ].join(' ').toLowerCase();

      if (showReviewOnly && !reviewMap.has(operation.id)) return false;
      if (historyType !== 'all' && operation.type !== historyType) return false;
      if (historyPerson !== 'all' && operation.person !== historyPerson) return false;
      if (historyCategory !== 'all' && operation.category !== historyCategory) return false;
      if (historyPaymentMethod !== 'all' && (operation.paymentMethod || 'Compte Belfius') !== historyPaymentMethod) return false;
      if (search && !haystack.includes(search)) return false;
      return true;
    });
  }, [data.categories, historyCategory, historyPaymentMethod, historyPerson, historySearch, historyType, monthOperations, reviewMap, showReviewOnly]);

  const historyTotals = useMemo(() => {
    const filteredTotals = calculateTotals(filteredMonthOperations, foodBudgetExcluded);
    return {
      ...filteredTotals,
      expenses: filteredTotals.fixed + filteredTotals.variable,
    };
  }, [filteredMonthOperations, foodBudgetExcluded]);

  const desktopClosingChecks = useMemo(() => buildMonthClosingChecks({
    operations: data.operations,
    selectedMonth,
    snapshot: belfiusSnapshot,
    reviewCount: reviewMap.size,
    scheduledCount: scheduledExpenses.length,
    lastBackupAt: localStorage.getItem(LAST_BACKUP_STORAGE_KEY) || '',
    now: new Date(),
  }), [belfiusSnapshot, data.operations, reviewMap.size, scheduledExpenses.length, selectedMonth]);

  const foodRatio = foodBudget > 0 ? Math.min((totals.food / foodBudget) * 100, 100) : 100;
  const foodOverBudget = totals.food > foodBudget;
  const foodBudgetStatus = foodBudgetVisualStatus(totals.food, foodBudget);

  const annualReview = useMemo(() => {
    const selectedYear = selectedMonth.slice(0, 4);
    const previousYear = String(Number(selectedYear) - 1);
    const annualOperations = data.operations.filter((operation) => operation.date.startsWith(selectedYear));
    const previousOperations = data.operations.filter((operation) => operation.date.startsWith(previousYear));
    const annualTotals = calculateTotals(annualOperations, foodBudgetExcluded);
    const previousTotals = calculateTotals(previousOperations, foodBudgetExcluded);
    const annualExpenseTotal = annualTotals.fixed + annualTotals.variable;
    const previousExpenseTotal = previousTotals.fixed + previousTotals.variable;

    const months = MONTH_LABELS.map((label, index) => {
      const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
      const monthTotals = calculateTotals(data.operations.filter((operation) => operation.date.startsWith(monthKey)), foodBudgetExcluded);
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
        .filter((operation) => operation.category === category.id && operation.type !== 'income' && !isBelfiusAdjustment(operation))
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
      foodBudgetAnnual: annualFoodBudget(budgetSettings, selectedYear),
    };
  }, [budgetSettings, data.operations, data.categories, foodBudgetExcluded, selectedMonth]);

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
      const [operationsResult, storesResult, goalsResult, categoriesResult, recurringResult, snapshotResult, budgetSettingsResult, carePeopleResult] = await Promise.all([
        selectOperations(),
        supabase.from('stores').select('id, name').eq('household_id', householdId).order('name', { ascending: true }),
        supabase.from('savings_goals').select('id, label, target, saved, bucket, monthly_amount, standing_order_reference, standing_order_day, active').eq('household_id', householdId).order('created_at', { ascending: true }),
        supabase.from('categories').select('category_id, label, type, icon').eq('household_id', householdId).order('label', { ascending: true }),
        supabase.from('recurring_fixed_expenses').select('id, label, amount, day, person, category, frequency, start_date, direct_debit_reference, structured_communication, free_communication, free_communication_mode, payment_method, accounting_nature').eq('household_id', householdId).order('created_at', { ascending: true }),
        supabase.from('bank_snapshots').select('balance, balance_date, imported_at, pending_amount, remaining, confirmations, anomalies, clean, source_file, operation_state, opening_month, opening_balance, opening_balances, live_balance, live_balance_date, live_balance_source, live_operation_state').eq('household_id', householdId).maybeSingle(),
        supabase.from('household_budget_settings').select('effective_month, food_budget, updated_at').eq('household_id', householdId).order('effective_month', { ascending: true }),
        supabase.from('care_people').select('id, name, tracks_reimbursements, exclude_from_food_budget, active').eq('household_id', householdId).order('created_at', { ascending: true }),
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
          .select('id, label, target, saved, bucket, monthly_amount, standing_order_reference, standing_order_day, active');
        remoteGoals = insertedGoals || [];
      }

      mergeData(normalizeRemoteState({
        operations: operationsResult.data || [],
        stores: remoteStores,
        savingsGoals: remoteGoals,
        categories: categoriesResult.error ? [] : categoriesResult.data || [],
        recurringFixedExpenses: recurringResult.error ? data.recurringFixedExpenses || [] : recurringResult.data || [],
      }));
      if (!budgetSettingsResult.error && budgetSettingsResult.data?.length) setBudgetSettings(budgetSettingsResult.data);
      if (!carePeopleResult.error && carePeopleResult.data?.length) setCarePeople(carePeopleResult.data);
      setRemoteBudgetLoaded(true);
      if (!snapshotResult.error && snapshotResult.data) {
        if (snapshotResult.data.imported_at) {
          localStorage.setItem('mon-foyer-last-belfius-audit-at', snapshotResult.data.imported_at);
        }
        setBelfiusSnapshot({
          balance: Number(snapshotResult.data.balance || 0),
          balanceDate: snapshotResult.data.balance_date || '',
          importedAt: snapshotResult.data.imported_at || '',
          pendingAmount: Number(snapshotResult.data.pending_amount || 0),
          remaining: Number(snapshotResult.data.remaining || 0),
          confirmations: Number(snapshotResult.data.confirmations || 0),
          anomalies: Number(snapshotResult.data.anomalies || 0),
          clean: Boolean(snapshotResult.data.clean),
          sourceFile: snapshotResult.data.source_file || '',
          operationState: snapshotResult.data.operation_state || {},
          openingMonth: snapshotResult.data.opening_month || '',
          openingBalance: snapshotResult.data.opening_balance == null ? null : Number(snapshotResult.data.opening_balance),
          openingBalances: snapshotResult.data.opening_balances || {},
          liveBalance: snapshotResult.data.live_balance == null ? null : Number(snapshotResult.data.live_balance),
          liveBalanceDate: snapshotResult.data.live_balance_date || '',
          liveBalanceSource: snapshotResult.data.live_balance_source || '',
          liveOperationState: snapshotResult.data.live_operation_state || {},
        });
      }
      setSyncStatus('Synchronise avec Supabase');
    }

    async function flushPendingOperations() {
      const queue = readOperationOutbox();
      setPendingSyncCount(queue.length);
      if (!queue.length || !navigator.onLine) return queue.length === 0;

      setSyncStatus(`Envoi de ${queue.length} modification(s)...`);
      const remaining = [];
      for (const mutation of queue) {
        const { error } = mutation.action === 'delete'
          ? await supabase.from('operations').delete().eq('id', mutation.recordId).eq('household_id', householdId)
          : await supabase.from('operations').upsert(mutation.payload, { onConflict: 'id' });
        if (error) remaining.push(mutation);
      }

      writeOperationOutbox(remaining);
      setPendingSyncCount(remaining.length);
      setSyncStatus(remaining.length
        ? `${remaining.length} modification(s) toujours en attente`
        : 'Synchronisé avec Supabase');
      return remaining.length === 0;
    }

    async function initializeBudget() {
      await flushPendingOperations();
      await loadBudget();
    }
    initializeBudget();

    const channel = supabase
      .channel('budget-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operations' }, async () => {
        const { data: rows } = await selectOperations();
        if (rows) mergeData({ operations: rows.map(normalizeOperation) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, async () => {
        const { data: rows } = await supabase.from('stores').select('name').eq('household_id', householdId).order('name', { ascending: true });
        if (rows) mergeData({ stores: rows.map((row) => row.name) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings_goals' }, async () => {
        const { data: rows } = await supabase
          .from('savings_goals')
          .select('id, label, target, saved, bucket, monthly_amount, standing_order_reference, standing_order_day, active')
          .eq('household_id', householdId)
          .order('created_at', { ascending: true });
        if (rows) {
          mergeData({
            savingsGoals: rows.map((row) => ({ ...row, target: Number(row.target), saved: Number(row.saved), monthlyAmount: Number(row.monthly_amount || 0), standingOrderReference: row.standing_order_reference || '', standingOrderDay: row.standing_order_day || null, active: row.active !== false })),
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_budget_settings' }, async () => {
        const { data: rows } = await supabase.from('household_budget_settings').select('effective_month, food_budget, updated_at').eq('household_id', householdId).order('effective_month', { ascending: true });
        if (rows?.length) setBudgetSettings(rows);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'care_people' }, async () => {
        const { data: rows } = await supabase.from('care_people').select('id, name, tracks_reimbursements, exclude_from_food_budget, active').eq('household_id', householdId).order('created_at', { ascending: true });
        if (rows?.length) setCarePeople(rows);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, async () => {
        const { data: rows } = await supabase
          .from('categories')
          .select('category_id, label, type, icon')
          .eq('household_id', householdId)
          .order('label', { ascending: true });
        if (rows) {
          mergeData({
            categories: mergeCategories(defaultState.categories, rows.map((category) => ({
              id: category.category_id,
              label: category.label,
              icon: category.icon || 'divers',
              type: category.type,
              custom: true,
            }))),
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_fixed_expenses' }, async () => {
        const { data: rows } = await supabase
          .from('recurring_fixed_expenses')
          .select('id, label, amount, day, person, category, frequency, start_date, direct_debit_reference, structured_communication, free_communication, free_communication_mode, payment_method, accounting_nature')
          .eq('household_id', householdId)
          .order('created_at', { ascending: true });
        if (rows) {
          mergeData({
            recurringFixedExpenses: rows.map((expense) => ({
              ...expense,
              amount: Number(expense.amount),
              day: Number(expense.day),
              directDebitReference: expense.direct_debit_reference || '',
              structuredCommunication: expense.structured_communication || '',
              freeCommunication: expense.free_communication || '',
              freeCommunicationMode: expense.free_communication_mode || 'contains',
              paymentMethod: expense.payment_method || 'Compte Belfius',
              accountingNature: expense.accounting_nature || accountingNature({ type: 'fixed', ...expense }),
            })),
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSyncStatus('Synchronisé avec Supabase');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSyncStatus('Synchronisation interrompue');
        }
      });

    const refreshWhenActive = async () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return;
      setSyncStatus('Synchronisation...');
      await flushPendingOperations();
      await loadBudget();
    };
    window.addEventListener('online', refreshWhenActive);
    window.addEventListener('focus', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);

    return () => {
      ignore = true;
      window.removeEventListener('online', refreshWhenActive);
      window.removeEventListener('focus', refreshWhenActive);
      document.removeEventListener('visibilitychange', refreshWhenActive);
      supabase.removeChannel(channel);
    };
  }, [session]);

  const findMatchingRecurringExpense = (operation) => {
    return (data.recurringFixedExpenses || []).find((expense) => (
      expense.label.trim().toLowerCase() === operation.label.trim().toLowerCase()
      && expense.person === operation.person
      && expense.category === operation.category
    ));
  };

  const saveRecurringExpenseFromOperation = async (operation) => {
    if (operation.recurrence === 'once' || operation.type === 'income') return null;

    const day = Math.min(Math.max(Number(operation.recurringDay) || 1, 1), 31);
    const existing = operation.recurringId
      ? (data.recurringFixedExpenses || []).find((expense) => expense.id === operation.recurringId)
      : findMatchingRecurringExpense(operation);

    const recurringExpense = {
      id: existing?.id || crypto.randomUUID(),
      label: operation.label.trim(),
      amount: Number(operation.amount),
      day,
      person: operation.person,
      category: operation.category,
      frequency: operation.recurrence || 'monthly',
      startDate: operation.date,
      directDebitReference: operation.directDebitReference ?? existing?.directDebitReference ?? existing?.direct_debit_reference ?? '',
      structuredCommunication: operation.structuredCommunication ?? existing?.structuredCommunication ?? existing?.structured_communication ?? '',
      freeCommunication: operation.freeCommunication ?? existing?.freeCommunication ?? existing?.free_communication ?? '',
      freeCommunicationMode: operation.freeCommunicationMode || existing?.freeCommunicationMode || existing?.free_communication_mode || 'contains',
      paymentMethod: operation.paymentMethod || existing?.paymentMethod || existing?.payment_method || 'Compte Belfius',
      accountingNature: operation.accountingNature || existing?.accountingNature || existing?.accounting_nature || accountingNature(operation),
    };

    if (USE_REMOTE_BUDGET) {
      const payload = {
        household_id: householdId,
        label: recurringExpense.label,
        amount: recurringExpense.amount,
        day: recurringExpense.day,
        person: recurringExpense.person,
        category: recurringExpense.category,
        frequency: recurringExpense.frequency,
        start_date: recurringExpense.startDate,
        direct_debit_reference: recurringExpense.directDebitReference || null,
        structured_communication: recurringExpense.structuredCommunication || null,
        free_communication: recurringExpense.freeCommunication || null,
        free_communication_mode: recurringExpense.freeCommunicationMode || 'contains',
        payment_method: recurringExpense.paymentMethod,
        accounting_nature: recurringExpense.accountingNature,
      };

      const query = existing
        ? supabase.from('recurring_fixed_expenses').update(payload).eq('id', existing.id).eq('household_id', householdId)
        : supabase.from('recurring_fixed_expenses').insert(payload);

      const { data: savedRows, error } = await query.select('id, label, amount, day, person, category, frequency, start_date, direct_debit_reference, structured_communication, free_communication, free_communication_mode, payment_method, accounting_nature');
      if (error) throw new Error(formatSupabaseRecurringError(error));
      const saved = savedRows?.[0];
      if (saved) {
        recurringExpense.id = saved.id;
        recurringExpense.amount = Number(saved.amount);
        recurringExpense.day = Number(saved.day);
        recurringExpense.paymentMethod = saved.payment_method || 'Compte Belfius';
      }
    }

    return recurringExpense;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = parseDecimal(draft.amount);
    if (!draft.label.trim() || !amount) return;

    setOperationStatus('');
    const savingsSourceGoal = draft.type === 'income' && draft.savingsSource ? data.savingsGoals.find((goal) => goal.id === draft.savingsSource) : null;
    const savingsTargetGoal = draft.type === 'savings_transfer' && draft.savingsGoalId ? data.savingsGoals.find((goal) => goal.id === draft.savingsGoalId) : null;
    if (savingsSourceGoal && amount > Number(savingsSourceGoal.saved || 0)) { setOperationStatus('Épargne insuffisante : solde disponible ' + formatCurrency(savingsSourceGoal.saved) + '.'); return; }
    if (draft.type === 'savings_transfer' && !savingsTargetGoal) { setOperationStatus('Choisis le poste d’épargne à créditer.'); return; }
    if (operationRequiresStore(draft.type) && !draft.store) {
      setOperationStatus('Choisis un bénéficiaire ou un point de vente.');
      return;
    }

    if (draft.recurrence !== 'once' && draft.type !== 'income' && !draft.recurringId) {
      const recurringCandidate = {
        label: draft.label.trim(),
        amount,
        day: Math.min(Math.max(Number(draft.recurringDay) || 1, 1), 31),
        person: draft.person,
        category: draft.category,
        frequency: draft.recurrence,
      };
      const identicalRecurring = (data.recurringFixedExpenses || []).find(
        (expense) => recurringExpenseSignature(expense) === recurringExpenseSignature(recurringCandidate),
      );

      if (identicalRecurring) {
        const category = data.categories.find((item) => item.id === identicalRecurring.category);
        setOperationStatus(
          'Attention : cette dépense récurrente existe déjà — '
          + identicalRecurring.label + ', '
          + formatCurrency(identicalRecurring.amount) + ', jour '
          + identicalRecurring.day + ', '
          + (category?.label || 'Frais fixe') + ', '
          + identicalRecurring.person + '.',
        );
        return;
      }
    }

    const operation = {
      ...draft,
      amount,
      label: savingsSourceGoal
        ? `Transfert depuis épargne — ${savingsSourceGoal.label} · ${draft.label.trim()}`
        : savingsTargetGoal
          ? `Transfert vers épargne — ${savingsTargetGoal.label} · ${draft.label.trim()}`
          : draft.label.trim(),
      // La source d'un remboursement est portée par « Personne » ; seuls les achats
      // et frais ordinaires nécessitent un bénéficiaire / point de vente distinct.
      store: operationStoreValue(draft.type, draft.store),
      category: draft.type === 'income'
        ? 'revenus'
        : ['savings_transfer', 'card_settlement'].includes(draft.type) ? 'divers' : draft.category,
      paymentMethod: ['savings_transfer', 'card_settlement'].includes(draft.type)
        ? 'Compte Belfius'
        : draft.paymentMethod || 'Compte Belfius',
      settlesPaymentMethod: draft.type === 'card_settlement' ? MASTERCARD_PAYMENT_METHOD : '',
      settlementDate: isMastercardPaymentMethod(draft.paymentMethod)
        ? (draft.settlementDate || mastercardSettlementDate(draft.date))
        : '',
      savingsGoalId: savingsSourceGoal?.id || savingsTargetGoal?.id || '',
      savingsDirection: savingsSourceGoal ? 'out' : savingsTargetGoal ? 'in' : '',
      id: editingId || crypto.randomUUID(),
    };
    if (isMastercardPaymentMethod(operation.paymentMethod) && operation.settlementDate) {
      operation.budgetMonth = operation.settlementDate.slice(0, 7);
    }
    delete operation.recurrence;
    delete operation.recurringDay;
    delete operation.recurringId;
    delete operation.savingsSource;

    const previousReviewStatus = normalizeReviewStatus(editingOperation?.reviewStatus);
    operation.reviewStatus = normalizeReviewStatus(operation.reviewStatus);
    if (operation.reviewStatus === OPERATION_REVIEW_STATUSES.DISPUTED
      && !String(operation.reviewNote || '').trim()
      && !String(operation.disputeReference || '').trim()) {
      setOperationStatus('Pour une contestation, indique au moins une note ou la référence du dossier bancaire.');
      return;
    }
    if (operation.reviewStatus !== previousReviewStatus) {
      operation.reviewedAt = new Date().toISOString();
      operation.reviewedBy = session?.user?.email || 'Utilisateur Mon Foyer';
      operation.resolvedAt = operation.reviewStatus === OPERATION_REVIEW_STATUSES.RESOLVED
        ? operation.reviewedAt
        : '';
    }

    if (operation.type !== 'income' && !canPaymentMethodGoNegative(operation.paymentMethod)) {
      const availableBalance = getAvailablePaymentBalance(operation.paymentMethod, operation.date);
      if (amount > availableBalance) {
        setOperationStatus(`${operation.paymentMethod}: solde disponible ${formatCurrency(availableBalance)}. Paiement impossible.`);
        return;
      }
    }

    const duplicate = findPotentialOperationDuplicate(operation, data.operations, editingId || '');
    if (duplicate) {
      const existing = duplicate.operation;
      const duplicateKind = duplicate.confidence === 'exact' ? 'exact' : 'probable';
      const proceed = window.confirm(
        `Attention : doublon ${duplicateKind} détecté.\n\n`
        + `${existing.date} · ${existing.store || existing.label}\n`
        + `${formatCurrency(existing.amount)} · ${existing.person || 'Foyer'} · ${existing.paymentMethod || 'Compte Belfius'}\n\n`
        + 'Annuler : revenir à la saisie.\n'
        + 'OK : enregistrer quand même cette nouvelle opération.',
      );
      if (!proceed) {
        setOperationStatus('Enregistrement annulé : doublon potentiel détecté.');
        return;
      }
    }

    if (isSupabaseConfigured && !householdId) {
      setOperationStatus("Foyer non configuré: VITE_HOUSEHOLD_ID est manquant.");
      return;
    }

    if (USE_REMOTE_BUDGET) {
      const payload = {
        id: operation.id,
        household_id: householdId,
        date: operation.date,
        person: operation.person,
        type: operation.type,
        category: operation.category,
        store: operation.store || null,
        label: operation.label,
        amount: operation.amount,
        payment_method: operation.paymentMethod,
        settles_payment_method: operation.settlesPaymentMethod || null,
        settlement_date: operation.settlementDate || null,
        savings_goal_id: operation.savingsGoalId || null,
        savings_direction: operation.savingsDirection || null,
        accounting_nature: accountingNature(operation),
        budget_month: operation.type === 'income' || isMastercardPaymentMethod(operation.paymentMethod)
          ? (operation.budgetMonth || operation.date.slice(0, 7))
          : null,
        income_kind: operation.type === 'income' ? (operation.incomeKind || 'other') : null,
        income_source: operation.type === 'income' ? (operation.incomeSource || null) : null,
        review_status: operation.reviewStatus,
        review_note: operation.reviewNote || null,
        reviewed_by: operation.reviewedBy || null,
        reviewed_at: operation.reviewedAt || null,
        dispute_reference: operation.disputeReference || null,
        resolved_at: operation.resolvedAt || null,
      };
      const mutation = {
        recordId: operation.id,
        action: 'upsert',
        payload,
        queuedAt: new Date().toISOString(),
      };
      const canQueueOperation = draft.recurrence === 'once' && !savingsSourceGoal;

      if (!navigator.onLine) {
        if (!canQueueOperation) {
          setOperationStatus('Cette opération liée à une récurrence ou à l’épargne nécessite une connexion Internet.');
          return;
        }
        const queue = enqueueOperationMutation(mutation);
        setPendingSyncCount(queue.length);
        setOperationStatus('Opération conservée sur cet appareil · envoi automatique dès le retour d’Internet.');
      } else {
        const { data: savedOperation, error } = editingId
          ? await supabase
            .from('operations')
            .update(payload)
            .eq('id', editingId)
            .select(OPERATION_COLUMNS)
            .single()
          : await supabase
            .from('operations')
            .insert(payload)
            .select(OPERATION_COLUMNS)
            .single();

        if (error) {
          if (!canQueueOperation || !isRetryableSyncError(error)) {
            setOperationStatus(formatSupabaseOperationError(error));
            return;
          }
          const queue = enqueueOperationMutation(mutation);
          setPendingSyncCount(queue.length);
          setOperationStatus('Connexion interrompue · opération conservée pour un nouvel envoi automatique.');
        } else {
          Object.assign(operation, normalizeOperation(savedOperation));
          setOperationStatus('Opération envoyée vers Supabase.');
        }
      }
    } else if (isSupabaseConfigured) {
      setOperationStatus('Mode local: redémarre Vite pour relire le fichier .env.');
      return;
    }

    const operations = editingId
      ? data.operations.map((item) => (item.id === editingId ? operation : item))
      : [operation, ...data.operations];

    let recurringFixedExpenses = data.recurringFixedExpenses || [];
    if (draft.recurrence !== 'once' && operation.type !== 'income') {
      try {
        const savedRecurring = await saveRecurringExpenseFromOperation({
          ...operation,
          recurrence: draft.recurrence,
          recurringDay: draft.recurringDay,
          recurringId: draft.recurringId,
          structuredCommunication: draft.structuredCommunication || '',
          freeCommunication: draft.freeCommunication || '',
          freeCommunicationMode: draft.freeCommunicationMode || 'contains',
        });
        if (savedRecurring) {
          const exists = recurringFixedExpenses.some((expense) => expense.id === savedRecurring.id);
          recurringFixedExpenses = exists
            ? recurringFixedExpenses.map((expense) => (expense.id === savedRecurring.id ? savedRecurring : expense))
            : [...recurringFixedExpenses, savedRecurring];
          setOperationStatus(editingId ? 'Opération et récurrence mises à jour.' : 'Opération et récurrence enregistrées.');
        }
      } catch (error) {
        setOperationStatus(error.message || 'La récurrence n’a pas pu être enregistrée.');
        return;
      }
    }

    const savingsGoals = applySavingsOperationChange(data.savingsGoals, editingOperation, operation);
    saveData({ ...data, operations, recurringFixedExpenses, savingsGoals });
    setDraft(makeEmptyOperation());
    setEditingId(null);
    if (!USE_REMOTE_BUDGET) setActiveView('history');
  };

  const editOperation = (operation) => {
    const recurringExpense = findMatchingRecurringExpense(operation);
    setDraft({
      ...operation,
      amount: String(operation.amount),
      recurrence: recurringExpense?.frequency || 'once',
      recurringDay: recurringExpense?.day || Number(operation.date.slice(8, 10)),
      recurringId: recurringExpense?.id || '',
      structuredCommunication: recurringExpense?.structuredCommunication || recurringExpense?.structured_communication || '',
      freeCommunication: recurringExpense?.freeCommunication || recurringExpense?.free_communication || '',
      freeCommunicationMode: recurringExpense?.freeCommunicationMode || recurringExpense?.free_communication_mode || 'contains',
      savingsSource: operation.savingsDirection === 'out' ? operation.savingsGoalId : '',
    });
    setEditingId(operation.id);
    setActiveView('add');
  };

  const cancelOperationDraft = () => {
    setDraft(makeEmptyOperation());
    setEditingId(null);
    setOperationStatus('Saisie effacée. Aucune opération n’a été enregistrée.');
  };


  const addBankOperationFromAudit = (bankRow) => {
    const label = String(bankRow?.label || 'Opération Belfius');
    const normalized = label.toLowerCase();
    const amount = Math.abs(Number(bankRow?.amount || 0));
    const bankCommunication = String(bankRow?.communication || bankRow?.details || '');
    const normalizedBankCommunication = bankCommunication.toLowerCase();
    const isMastercardStatement = isMastercardStatementCommunication(`${label} ${bankCommunication}`);
    const bankDigits = bankCommunication.replace(/\D/g, '');

    // RC2.4.4 : si Belfius correspond déjà à un frais récurrent connu, le crayon
    // ouvre directement ce frais au lieu de proposer artificiellement une dépense variable.
    const recurringCandidate = Number(bankRow?.amount || 0) < 0
      ? (data.recurringFixedExpenses || []).find((expense) => {
        if (Math.abs(Math.abs(Number(expense.amount) || 0) - amount) > 0.05) return false;
        const structured = String(expense.structuredCommunication || expense.structured_communication || '').replace(/\D/g, '');
        const free = String(expense.freeCommunication || expense.free_communication || '').trim().toLowerCase();
        const mode = expense.freeCommunicationMode || expense.free_communication_mode || 'contains';
        const structuredMatches = structured && bankDigits.includes(structured);
        const freeMatches = free && (mode === 'exact'
          ? normalizedBankCommunication.trim() === free
          : normalizedBankCommunication.includes(free));
        return structuredMatches || freeMatches;
      })
      : null;

    let category = recurringCandidate?.category || 'divers';
    if (!recurringCandidate) {
      if (normalized.includes('lanza michel')) category = 'coiffeur';
      else if (normalized.includes('dats24') || normalized.includes('q8') || normalized.includes('total')) category = 'carburant';
      else if (normalized.includes('delhaize') || normalized.includes('lidl') || normalized.includes('carrefour') || normalized.includes('colruyt')) category = 'nourriture';
      else if (normalized.includes('ethias') && amount > 500) category = 'emprunt_maison';
    }

    setDraft({
      ...makeEmptyOperation(),
      date: bankRow?.date || currentDate(),
      type: Number(bankRow?.amount || 0) > 0 ? 'income' : isMastercardStatement ? 'card_settlement' : recurringCandidate ? 'fixed' : 'variable',
      category: Number(bankRow?.amount || 0) > 0 ? 'revenus' : (bankRow?.learnedSuggestion?.category || category),
      store: bankRow?.learnedSuggestion?.store || label,
      paymentMethod: 'Compte Belfius',
      person: bankRow?.learnedSuggestion?.person || 'Foyer',
      label: isMastercardStatement ? 'Règlement Mastercard' : recurringCandidate?.label || bankRow?.learnedSuggestion?.label || (normalized.includes('lanza michel') ? 'Coiffeur' : label),
      amount,
      recurrence: recurringCandidate?.frequency || 'once',
      recurringDay: recurringCandidate?.day || Number(String(bankRow?.date || currentDate()).slice(8, 10)),
      recurringId: recurringCandidate?.id || '',
      structuredCommunication: recurringCandidate?.structuredCommunication || recurringCandidate?.structured_communication || '',
      freeCommunication: recurringCandidate?.freeCommunication || recurringCandidate?.free_communication || '',
      freeCommunicationMode: recurringCandidate?.freeCommunicationMode || recurringCandidate?.free_communication_mode || 'contains',
    });
    setOperationStatus(isMastercardStatement
      ? 'Décompte Mastercard reconnu par sa référence Belfius : vérifie le montant puis enregistre le règlement.'
      : recurringCandidate
      ? 'Frais récurrent Belfius reconnu : vérifie les données puis enregistre cette opération.'
      : 'Opération Belfius préremplie : complète ou corrige les informations avant enregistrement.');
    setEditingId(null);
    setActiveView('add');
  };

  const deleteOperation = async (id) => {
    if (!window.confirm('Supprimer cette opération ?')) return;

    if (USE_REMOTE_BUDGET) {
      if (!navigator.onLine) {
        const queue = enqueueOperationMutation({
          recordId: id,
          action: 'delete',
          queuedAt: new Date().toISOString(),
        });
        setPendingSyncCount(queue.length);
        setSyncStatus('Suppression conservée · envoi automatique dès le retour d’Internet');
      } else {
        const { error } = await supabase.from('operations').delete().eq('id', id).eq('household_id', householdId);
        if (error) {
          if (!isRetryableSyncError(error)) {
            setSyncStatus(`Suppression impossible: ${error.message}`);
            return;
          }
          const queue = enqueueOperationMutation({
            recordId: id,
            action: 'delete',
            queuedAt: new Date().toISOString(),
          });
          setPendingSyncCount(queue.length);
        }
      }
    }
    const deletedOperation = data.operations.find((operation) => operation.id === id);
    saveData({
      ...data,
      operations: data.operations.filter((operation) => operation.id !== id),
      savingsGoals: applySavingsOperationChange(data.savingsGoals, deletedOperation, null),
    });
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

  const addCategory = async () => {
    const label = newCategory.trim();
    if (!label) return;

    const id = makeCategoryId(label);
    if (data.categories.some((category) => category.id === id || category.label.toLowerCase() === label.toLowerCase())) {
      setCategoryStatus('Ce type de frais existe déjà.');
      return;
    }

    const category = {
      id,
      label,
      icon: 'divers',
      type: newCategoryType,
      custom: true,
    };

    if (USE_REMOTE_BUDGET) {
      const { error } = await supabase.from('categories').insert({
        household_id: householdId,
        category_id: category.id,
        label: category.label,
        type: category.type,
        icon: category.icon,
      });

      if (error) {
        setCategoryStatus(formatSupabaseCategoryError(error));
        return;
      }
    }

    saveData({
      ...data,
      categories: sortCategories([...data.categories, category]),
    });
    setNewCategory('');
    setNewCategoryType('variable');
    setCategoryStatus('Type de frais ajouté.');
  };

  const deleteCategory = async (category) => {
    if (!category.custom) {
      setCategoryStatus('Les types de frais standard ne peuvent pas être supprimés.');
      return;
    }

    if (data.operations.some((operation) => operation.category === category.id)) {
      setCategoryStatus('Ce type de frais est utilisé dans l’historique.');
      return;
    }

    if (!window.confirm(`Supprimer le type de frais "${category.label}" ?`)) return;
    if (USE_REMOTE_BUDGET) {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('household_id', householdId)
        .eq('category_id', category.id);

      if (error) {
        setCategoryStatus(`Suppression impossible: ${error.message}`);
        return;
      }
    }

    saveData({
      ...data,
      categories: sortCategories(data.categories.filter((item) => item.id !== category.id)),
    });
    setCategoryStatus('Type de frais supprimé.');
  };

  const updateGoal = async (id, field, value) => {
    const numericValue = parseDecimal(value);
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

  const editRecurringFixedExpense = (expense) => {
    setRecurringEditingId(expense.id);
    setRecurringDraft({
      label: expense.label,
      amount: String(expense.amount ?? ''),
      day: expense.day || 1,
      frequency: expense.frequency || 'monthly',
      startDate: expense.startDate || expense.start_date || currentDate(),
      person: expense.person || 'Foyer',
      category: expense.category || 'habitation',
      directDebitReference: expense.directDebitReference || expense.direct_debit_reference || '',
      structuredCommunication: expense.structuredCommunication || expense.structured_communication || '',
      freeCommunication: expense.freeCommunication || expense.free_communication || '',
      freeCommunicationMode: expense.freeCommunicationMode || expense.free_communication_mode || 'contains',
      paymentMethod: expense.paymentMethod || expense.payment_method || 'Compte Belfius',
    });
    setRecurringStatus('Modification du frais récurrent en cours.');
    window.setTimeout(() => {
      const form = document.querySelector('.recurring-form');
      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form?.querySelector('input')?.focus({ preventScroll: true });
    }, 80);
  };

  const addRecurringFixedExpense = async (event) => {
    event.preventDefault();
    const amount = parseDecimal(recurringDraft.amount);
    const label = recurringDraft.label.trim();

    if (!label || !amount) {
      setRecurringStatus('Indique un libellé et un montant.');
      return;
    }

    let fixedExpense = {
      id: recurringEditingId || crypto.randomUUID(),
      label,
      amount,
      day: Math.min(Math.max(Number(recurringDraft.day) || 1, 1), 31),
      person: recurringDraft.person,
      category: recurringDraft.category,
      frequency: recurringDraft.frequency || 'monthly',
      startDate: recurringDraft.startDate || currentDate(),
      directDebitReference: String(recurringDraft.directDebitReference || '').trim(),
      structuredCommunication: recurringStructuredCommunication(
        recurringDraft.paymentMethod,
        recurringDraft.structuredCommunication,
      ),
      freeCommunication: String(recurringDraft.freeCommunication || '').trim(),
      freeCommunicationMode: recurringDraft.freeCommunicationMode || 'contains',
      paymentMethod: recurringDraft.paymentMethod || 'Compte Belfius',
      accountingNature: recurringDraft.accountingNature || accountingNature({ type: 'fixed', ...recurringDraft }),
    };

    const identicalRecurring = (data.recurringFixedExpenses || []).find(
      (expense) => expense.id !== recurringEditingId
        && recurringExpenseSignature(expense) === recurringExpenseSignature(fixedExpense),
    );

    if (identicalRecurring) {
      const category = data.categories.find((item) => item.id === identicalRecurring.category);
      setRecurringStatus(
        'Attention : cette récurrence existe déjà — ' + identicalRecurring.label + ', '
        + formatCurrency(identicalRecurring.amount) + ', jour ' + identicalRecurring.day + ', '
        + (category?.label || 'Frais fixe') + ', ' + identicalRecurring.person + '.',
      );
      return;
    }

    if (USE_REMOTE_BUDGET) {
      const payload = {
        household_id: householdId,
        label: fixedExpense.label,
        amount: fixedExpense.amount,
        day: fixedExpense.day,
        person: fixedExpense.person,
        category: fixedExpense.category,
        frequency: fixedExpense.frequency,
        start_date: fixedExpense.startDate,
        direct_debit_reference: fixedExpense.directDebitReference || null,
        structured_communication: fixedExpense.structuredCommunication || null,
        free_communication: fixedExpense.freeCommunication || null,
        free_communication_mode: fixedExpense.freeCommunicationMode || 'contains',
        payment_method: fixedExpense.paymentMethod,
        accounting_nature: fixedExpense.accountingNature,
      };

      const query = recurringEditingId
        ? supabase
          .from('recurring_fixed_expenses')
          .update(payload)
          .eq('id', recurringEditingId)
          .eq('household_id', householdId)
          .select('id, label, amount, day, person, category, frequency, start_date, direct_debit_reference, structured_communication, free_communication, free_communication_mode, payment_method, accounting_nature')
          .single()
        : supabase
          .from('recurring_fixed_expenses')
          .insert(payload)
          .select('id, label, amount, day, person, category, frequency, start_date, direct_debit_reference, structured_communication, free_communication, free_communication_mode, payment_method, accounting_nature')
          .single();

      const { data: savedExpense, error } = await query;

      if (error) {
        setRecurringStatus(formatSupabaseRecurringError(error));
        return;
      }

      fixedExpense = {
        id: savedExpense.id,
        label: savedExpense.label,
        amount: Number(savedExpense.amount),
        day: Number(savedExpense.day),
        person: savedExpense.person,
        category: savedExpense.category,
        frequency: savedExpense.frequency || 'monthly',
        startDate: savedExpense.start_date || currentDate(),
        structuredCommunication: savedExpense.structured_communication || '',
        directDebitReference: savedExpense.direct_debit_reference || '',
        freeCommunication: savedExpense.free_communication || '',
        freeCommunicationMode: savedExpense.free_communication_mode || 'contains',
        paymentMethod: savedExpense.payment_method || 'Compte Belfius',
        accountingNature: savedExpense.accounting_nature || accountingNature({ type: 'fixed', ...savedExpense }),
      };
    }

    const currentExpenses = data.recurringFixedExpenses || [];
    const nextExpenses = recurringEditingId
      ? currentExpenses.map((expense) => (expense.id === recurringEditingId ? fixedExpense : expense))
      : [...currentExpenses, fixedExpense];

    saveData({
      ...data,
      recurringFixedExpenses: nextExpenses,
    });
    setRecurringDraft(makeEmptyRecurringFixedExpense());
    setRecurringEditingId(null);
    setRecurringStatus(recurringEditingId ? 'Frais fixe récurrent modifié.' : 'Frais fixe récurrent ajouté.');
  };

  const deleteRecurringFixedExpense = async (id) => {
    if (!window.confirm('Supprimer ce frais fixe récurrent ?')) return;

    if (USE_REMOTE_BUDGET) {
      const { error } = await supabase
        .from('recurring_fixed_expenses')
        .delete()
        .eq('id', id)
        .eq('household_id', householdId);

      if (error) {
        setRecurringStatus(`Suppression impossible: ${error.message}`);
        return;
      }
    }

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
        paymentMethod: expense.paymentMethod || expense.payment_method || 'Compte Belfius',
        settlementDate: isMastercardPaymentMethod(expense.paymentMethod || expense.payment_method)
          ? mastercardSettlementDate(dateInMonth(selectedMonth, expense.day))
          : '',
        label: expense.label,
        amount: parseDecimal(expense.amount),
        accountingNature: expense.accountingNature || expense.accounting_nature || accountingNature({ type: 'fixed', ...expense }),
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
        payment_method: operation.paymentMethod || 'Compte Belfius',
        settlement_date: operation.settlementDate || null,
        budget_month: isMastercardPaymentMethod(operation.paymentMethod)
          ? (operation.settlementDate || operation.date).slice(0, 7)
          : null,
        label: operation.label,
        amount: operation.amount,
        accounting_nature: operation.accountingNature,
      }));

      const { data: insertedRows, error } = await supabase
        .from('operations')
        .insert(payload)
        .select(OPERATION_COLUMNS);

      if (error) {
        setRecurringStatus(isMissingPaymentColumn(error) ? "Generation impossible: lance le script supabase-payment-method.sql dans Supabase." : `Generation impossible: ${error.message}`);
        return;
      }

      savedOperations = (insertedRows || []).map(normalizeOperation);
    }

    saveData({
      ...data,
      operations: [...savedOperations, ...data.operations],
    });
    setRecurringStatus(`${savedOperations.length} frais fixe(s) ajoute(s) pour ${selectedMonth}.`);
  };

  const handleBankSavingsDetected = (detection, auditMeta = {}) => {
    const totals = detection?.totals || detection || {};
    const transfers = detection?.transfers || [];
    setBankSavings(totals);
    if (!transfers.length) return;

    let applied = {};
    try { applied = JSON.parse(localStorage.getItem(APPLIED_SAVINGS_STORAGE_KEY) || '{}'); } catch { applied = {}; }

    // RC2.4.6 : le CSV Belfius identifie les transferts, mais ne connait pas le solde reel
    // du compte d'epargne externe (ex. Beobank). Au premier releve observe, on etablit
    // uniquement une ligne de base : l'historique est memorise sans modifier le solde.
    if (Object.keys(applied).length === 0) {
      transfers.forEach((transfer) => {
        applied[transfer.fingerprint] = {
          bucket: transfer.bucket,
          amount: transfer.amount,
          appliedAt: new Date().toISOString(),
          source: auditMeta.fileName || 'Belfius CSV',
          baseline: true,
        };
      });
      localStorage.setItem(APPLIED_SAVINGS_STORAGE_KEY, JSON.stringify(applied));
      return;
    }

    const freshTransfers = transfers.filter((transfer) => !applied[transfer.fingerprint]);
    if (!freshTransfers.length) return;

    const confirmedManualTransfers = freshTransfers.filter((transfer) => data.operations.some((operation) => {
      const goalId = operation.savingsGoalId || operation.savings_goal_id;
      const goal = data.savingsGoals.find((candidate) => candidate.id === goalId);
      return matchesRecordedSavingsDeposit(operation, transfer, savingsBucketForGoal(goal));
    }));
    const confirmedFingerprints = new Set(confirmedManualTransfers.map((transfer) => transfer.fingerprint));
    const transfersToApply = freshTransfers.filter((transfer) => !confirmedFingerprints.has(transfer.fingerprint));

    // Un versement saisi manuellement a déjà crédité l'épargne. Le CSV le confirme,
    // mais ne doit jamais provoquer un second crédit du même montant.
    const increments = transfersToApply.reduce((map, transfer) => {
      map[transfer.bucket] = (map[transfer.bucket] || 0) + Math.abs(Number(transfer.amount) || 0);
      return map;
    }, {});

    setData((current) => {
      const changedGoals = [];
      const representatives = new Map();
      current.savingsGoals.forEach((goal) => {
        const bucket = savingsBucketForGoal(goal);
        const previous = representatives.get(bucket);
        const weight = Math.abs(Number(goal.saved || 0)) * 100000 + Math.abs(Number(goal.target || 0));
        const previousWeight = previous ? Math.abs(Number(previous.saved || 0)) * 100000 + Math.abs(Number(previous.target || 0)) : -1;
        if (!previous || weight > previousWeight) representatives.set(bucket, goal);
      });
      const representativeIds = new Set([...representatives.values()].map((goal) => goal.id));
      const savingsGoals = current.savingsGoals.map((goal) => {
        const bucket = savingsBucketForGoal(goal);
        const increment = increments[bucket] || 0;
        if (!increment || !representativeIds.has(goal.id)) return goal;
        const next = { ...goal, saved: Number(goal.saved || 0) + increment };
        changedGoals.push(next);
        return next;
      });
      const nextData = { ...current, savingsGoals };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));

      if (USE_REMOTE_BUDGET && changedGoals.length) {
        changedGoals.forEach((goal) => {
          supabase.from('savings_goals')
            .update({ saved: Number(goal.saved) })
            .eq('id', goal.id)
            .eq('household_id', householdId)
            .then(() => {});
        });
      }
      return nextData;
    });

    freshTransfers.forEach((transfer) => {
      applied[transfer.fingerprint] = {
        bucket: transfer.bucket,
        amount: transfer.amount,
        appliedAt: new Date().toISOString(),
        source: auditMeta.fileName || 'Belfius CSV',
      };
    });
    localStorage.setItem(APPLIED_SAVINGS_STORAGE_KEY, JSON.stringify(applied));
  };

  const persistBelfiusSnapshot = async (snapshot) => {
    const normalized = {
      balance: Number(snapshot.balance || 0),
      balanceDate: snapshot.balanceDate || '',
      importedAt: snapshot.importedAt || new Date().toISOString(),
      pendingAmount: Number(snapshot.pendingAmount || 0),
      remaining: Number(snapshot.remaining || 0),
      confirmations: Number(snapshot.confirmations || 0),
      anomalies: Number(snapshot.anomalies || 0),
      clean: Boolean(snapshot.clean),
      sourceFile: snapshot.sourceFile || '',
      operationState: capturePaymentOperationState(data.operations, 'Compte Belfius', today),
      openingMonth: snapshot.openingMonth || '',
      openingBalance: snapshot.openingBalance == null ? null : Number(snapshot.openingBalance),
      openingBalances: snapshot.openingMonth && snapshot.openingBalance != null
        ? { ...(belfiusSnapshot?.openingBalances || {}), [snapshot.openingMonth]: Number(snapshot.openingBalance) }
        : (belfiusSnapshot?.openingBalances || {}),
      liveBalance: null,
      liveBalanceDate: '',
      liveBalanceSource: '',
      liveOperationState: {},
    };
    setBelfiusSnapshot(normalized);
    localStorage.setItem('mon-foyer-last-belfius-audit-at', normalized.importedAt);
    if (!USE_REMOTE_BUDGET) return;
    const { error } = await supabase.from('bank_snapshots').upsert({
      household_id: householdId,
      balance: normalized.balance,
      balance_date: normalized.balanceDate,
      imported_at: normalized.importedAt,
      pending_amount: normalized.pendingAmount,
      remaining: normalized.remaining,
      confirmations: normalized.confirmations,
      anomalies: normalized.anomalies,
      clean: normalized.clean,
      source_file: normalized.sourceFile || null,
      operation_state: normalized.operationState,
      opening_month: normalized.openingMonth || null,
      opening_balance: normalized.openingBalance,
      opening_balances: normalized.openingBalances,
      live_balance: null,
      live_balance_date: null,
      live_balance_source: null,
      live_operation_state: {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id' });
    if (error) setSyncStatus('Erreur de mémorisation du solde Belfius: ' + error.message);
  };

  const synchronizeBelfiusBalance = async ({ balance, balanceDate, month }) => {
    const currentBalance = calculatePaymentBalances(data.operations)['Compte Belfius'] || 0;
    const delta = Number(balance) - Number(currentBalance);
    if (Math.abs(delta) < 0.01) return;

    const dateMatch = String(balanceDate || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const adjustmentDate = dateMatch ? dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1] : currentDate();
    const adjustment = {
      id: crypto.randomUUID(),
      date: adjustmentDate,
      person: 'Foyer',
      type: delta >= 0 ? 'income' : 'fixed',
      category: delta >= 0 ? 'revenus' : 'divers',
      store: '',
      paymentMethod: 'Compte Belfius',
      label: 'Ajustement Belfius ' + month + ' — solde certifié',
      amount: Math.abs(delta),
    };

    if (USE_REMOTE_BUDGET) {
      const payload = {
        household_id: householdId,
        date: adjustment.date,
        person: adjustment.person,
        type: adjustment.type,
        category: adjustment.category,
        store: null,
        label: adjustment.label,
        amount: adjustment.amount,
        payment_method: adjustment.paymentMethod,
      };
      const { data: savedRow, error } = await supabase
        .from('operations')
        .insert(payload)
        .select(OPERATION_COLUMNS)
        .single();
      if (error) {
        setSyncStatus('Synchronisation Belfius impossible : ' + error.message);
        return;
      }
      adjustment.id = savedRow.id;
    }

    saveData({ ...data, operations: [adjustment, ...data.operations] });
    setSyncStatus('Solde Belfius synchronisé : ' + formatCurrency(balance));
  };
  const refreshFromSupabase = async () => {
    if (!USE_REMOTE_BUDGET) {
      setMigrationStatus('Supabase ou le foyer ne sont pas configurés.');
      return;
    }

    setMigrationStatus('Rechargement depuis Supabase...');

    const [operationsResult, storesResult, goalsResult, categoriesResult, recurringResult, budgetSettingsResult, carePeopleResult] = await Promise.all([
      selectOperations(),
      supabase
        .from('stores')
        .select('id, name')
        .eq('household_id', householdId)
        .order('name', { ascending: true }),
      supabase
        .from('savings_goals')
        .select('id, label, target, saved, bucket, monthly_amount, standing_order_reference, standing_order_day, active')
        .eq('household_id', householdId)
        .order('created_at', { ascending: true }),
      supabase
        .from('categories')
        .select('category_id, label, type, icon')
        .eq('household_id', householdId)
        .order('label', { ascending: true }),
      supabase
        .from('recurring_fixed_expenses')
        .select('id, label, amount, day, person, category, frequency, start_date, direct_debit_reference, structured_communication, free_communication, free_communication_mode, payment_method, accounting_nature')
        .eq('household_id', householdId)
        .order('created_at', { ascending: true }),
      supabase.from('household_budget_settings').select('effective_month, food_budget, updated_at').eq('household_id', householdId).order('effective_month', { ascending: true }),
      supabase.from('care_people').select('id, name, tracks_reimbursements, exclude_from_food_budget, active').eq('household_id', householdId).order('created_at', { ascending: true }),
    ]);

    if (operationsResult.error || storesResult.error || goalsResult.error) {
      setMigrationStatus('Rechargement impossible: Supabase indisponible.');
      return;
    }

    mergeData(normalizeRemoteState({
      operations: operationsResult.data || [],
      stores: storesResult.data || [],
      savingsGoals: goalsResult.data || [],
      categories: categoriesResult.error ? [] : categoriesResult.data || [],
      recurringFixedExpenses: recurringResult.error ? data.recurringFixedExpenses || [] : recurringResult.data || [],
    }));
    if (!budgetSettingsResult.error && budgetSettingsResult.data?.length) setBudgetSettings(budgetSettingsResult.data);
    if (!carePeopleResult.error && carePeopleResult.data?.length) setCarePeople(carePeopleResult.data);
    setSyncStatus('Synchronise avec Supabase');
    setMigrationStatus('Données locales remplacées par Supabase.');
  };

  const migrateLocalData = async () => {
    if (!USE_REMOTE_BUDGET) {
      setMigrationStatus('Supabase ou le foyer ne sont pas configurés.');
      return;
    }

    setMigrationStatus('Migration en cours...');

    const [operationsResult, storesResult, goalsResult, categoriesResult, recurringResult] = await Promise.all([
      selectOperations(false),
      supabase
        .from('stores')
        .select('name')
        .eq('household_id', householdId),
      supabase
        .from('savings_goals')
        .select('label')
        .eq('household_id', householdId),
      supabase
        .from('categories')
        .select('category_id')
        .eq('household_id', householdId),
      supabase
        .from('recurring_fixed_expenses')
        .select('label, amount, day, person, category, frequency, start_date')
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
      operation.payment_method || operation.paymentMethod || 'Compte Belfius',
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
        payment_method: operation.paymentMethod || operation.payment_method || 'Compte Belfius',
        settles_payment_method: operation.settlesPaymentMethod || operation.settles_payment_method || null,
        settlement_date: operation.settlementDate || operation.settlement_date || null,
        budget_month: operation.budgetMonth || operation.budget_month || null,
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

    const existingCategories = new Set((categoriesResult.data || []).map((category) => category.category_id));
    const missingCategories = data.categories
      .filter((category) => category.custom && !existingCategories.has(category.id))
      .map((category) => ({
        household_id: householdId,
        category_id: category.id,
        label: category.label,
        type: category.type,
        icon: category.icon || 'divers',
      }));

    const recurringSignature = (expense) => [
      expense.label.trim().toLowerCase(),
      parseDecimal(expense.amount).toFixed(2),
      Number(expense.day),
      expense.person,
      expense.category,
      expense.frequency || 'monthly',
      expense.start_date || expense.startDate || currentDate(),
    ].join('|');

    const existingRecurringExpenses = new Set(
      (recurringResult.error ? [] : recurringResult.data || []).map(recurringSignature),
    );

    const uniqueLocalRecurringExpenses = Array.from(
      new Map(
        (data.recurringFixedExpenses || []).map((expense) => [recurringSignature(expense), expense]),
      ).values(),
    );

    const missingRecurringExpenses = uniqueLocalRecurringExpenses
      .filter((expense) => !existingRecurringExpenses.has(recurringSignature(expense)))
      .map((expense) => ({
        household_id: householdId,
        label: expense.label,
        amount: parseDecimal(expense.amount),
        day: Math.min(Math.max(Number(expense.day) || 1, 1), 31),
        person: expense.person,
        category: expense.category,
        frequency: expense.frequency || 'monthly',
        start_date: expense.start_date || expense.startDate || currentDate(),
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

    if (missingCategories.length > 0) {
      const { error: categoryError } = await supabase.from('categories').insert(missingCategories);
      if (categoryError) {
        setMigrationStatus(`Migration types de frais impossible: ${categoryError.message}`);
        return;
      }
    }

    let migratedRecurringExpenses = 0;
    for (const recurringExpense of missingRecurringExpenses) {
      const { error: recurringError } = await supabase.from('recurring_fixed_expenses').insert(recurringExpense);
      if (recurringError && recurringError.code !== '23505') {
        setMigrationStatus(`Migration frais fixes récurrents impossible: ${recurringError.message}`);
        return;
      }
      if (!recurringError) migratedRecurringExpenses += 1;
    }

    let migratedLeisureExpenses = 0;
    try {
      const localLeisureExpenses = JSON.parse(localStorage.getItem('mon-foyer-leisure-v1') || '[]');
      if (Array.isArray(localLeisureExpenses) && localLeisureExpenses.length > 0) {
        const leisurePayload = localLeisureExpenses.map((row) => ({
          id: row.id,
          household_id: householdId,
          date: row.date,
          amount: Number(row.amount || 0),
          vendor: row.vendor || '',
          place: row.place || '',
          category: row.category || 'other',
          note: row.note || '',
          balance_after: row.balanceAfter == null ? null : Number(row.balanceAfter),
          created_at: row.createdAt || new Date().toISOString(),
          updated_at: row.updatedAt || row.createdAt || new Date().toISOString(),
        }));
        const { error: leisureError } = await supabase
          .from('leisure_expenses')
          .upsert(leisurePayload, { onConflict: 'id' });
        if (leisureError) {
          setMigrationStatus(`Migration dépenses Loisirs impossible: ${leisureError.message}`);
          return;
        }
        migratedLeisureExpenses = localLeisureExpenses.length;
        localStorage.setItem('mon-foyer-leisure-supabase-migrated-v1', 'done');
      }
    } catch {
      setMigrationStatus('Migration dépenses Loisirs impossible: données locales illisibles.');
      return;
    }

    setMigrationStatus(`${missingOperations.length} opération(s), ${missingStores.length} point(s) de vente, ${missingGoals.length} objectif(s), ${missingCategories.length} type(s) de frais, ${migratedRecurringExpenses} frais fixe(s) récurrent(s) et ${migratedLeisureExpenses} dépense(s) Loisirs envoyé(s) vers Supabase. Les éléments déjà présents ont été conservés sans doublon.`);
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

  const openHistoryFromDashboard = ({ date = '', category = '', reviewOnly = false } = {}) => {
    setHistorySearch(date);
    setHistoryType('all');
    setHistoryPerson('all');
    setHistoryCategory(category || 'all');
    setHistoryPaymentMethod('all');
    setShowReviewOnly(reviewOnly);
    setActiveView('history');
  };

  const openDashboardCheck = (checkId) => {
    if (checkId === 'review') {
      openHistoryFromDashboard({ reviewOnly: true });
      return;
    }
    if (checkId === 'csv' || checkId === 'mastercard' || checkId === 'backup') {
      setActiveView('settings');
    }
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

      <div
        className={`sync-indicator ${!isOnline ? 'offline' : /impossible|interrompue|refusée|erreur/i.test(syncStatus) ? 'error' : /\.\.\.|envoi|migration|rechargement/i.test(syncStatus) ? 'syncing' : 'synced'}`}
        role="status"
        aria-live="polite"
      >
        <span className="sync-indicator-dot" aria-hidden="true" />
        <span>
          {pendingSyncCount > 0
            ? `${pendingSyncCount} modification(s) en attente · ${isOnline ? syncStatus : 'hors connexion'}`
            : isOnline ? syncStatus : 'Hors connexion · synchronisation suspendue'}
        </span>
      </div>

      {messageNotice && activeView !== 'messages' && (
        <button type="button" className="message-notice" onClick={() => setActiveView('messages')}>
          <MessageCircle size={18} />
          <span>{messageNotice}</span>
        </button>
      )}

      <main className="content">
        {activeView === 'home' && (
          <section className="view home-view">
            <div className="desktop-overview-grid">
              <div className="desktop-summary-column">
                <div className="hero-panel">
              <div>
                <span>Disponible total actuel</span>
                <strong>{formatCurrency(availableForPayments)}</strong>
                <div className="hero-balance-grid">
                  {PAYMENT_METHODS.filter((method) => method !== MASTERCARD_PAYMENT_METHOD).map((method) => (
                    <div key={method}>
                      <span>{method === 'Compte Belfius' ? 'Solde Belfius actuel' : method}</span>
                      {(() => {
                        const displayedBalance = method === 'Compte Belfius' && liveBelfiusSnapshot
                          ? Number(liveBelfiusSnapshot.expectedBalance || 0)
                          : Number(paymentBalances[method] || 0);
                        return (
                          <em className={displayedBalance >= 0 ? 'positive' : 'negative'}>
                            {formatCurrency(displayedBalance)}
                          </em>
                        );
                      })()}
                    </div>
                  ))}
                  {liveBelfiusSnapshot && (
                    <>
                      <div>
                        <span>{liveBelfiusSnapshot.balanceSource === 'Application Belfius' ? 'Mouvements depuis le solde certifié' : 'Mouvements depuis le relevé'}</span>
                        <em className={Number(liveBelfiusSnapshot.pendingAmount || 0) >= 0 ? 'positive' : 'negative'}>
                          {formatCurrency(Number(liveBelfiusSnapshot.pendingAmount || 0))}
                        </em>
                      </div>
                    </>
                  )}
                </div>
                {belfiusSnapshot && (
                  <details className={`belfius-real-balance ${belfiusSnapshot.clean ? 'is-clean' : 'has-gap'}`}>
                    <summary>
                      <span>Dernier solde du relevé CSV</span>
                      <strong>{formatCurrency(belfiusSnapshot.balance)}</strong>
                    </summary>
                    <div className="belfius-real-balance-details">
                      <span>Date du relevé : {belfiusSnapshot.balanceDate || 'dernier CSV importé'}</span>
                      <span>Solde Mon Foyer : {formatCurrency(paymentBalances['Compte Belfius'] || 0)}</span>
                      <span>Écart : {formatCurrency((paymentBalances['Compte Belfius'] || 0) - Number(belfiusSnapshot.balance || 0))}</span>
                      <span>{belfiusSnapshot.remaining || 0} opération(s) à traiter</span>
                      <strong>{belfiusSnapshot.clean ? 'Conforme à Belfius' : 'Rapprochement en cours'}</strong>
                    </div>
                  </details>
                )}
                <div className="mastercard-summary" aria-label="Suivi Mastercard">
                  <div>
                    <span>Encours Mastercard {MASTERCARD_MASKED_NUMBER}</span>
                    <strong className={mastercardOutstanding > 0 ? 'negative' : 'positive'}>
                      {formatCurrency(-mastercardOutstanding)}
                    </strong>
                  </div>
                  <span>
                    {mastercardNextDebitDate
                      ? `Prélèvement Belfius prévu le ${new Date(`${mastercardNextDebitDate}T12:00:00`).toLocaleDateString('fr-BE')}`
                      : 'Aucun prélèvement Mastercard en attente'}
                  </span>
                  <small>Informatif : affectera le budget du mois du prélèvement Belfius.</small>
                </div>
              </div>
              <PiggyBank size={42} />
                </div>

                <section className="panel food-budget-panel">
              <div className="section-title">
                <h2><ShoppingBasket size={20} /> Budget nourriture</h2>
                <span>{formatCurrency(totals.food)} / {formatCurrency(foodBudget)}</span>
              </div>
              <div className="progress-track">
                <div className={`progress-fill food-progress-${foodBudgetStatus.key}`} style={{ width: `${foodRatio}%` }} />
              </div>
              <p className={`hint food-budget-text-${foodBudgetStatus.key}`}>
                {foodOverBudget ? `${formatCurrency(totals.food - foodBudget)} au-dessus de l'idéal` : `${formatCurrency(foodBudget - totals.food)} disponibles`}
              </p>
                </section>

                <BudgetAnalysis analysis={budgetAnalysis} />

                <MonthEndAudit
                  audit={monthEndAudit}
                  month={selectedMonth}
                  running={monthEndAuditRunning}
                  onRun={runMonthEndAudit}
                  nextMonthIncome={nextMonthIncomeReceived}
                  patrimony={currentPatrimony}
                />

                <div className="stats-grid">
                  <StatCard icon={Landmark} label="Report du mois précédent" value={formatCurrency(previousMonthReport)} />
                  <StatCard icon={Banknote} label="Revenus encaissés" value={formatCurrency(totals.income)} />
                  <StatCard icon={TrendingUp} label="Revenus prévus du mois" value={formatCurrency(fullMonthTotals.income)} />
                  <StatCard icon={WalletCards} label="Dépenses exécutées" value={formatCurrency(totals.fixed + totals.variable)} />
                  <StatCard icon={Landmark} label="Frais fixes exécutés" value={formatCurrency(totals.fixed)} />
                  <StatCard icon={WalletCards} label="Variables exécutées" value={formatCurrency(totals.variable)} />
                </div>
              </div>

              <div className="desktop-insights-column">
                <DesktopDashboard
                  series={desktopDailySeries}
                  categories={categoryTotals}
                  checks={desktopClosingChecks}
                  selectedMonth={selectedMonth}
                  forecastBalance={budgetAnalysis.forecastBalance}
                  scheduledTotal={scheduledExpenseTotal}
                  onDaySelect={(date) => openHistoryFromDashboard({ date })}
                  onCategorySelect={(category) => openHistoryFromDashboard({ category })}
                  onCheckSelect={openDashboardCheck}
                />

                <SavingsInterface goals={data.savingsGoals} bankSavings={bankSavings} onUpdate={updateGoal} />
              </div>
            </div>

            <section className="panel scheduled-panel">
              <div className="section-title">
                <h2>Dépenses programmées</h2>
                <strong>{formatCurrency(scheduledExpenseTotal)}</strong>
              </div>
              <p className="scheduled-caption">Montants restant à prévoir jusqu’à la fin du mois</p>

              <div className="forecast-card food-forecast-card">
                <div className="forecast-icon"><ShoppingBasket size={22} /></div>
                <div className="forecast-copy">
                  <strong>Budget nourriture restant à prévoir</strong>
                  <span>Budget mensuel : {formatCurrency(foodBudget)}</span>
                  <span>Déjà utilisé ou programmé : {formatCurrency(Math.min(totals.food + scheduledFoodTotal, foodBudget))}</span>
                </div>
                <strong className="forecast-amount">{formatCurrency(remainingFoodBudget)}</strong>
              </div>

              <div className="forecast-card total-forecast-card">
                <div className="forecast-icon"><ListChecks size={22} /></div>
                <div className="forecast-copy">
                  <strong>Total restant à couvrir</strong>
                  <span>Dépenses programmées : {formatCurrency(scheduledExpenseTotal)}</span>
                  <span>Budget nourriture restant : {formatCurrency(remainingFoodBudget)}</span>
                </div>
                <strong className="forecast-amount">{formatCurrency(totalRemainingToCover)}</strong>
              </div>

              <div className={`forecast-card balance-forecast-card status-${forecastStatus.key}`}>
                <div className="forecast-icon"><WalletCards size={22} /></div>
                <div className="forecast-copy">
                  <strong>Solde prévisionnel fin de mois</strong>
                  <span>Disponible actuel : {formatCurrency(availableForPayments)}</span>
                  <span className="forecast-status-label">{forecastStatus.label}</span>
                </div>
                <strong className={`forecast-amount status-text-${forecastStatus.key}`}>
                  {formatCurrency(availableAfterPlannedExpenses)}
                </strong>
              </div>

              <details className="forecast-details">
                <summary>Détail du calcul</summary>
                <div><span>Disponible actuel</span><strong>{formatCurrency(availableForPayments)}</strong></div>
                <div><span>− Dépenses programmées</span><strong>− {formatCurrency(scheduledExpenseTotal)}</strong></div>
                <div><span>− Budget nourriture restant</span><strong>− {formatCurrency(remainingFoodBudget)}</strong></div>
                <div className="forecast-details-total">
                  <span>= Solde prévisionnel fin de mois</span>
                  <strong className={availableAfterPlannedExpenses >= 0 ? 'positive' : 'negative'}>{formatCurrency(availableAfterPlannedExpenses)}</strong>
                </div>
              </details>

              <p className="forecast-help">Les calculs tiennent uniquement compte des dépenses et budgets restant à prévoir jusqu’à la fin du mois.</p>
              <div className="scheduled-list">
                {scheduledExpenses.length === 0 && (
                  <p className="empty-state">Aucune dépense programmée pour ce mois.</p>
                )}
                {scheduledExpenses.map((operation) => {
                  const category = data.categories.find((item) => item.id === operation.category);
                  const isSavings = operation.category?.startsWith('epargne')
                    || operation.label?.trim().toLowerCase().startsWith('épargne');
                  const operationKind = isSavings
                    ? { key: 'savings', label: 'Épargne', Icon: PiggyBank }
                    : operation.projectedRecurring
                      ? { key: 'recurring', label: 'Frais fixe récurrent', Icon: Repeat2 }
                      : { key: 'planned', label: 'Dépense ponctuelle', Icon: CalendarDays };
                  const KindIcon = operationKind.Icon;

                  return (
                    <article className={`scheduled-row scheduled-row-${operationKind.key}`} key={operation.id}>
                      <div className={`scheduled-kind-icon kind-${operationKind.key}`} aria-hidden="true">
                        <KindIcon size={19} />
                      </div>
                      <div className="scheduled-row-copy">
                        <div className="scheduled-row-heading">
                          <strong>{operation.label}</strong>
                          <span className={`scheduled-kind-badge badge-${operationKind.key}`}>
                            {operationKind.label}
                          </span>
                        </div>
                        <span>
                          {operation.date} · {category?.label || 'Frais fixe'} · {operation.paymentMethod || 'Compte Belfius'} · Prévue
                        </span>
                      </div>
                      <strong className="scheduled-row-amount">{formatCurrency(operation.amount)}</strong>
                      {operation.projectedRecurring && operation.recurringExpenseId && (
                        <button
                          type="button"
                          onClick={() => deleteRecurringFixedExpense(operation.recurringExpenseId)}
                          aria-label={'Supprimer la récurrence ' + operation.label}
                          title="Supprimer cette récurrence"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <ExpenseChart categories={categoryTotals} />

            <AnnualReview review={annualReview} />

            <section className="panel expense-types-summary-panel">
              <div className="section-title">
                <h2>Dépenses par type de frais</h2>
                <span>{monthOperations.length} opérations</span>
              </div>
              <div className="category-list">
                {categoryTotals
                  .filter(isExpenseCategory)
                  .map((category) => (
                    <CategoryRow key={category.id} category={category} />
                  ))}
              </div>
            </section>

            <section className="panel expense-types-settings-panel">
              <div className="section-title">
                <h2>Types de frais</h2>
                <span>{data.categories.filter(isExpenseCategory).length}</span>
              </div>
              <div className="category-form">
                <input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Nouveau type de frais"
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
                  .filter(isExpenseCategory)
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

          </section>
        )}

        {activeView === 'add' && (
          <section className="view">
            <form className="panel form-panel" onSubmit={handleSubmit}>
              <div className="section-title">
                <h2>{editingId ? 'Modifier' : 'Ajouter'} une operation</h2>
                {editingId && (
                  <button type="button" className="text-button" onClick={cancelOperationDraft}>
                    Annuler
                  </button>
                )}
              </div>

              <label>
                Type
                <select
                  value={draft.type === 'income' && draft.incomeKind === 'salary' ? 'salary' : draft.type}
                  onChange={(event) => {
                    const selectedType = event.target.value;
                    const type = selectedType === 'salary' ? 'income' : selectedType;
                    const nextCategory = type === 'income'
                      ? 'revenus'
                      : draft.category === 'revenus'
                        ? 'nourriture'
                        : draft.category;
                    setDraft({
                      ...draft,
                      type,
                      category: nextCategory,
                      paymentMethod: selectedType === 'card_settlement' ? 'Compte Belfius' : draft.paymentMethod,
                      incomeKind: selectedType === 'salary' ? 'salary' : selectedType === 'income' ? 'other' : draft.incomeKind,
                      budgetMonth: selectedType === 'salary' ? nextMonthKey(draft.date) : draft.budgetMonth,
                    });
                  }}
                >
                  <option value="salary">Salaire</option>
                  <option value="income">Autre revenu</option>
                  <option value="reimbursement">Remboursement</option>
                  <option value="card_settlement">Règlement Mastercard</option>
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
                  <input type="text" inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="0,00" />
                </label>
                <label>
                  Date
                  <input type="date" value={draft.date} onChange={(event) => setDraft({
                    ...draft,
                    date: event.target.value,
                    budgetMonth: draft.incomeKind === 'salary' ? nextMonthKey(event.target.value) : draft.budgetMonth,
                  })} />
                </label>
              </div>

              <label>
                Moyen de paiement
                <select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>
                  {PAYMENT_METHODS.map((method) => {
                    const availableBalance = getAvailablePaymentBalance(method);
                    const disabled = draft.type !== 'income'
                      && !canPaymentMethodGoNegative(method)
                      && availableBalance <= 0;

                    return (
                      <option key={method} value={method} disabled={disabled}>
                        {method}{draft.type !== 'income' && !canPaymentMethodGoNegative(method) ? ` (${formatCurrency(availableBalance)} dispo)` : ''}
                      </option>
                    );
                  })}
                </select>
              </label>

              {isMastercardPaymentMethod(draft.paymentMethod) && draft.type !== 'card_settlement' && (
                <p className="card-payment-hint">
                  Mastercard {MASTERCARD_MASKED_NUMBER} · prélèvement Belfius prévu le{' '}
                  <strong>{new Date(`${mastercardSettlementDate(draft.date)}T12:00:00`).toLocaleDateString('fr-BE')}</strong>.
                  La dépense est immédiatement réservée dans le disponible.
                </p>
              )}

              {draft.type === 'card_settlement' && (
                <p className="card-payment-hint">
                  Ce mouvement débite Belfius et apure l’encours Mastercard sans créer une seconde dépense budgétaire.
                </p>
              )}

              {draft.type === 'income' && (
                <>
                  <label>
                    Source du revenu
                    <select value={draft.savingsSource || ''} onChange={(event) => setDraft({ ...draft, savingsSource: event.target.value })}>
                      <option value="">Revenu du foyer</option>
                      {data.savingsGoals.map((goal) => (<option key={goal.id} value={goal.id}>Épargne {goal.label}</option>))}
                    </select>
                    {draft.savingsSource && <span className="hint">Transfert interne : augmente le compte courant et diminue cette épargne. Il n'est pas compté comme revenu budgétaire.</span>}
                  </label>
                  {!draft.savingsSource && (
                    <div className="form-row">
                      <label>
                        {draft.incomeKind === 'salary' ? 'Employeur' : 'Organisme payeur'}
                        <input value={draft.incomeSource || ''} onChange={(event) => setDraft({ ...draft, incomeSource: event.target.value })} placeholder={draft.incomeKind === 'salary' ? 'Ex. ETHIAS, REXEL Belgium' : 'Ex. ONEM'} />
                      </label>
                      <label>
                        Mois budgétaire concerné
                        <input type="month" value={draft.budgetMonth || draft.date.slice(0, 7)} onChange={(event) => setDraft({ ...draft, budgetMonth: event.target.value })} />
                      </label>
                    </div>
                  )}
                </>
              )}

              {draft.type === 'savings_transfer' && (
                <label>
                  Poste d’épargne à créditer
                  <select value={draft.savingsGoalId || ''} onChange={(event) => setDraft({ ...draft, savingsGoalId: event.target.value })}>
                    <option value="">Choisir un poste d’épargne</option>
                    {data.savingsGoals.map((goal) => (<option key={goal.id} value={goal.id}>{goal.label} · {formatCurrency(goal.saved || 0)}</option>))}
                  </select>
                  <span className="hint">Transfert interne : diminue Belfius et augmente ce poste d’épargne. Il n’est pas compté comme une dépense du foyer.</span>
                </label>
              )}

              <div className={draft.type === 'income' ? 'form-row single' : 'form-row'}>
                <label>
                  Personne
                  <select value={draft.person} onChange={(event) => setDraft({ ...draft, person: event.target.value })}>
                    {availablePeople.map((person) => <option key={person}>{person}</option>)}
                  </select>
                </label>
                {draft.type !== 'income' && (
                  <label>
                    Type de frais
                    <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                      {data.categories
                        .filter(isExpenseCategory)
                        .map((category) => (
                          <option key={category.id} value={category.id}>{category.label}</option>
                        ))}
                    </select>
                  </label>
                )}
              </div>

              {draft.type !== 'income' && (
                <section className="recurring-inline-panel">
                  <label>
                    Fréquence
                    <select
                      value={draft.recurrence}
                      onChange={(event) => setDraft({
                        ...draft,
                        recurrence: event.target.value,
                        recurringDay: draft.recurringDay || Number(draft.date.slice(8, 10)),
                      })}
                    >
                      {RECURRENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {draft.recurrence !== 'once' && (
                    <label>
                      Jour habituel du prélèvement
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={draft.recurringDay}
                        onChange={(event) => setDraft({ ...draft, recurringDay: event.target.value })}
                      />
                    </label>
                  )}
                  {draft.recurrence !== 'once' && (
                    <div className="belfius-identification-inline">
                      <div className="belfius-identification-title">Identification Belfius <span>(facultatif)</span></div>
                      <label>
                        Communication structurée
                        <input
                          value={draft.structuredCommunication || ''}
                          onChange={(event) => setDraft({ ...draft, structuredCommunication: event.target.value })}
                          placeholder="Ex. 827-6921515-21 ou +++123/4567/89012+++"
                        />
                      </label>
                      <div className="form-row">
                        <label>
                          Communication libre / motif Belfius
                          <input
                            value={draft.freeCommunication || ''}
                            onChange={(event) => setDraft({ ...draft, freeCommunication: event.target.value })}
                            placeholder="Ex. Pension, Pour voiture…"
                          />
                        </label>
                        <label>
                          Règle de reconnaissance
                          <select
                            value={draft.freeCommunicationMode || 'contains'}
                            onChange={(event) => setDraft({ ...draft, freeCommunicationMode: event.target.value })}
                          >
                            <option value="contains">Contient</option>
                            <option value="exact">Correspond exactement</option>
                          </select>
                        </label>
                      </div>
                      <p className="hint">Ces informations sont enregistrées sur le paiement récurrent associé et servent au rapprochement bancaire.</p>
                    </div>
                  )}
                </section>
              )}

              {operationRequiresStore(draft.type) && (
                <label>
                  Bénéficiaire / Point de vente
                  <select value={draft.store} onChange={(event) => setDraft({ ...draft, store: event.target.value })}>
                    <option value="" disabled>Faire un choix</option>
                    {beneficiaryOptions.map((store) => (
                      <option key={store} value={store}>{store}</option>
                    ))}
                  </select>
                </label>
              )}

              {editingId && (
                <section className={`operation-review-panel review-${normalizeReviewStatus(draft.reviewStatus)}`}>
                  <div>
                    <strong>Contrôle bancaire</strong>
                    <span>Le statut ne modifie jamais le montant comptabilisé.</span>
                  </div>
                  <div className="operation-review-actions" role="group" aria-label="Statut du contrôle bancaire">
                    {[
                      [OPERATION_REVIEW_STATUSES.UNREVIEWED, 'À vérifier'],
                      [OPERATION_REVIEW_STATUSES.VERIFIED, 'Vérifié'],
                      [OPERATION_REVIEW_STATUSES.DISPUTED, 'Contesté'],
                      [OPERATION_REVIEW_STATUSES.RESOLVED, 'Résolu'],
                    ].map(([status, label]) => (
                      <button
                        key={status}
                        type="button"
                        className={normalizeReviewStatus(draft.reviewStatus) === status ? 'active' : ''}
                        onClick={() => setDraft({
                          ...draft,
                          reviewStatus: status,
                          resolvedAt: status === OPERATION_REVIEW_STATUSES.RESOLVED ? draft.resolvedAt : '',
                        })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {(draft.reviewStatus === OPERATION_REVIEW_STATUSES.DISPUTED
                    || draft.reviewStatus === OPERATION_REVIEW_STATUSES.RESOLVED) && (
                    <label>
                      Référence du dossier bancaire
                      <input
                        value={draft.disputeReference || ''}
                        onChange={(event) => setDraft({ ...draft, disputeReference: event.target.value })}
                        placeholder="Ex. numéro de plainte ou de dossier"
                      />
                    </label>
                  )}
                  {draft.reviewStatus !== OPERATION_REVIEW_STATUSES.UNREVIEWED && (
                    <label>
                      Note de contrôle
                      <textarea
                        value={draft.reviewNote || ''}
                        onChange={(event) => setDraft({ ...draft, reviewNote: event.target.value })}
                        placeholder="Ex. achat TUI reconnu par Alain"
                        rows="3"
                      />
                    </label>
                  )}
                  {draft.reviewedAt && (
                    <small>Dernière décision : {new Date(draft.reviewedAt).toLocaleString('fr-BE')} · {draft.reviewedBy || 'Mon Foyer'}</small>
                  )}
                </section>
              )}

              <div className="operation-form-actions">
                <button className="secondary-button" type="button" onClick={cancelOperationDraft}>
                  Annuler
                </button>
                <button className="primary-button" type="submit">
                  <Plus size={20} />
                  {editingId ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
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
                    {historyPeople.map((person) => <option key={person}>{person}</option>)}
                  </select>
                </div>
                <div className="filter-grid">
                  <select value={historyCategory} onChange={(event) => setHistoryCategory(event.target.value)} aria-label="Type de frais">
                    <option value="all">Tous les types de frais</option>
                    {data.categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={showReviewOnly ? 'review-filter active' : 'review-filter'}
                    aria-pressed={showReviewOnly}
                    onClick={() => setShowReviewOnly((current) => !current)}
                  >
                    À vérifier {reviewMap.size > 0 ? `(${reviewMap.size})` : ''}
                  </button>
                </div>
                <div className="filter-grid">
                  <select value={historyPaymentMethod} onChange={(event) => setHistoryPaymentMethod(event.target.value)} aria-label="Moyen de paiement">
                    <option value="all">Tous les moyens de paiement</option>
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="history-summary">
                <div>
                  <span>Total affiché</span>
                  <strong className={historyTotals.balance >= 0 ? 'income' : 'expense'}>
                    {formatCurrency(historyTotals.balance)}
                  </strong>
                </div>
                <div>
                  <span>Revenus</span>
                  <strong className="income">{formatCurrency(historyTotals.income)}</strong>
                </div>
                <div>
                  <span>Dépenses</span>
                  <strong className="expense">{formatCurrency(historyTotals.expenses)}</strong>
                </div>
              </div>
              <div className="history-summary">
                {PAYMENT_METHODS.map((method) => (
                  <div key={method}>
                    <span>{method}</span>
                    <strong className={paymentBalances[method] >= 0 ? 'income' : 'expense'}>
                      {formatCurrency(paymentBalances[method])}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="operation-list">
                {filteredMonthOperations.length === 0 && (
                  <p className="empty-state">
                    {monthOperations.length > 0
                      ? `${monthOperations.length} opération(s) enregistrée(s), mais aucune ne correspond aux filtres actifs.`
                      : 'Aucune opération enregistrée pour ce mois.'}
                  </p>
                )}
                {filteredMonthOperations.map((operation) => (
                  <OperationRow
                    key={operation.id}
                    operation={operation}
                    categories={data.categories}
                    alerts={reviewMap.get(operation.id)}
                    planned={operation.date > today}
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
            <BelfiusAudit
              operations={data.operations}
              appBelfiusBalance={paymentBalances['Compte Belfius'] || 0}
              selectedMonth={selectedMonth}
              recurringExpenses={data.recurringFixedExpenses || []}
              savingsGoals={data.savingsGoals || []}
              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}
              onSavingsDetected={handleBankSavingsDetected}
              onAuditSnapshot={persistBelfiusSnapshot}
              onEditAppOperation={editOperation}
              onAddBankOperation={addBankOperationFromAudit}
            />

            <ProtectedSettings
              session={session}
              selectedMonth={selectedMonth}
              budgetSettings={budgetSettings}
              carePeople={carePeople}
              savingsGoals={data.savingsGoals}
              onBudgetSettingsChange={setBudgetSettings}
              onCarePeopleChange={setCarePeople}
              onSavingsGoalsChange={(updater) => setData((current) => {
                const savingsGoals = typeof updater === 'function' ? updater(current.savingsGoals) : updater;
                const next = { ...current, savingsGoals };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                return next;
              })}
            />

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
                {(() => {
                  const recurringExpenses = data.recurringFixedExpenses || [];
                  const uniqueCount = new Set(recurringExpenses.map(recurringExpenseSignature)).size;
                  const duplicateCount = recurringExpenses.length - uniqueCount;
                  return (
                    <span>
                      {recurringExpenses.length} enregistrés · {uniqueCount} uniques
                      {duplicateCount > 0 ? ' · ' + duplicateCount + ' doublon(s) potentiel(s)' : ' · base propre'}
                    </span>
                  );
                })()}
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
                <fieldset className="recurring-bank-identification">
                  <legend>{recurringRecognition.legend}</legend>
                  {!isMastercardPaymentMethod(recurringDraft.paymentMethod) && (
                    <>
                      <label>
                        Référence de domiciliation / numéro d’OP
                        <input
                          value={recurringDraft.directDebitReference || ''}
                          onChange={(event) => setRecurringDraft({ ...recurringDraft, directDebitReference: event.target.value })}
                          placeholder="Ex. 18833987 ou référence de mandat"
                        />
                      </label>
                      <label>
                        Communication structurée
                        <input
                          value={recurringDraft.structuredCommunication || ''}
                          onChange={(event) => setRecurringDraft({ ...recurringDraft, structuredCommunication: event.target.value })}
                          placeholder="+++123/4567/89012+++"
                        />
                      </label>
                    </>
                  )}
                  <label>
                    {recurringRecognition.fieldLabel}
                    <input
                      value={recurringDraft.freeCommunication || ''}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, freeCommunication: event.target.value })}
                      placeholder={recurringRecognition.placeholder}
                    />
                  </label>
                  <label>
                    Règle de reconnaissance
                    <select
                      value={recurringDraft.freeCommunicationMode || 'contains'}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, freeCommunicationMode: event.target.value })}
                    >
                      <option value="contains">{recurringRecognition.containsLabel}</option>
                      <option value="exact">{recurringRecognition.exactLabel}</option>
                    </select>
                  </label>
                  <p className="hint">{recurringRecognition.hint}</p>
                </fieldset>
                <div className="recurring-grid">
                  <label>
                    Montant
                    <input
                      type="text"
                      inputMode="decimal"
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
                      {availablePeople.map((person) => <option key={person}>{person}</option>)}
                    </select>
                  </label>
                  <label>
                    Fréquence
                    <select
                      value={recurringDraft.frequency}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, frequency: event.target.value })}
                    >
                      {RECURRENCE_OPTIONS.filter((option) => option.value !== 'once').map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="recurring-grid">
                  <label>
                    Type de frais
                    <select
                      value={recurringDraft.category}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, category: event.target.value })}
                    >
                      {data.categories
                        .filter(isExpenseCategory)
                        .map((category) => (
                          <option key={category.id} value={category.id}>{category.label}</option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Moyen de paiement
                    <select
                      value={recurringDraft.paymentMethod || 'Compte Belfius'}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, paymentMethod: event.target.value })}
                    >
                      {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
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
                        <span>{formatCurrency(expense.amount)} · jour {expense.day} · {recurrenceLabel(expense.frequency)} · {expense.person} · {category?.label || 'Frais fixe'} · {expense.paymentMethod || expense.payment_method || 'Compte Belfius'}</span>
                      </div>
                      <div className="row-actions">
                        <button type="button" onClick={() => editRecurringFixedExpense(expense)} aria-label="Modifier" title="Modifier">
                          <Edit3 size={16} />
                        </button>
                        <button type="button" onClick={() => deleteRecurringFixedExpense(expense.id)} aria-label="Supprimer" title="Supprimer">
                          <Trash2 size={16} />
                        </button>
                      </div>
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
                {syncStatus}. Les données sont séparées en opérations, types de frais, points de vente et objectifs d'épargne.
              </p>
              <button className="secondary-button" type="button" onClick={refreshFromSupabase}>
                Recharger depuis Supabase
              </button>
              <button className="secondary-button" type="button" onClick={migrateLocalData}>
                Récupérer d’anciennes données locales
              </button>
              <p className="hint">
                À utiliser uniquement pour transférer d’anciennes données restées sur cet appareil.
                Les nouvelles saisies sont enregistrées automatiquement dans Supabase.
              </p>
              {migrationStatus && <p className="hint">{migrationStatus}</p>}
            </section>

            <DataBackupRecovery />

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

function GoalCard({ goal, onUpdate, bankDetected = 0 }) {
  const [draft, setDraft] = useState({
    saved: String(goal.saved ?? 0),
    target: String(goal.target ?? 0),
  });
  const actualRatio = goal.target ? (goal.saved / goal.target) * 100 : 0;
  const progressRatio = Math.min(Math.max(actualRatio, 0), 100);

  useEffect(() => {
    setDraft({
      saved: String(goal.saved ?? 0),
      target: String(goal.target ?? 0),
    });
  }, [goal.saved, goal.target]);

  const commit = (field) => {
    const value = draft[field] === '' ? 0 : parseDecimal(draft[field]);
    onUpdate(goal.id, field, Number.isFinite(value) ? value : 0);
  };

  const handleKeyDown = (event, field) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  };

  return (
    <article className="goal-card">
      <div className="goal-head">
        <strong>{goal.label}</strong>
        <span>{Math.round(actualRatio)}%</span>
      </div>
      <div className="progress-track slim">
        <div className="progress-fill green" style={{ width: `${progressRatio}%` }} />
      </div>
      {bankDetected > 0 && (
        <div className="goal-bank-sync">
          <span>🏦 Versements Belfius identifiés dans le CSV</span>
          <strong>{formatCurrency(bankDetected)}</strong>
        </div>
      )}
      <div className="goal-inputs">
        <label>
          Mis de côté (épargne)
          <input
            type="text"
            inputMode="decimal"
            value={draft.saved}
            onChange={(event) => setDraft({ ...draft, saved: event.target.value })}
            onBlur={() => commit('saved')}
            onKeyDown={(event) => handleKeyDown(event, 'saved')}
          />
        </label>
        <label>
          Objectif
          <input
            type="text"
            inputMode="decimal"
            value={draft.target}
            onChange={(event) => setDraft({ ...draft, target: event.target.value })}
            onBlur={() => commit('target')}
            onKeyDown={(event) => handleKeyDown(event, 'target')}
          />
        </label>
      </div>
    </article>
  );
}

function ExpenseChart({ categories }) {
  const rows = categories
    .filter((category) => isExpenseCategory(category) && category.total > 0)
    .sort((left, right) => right.total - left.total);
  const total = rows.reduce((sum, category) => sum + category.total, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <section className="panel expense-chart-panel">
      <div className="section-title">
        <h2>Répartition des dépenses</h2>
        <span>{formatCurrency(total)}</span>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">Aucune dépense à afficher pour ce mois.</p>
      ) : (
        <div className="expense-chart">
          <div className="donut-wrap" aria-label="Répartition des dépenses par type de frais">
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
    .filter((category) => isExpenseCategory(category) && category.total > 0)
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
        Nourriture: {formatCurrency(review.totals.food)} / {formatCurrency(review.foodBudgetAnnual)} sur l'année. {comparisonText}.
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

function OperationRow({ operation, categories, alerts, planned = false, onEdit, onDelete }) {
  const category = categories.find((item) => item.id === operation.category);
  const Icon = iconMap[category?.icon] || CircleEllipsis;
  const sign = operation.type === 'income' ? '+' : '-';

  return (
    <article className={alerts?.length ? 'operation-row needs-review' : 'operation-row'}>
      <span className="icon-bubble"><Icon size={18} /></span>
      <div>
        <strong>{operation.label}</strong>
        <span>{operation.date} · {operation.person}{operation.store ? ` · ${operation.store}` : ''} · {operation.paymentMethod || 'Compte Belfius'}</span>
        {planned && <em className="operation-planned-badge">Prévue · déjà enregistrée</em>}
        {alerts?.length > 0 && <em>À vérifier: {alerts.join(', ')}</em>}
        {operation.reviewStatus && operation.reviewStatus !== OPERATION_REVIEW_STATUSES.UNREVIEWED && (
          <em className={`operation-review-badge review-${operation.reviewStatus}`}>
            {reviewStatusLabel(operation.reviewStatus)}
            {operation.disputeReference ? ` · dossier ${operation.disputeReference}` : ''}
          </em>
        )}
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
