import { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, CheckCircle2, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { formatMoney } from '../../../domain/money/money.js';
import { adaptCertifiedBudgetInputs } from '../adapters/certifiedBudgetAdapter.js';
import { selectPeriodInsights } from '../selectors/periodInsights.js';
import './BudgetIntelligenceDashboard.css';

const TABS = Object.freeze([
  { key: 'monthly', label: 'Mensuel' },
  { key: 'quarterly', label: 'Trimestriel' },
  { key: 'semiannual', label: 'Semestriel' },
]);

const auditLabels = {
  balanced: 'Clôture contrôlée',
  review: 'Clôture à compléter',
  critical: 'Clôture avec anomalies',
  pending: 'Clôture non disponible',
};

function monthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return 'Période sélectionnée';
  return new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T12:00:00`));
}

export default function BudgetIntelligenceDashboard({
  monthlyAudit = null,
  budgetAnalysis = {},
  anomalySummary = {},
  onBack,
}) {
  const [period, setPeriod] = useState('monthly');
  const certifiedData = useMemo(() => adaptCertifiedBudgetInputs({
    monthlyAudit,
    budgetAnalysis,
    anomalySummary,
  }), [anomalySummary, budgetAnalysis, monthlyAudit]);
  const insight = useMemo(() => selectPeriodInsights(certifiedData, period), [certifiedData, period]);
  const TrendIcon = insight.expenseChange != null && insight.expenseChange <= 0 ? TrendingDown : TrendingUp;

  return (
    <section className="budget-intelligence-view" aria-labelledby="budget-intelligence-title">
      <header className="budget-intelligence-header">
        <button type="button" className="budget-intelligence-back" onClick={onBack}>
          <ArrowLeft size={18} /> Retour
        </button>
        <div>
          <span>Lecture seule · données comptables certifiées</span>
          <h2 id="budget-intelligence-title"><BarChart3 size={24} /> Intelligence budgétaire</h2>
        </div>
      </header>

      <div className="budget-intelligence-tabs" role="tablist" aria-label="Période d'analyse">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={period === tab.key}
            className={period === tab.key ? 'active' : ''}
            onClick={() => setPeriod(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!insight.complete ? (
        <p className="budget-intelligence-coverage" role="status">
          Analyse prudente : {insight.availableMonths}/{insight.requestedMonths} mois certifiés disponibles.
          Aucun mois manquant n’est estimé.
        </p>
      ) : null}

      <div className="budget-intelligence-grid">
        <article>
          <span>Dépenses · {monthLabel(insight.latestMonth)}</span>
          <strong>{formatMoney(insight.latestExpenses)}</strong>
          <small>Montant fourni par le moteur déterministe.</small>
        </article>
        <article>
          <span>Revenus affectés</span>
          <strong>{formatMoney(insight.latestIncome)}</strong>
          <small>Sans reclassification par ce module.</small>
        </article>
        <article>
          <span>Solde prévisionnel</span>
          <strong className={insight.forecastBalance < 0 ? 'negative' : 'positive'}>
            {formatMoney(insight.forecastBalance)}
          </strong>
          <small>{insight.status.label || 'Situation en attente de données.'}</small>
        </article>
      </div>

      <div className="budget-intelligence-observations">
        <article>
          <TrendIcon size={22} />
          <div>
            <strong>Évolution des dépenses</strong>
            <span>
              {insight.expenseChange == null
                ? 'Un deuxième mois certifié est nécessaire pour mesurer une évolution.'
                : `${insight.expenseChange > 0 ? 'Hausse' : insight.expenseChange < 0 ? 'Baisse' : 'Stabilité'} de ${formatMoney(Math.abs(insight.expenseChange))} entre les bornes disponibles.`}
            </span>
          </div>
        </article>
        <article>
          {insight.auditStatus === 'balanced' ? <CheckCircle2 size={22} /> : <ShieldAlert size={22} />}
          <div>
            <strong>{auditLabels[insight.auditStatus] || insight.auditStatus}</strong>
            <span>{insight.anomalyCount} opération(s) signalée(s) par les contrôles existants.</span>
          </div>
        </article>
      </div>

      <p className="budget-intelligence-disclaimer">
        Ces explications n’écrivent aucune donnée et n’altèrent jamais la classification comptable.
      </p>
    </section>
  );
}
