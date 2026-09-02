import {
  BusFront,
  CarFront,
  CircleEllipsis,
  Droplets,
  Edit3,
  Flame,
  Fuel,
  HeartPulse,
  HomeIcon,
  Leaf,
  ShieldCheck,
  ShoppingBasket,
  Trash2,
  TrendingUp,
  Umbrella,
  Utensils,
  Zap,
} from 'lucide-react';
import {
  OPERATION_REVIEW_STATUSES,
  reviewStatusLabel,
} from '../../lib/operationReviewRules.js';
import { formatMoney } from '../../domain/money/money.js';

const PAYMENT_METHODS = [
  'Compte Belfius',
  'Chèques repas Alain',
  'Chèques repas Esther',
  'Mastercard •••• 6308',
];

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

function OperationRow({ operation, categories, alerts, onEdit, onDelete }) {
  const category = categories.find((item) => item.id === operation.category);
  const Icon = iconMap[category?.icon] || CircleEllipsis;
  const sign = (operation.type === 'income' || operation.type === 'reimbursement') ? '+' : '-';

  return (
    <article className={[
      'operation-row',
      alerts?.length ? 'needs-review' : '',
      operation.virtualRecurring ? 'virtual-recurring' : '',
    ].filter(Boolean).join(' ')}>
      <span className="icon-bubble"><Icon size={18} /></span>
      <div>
        <strong>{operation.label}</strong>
        <span>{operation.date} · {operation.person}{operation.store ? ` · ${operation.store}` : ''} · {operation.paymentMethod || 'Compte Belfius'}</span>
        {alerts?.length > 0 && <em>À vérifier: {alerts.join(', ')}</em>}
        {operation.pendingCsvImport && (
          <em className="virtual-recurring-status">{operation.statusLabel}</em>
        )}
        {operation.reviewStatus && operation.reviewStatus !== OPERATION_REVIEW_STATUSES.UNREVIEWED && (
          <em className={`operation-review-badge review-${operation.reviewStatus}`}>
            {reviewStatusLabel(operation.reviewStatus)}
            {operation.disputeReference ? ` · dossier ${operation.disputeReference}` : ''}
          </em>
        )}
      </div>
      <strong className={(operation.type === 'income' || operation.type === 'reimbursement') ? 'amount income' : 'amount'}>
        {sign}{formatMoney(operation.amount)}
      </strong>
      {!operation.virtualRecurring && (
        <>
          <button type="button" onClick={() => onEdit(operation)} aria-label="Modifier">
            <Edit3 size={17} />
          </button>
          <button type="button" onClick={() => onDelete(operation.id)} aria-label="Supprimer">
            <Trash2 size={17} />
          </button>
        </>
      )}
    </article>
  );
}

export default function OperationHistory({
  operations,
  monthOperations,
  filteredMonthOperations,
  categories,
  selectedMonth,
  historySearch,
  setHistorySearch,
  historyType,
  setHistoryType,
  historyPerson,
  setHistoryPerson,
  historyPeople,
  historyCategory,
  setHistoryCategory,
  historyPaymentMethod,
  setHistoryPaymentMethod,
  showReviewOnly,
  setShowReviewOnly,
  reviewMap,
  historyTotals,
  paymentBalances,
  today,
  onEditOperation,
  onDeleteOperation,
  DuplicateAuditComponent,
}) {
  const DuplicateAudit = DuplicateAuditComponent;
  const currentMonth = today.slice(0, 7);
  const visibleMonthOperations = selectedMonth === currentMonth
    ? monthOperations.filter((operation) => operation.date <= today)
    : monthOperations;
  const visibleFilteredMonthOperations = selectedMonth === currentMonth
    ? filteredMonthOperations.filter((operation) => operation.date <= today)
    : filteredMonthOperations;

  return (
    <section className="view">
      {DuplicateAudit && (
        <DuplicateAudit
          mode="history"
          operations={operations}
          selectedMonth={selectedMonth}
          onDeleteOperation={(row) => onDeleteOperation(row.id)}
        />
      )}
      <div className="panel">
        <div className="section-title">
          <h2>Historique</h2>
          <span>{visibleFilteredMonthOperations.length} / {visibleMonthOperations.length} lignes</span>
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
              <option value="reimbursement">Remboursement</option>
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
              {categories.map((category) => (
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
              {formatMoney(historyTotals.balance)}
            </strong>
          </div>
          <div>
            <span>Revenus budgétaires</span>
            <strong className="income">{formatMoney(historyTotals.income)}</strong>
          </div>
          <div>
            <span>Dépenses</span>
            <strong className="expense">{formatMoney(historyTotals.expenses)}</strong>
          </div>
        </div>
        <div className="history-summary">
          {PAYMENT_METHODS.map((method) => (
            <div key={method}>
              <span>{method}</span>
              <strong className={paymentBalances[method] >= 0 ? 'income' : 'expense'}>
                {formatMoney(paymentBalances[method])}
              </strong>
            </div>
          ))}
        </div>
        <div className="operation-list">
          {visibleFilteredMonthOperations.length === 0 && (
            <p className="empty-state">
              {visibleMonthOperations.length > 0
                ? `${visibleMonthOperations.length} opération(s) enregistrée(s), mais aucune ne correspond aux filtres actifs.`
                : 'Aucune opération enregistrée pour ce mois.'}
            </p>
          )}
          {visibleFilteredMonthOperations.map((operation) => (
            <OperationRow
              key={operation.id}
              operation={operation}
              categories={categories}
              alerts={reviewMap.get(operation.id)}
              onEdit={onEditOperation}
              onDelete={onDeleteOperation}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
