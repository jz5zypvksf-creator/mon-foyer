import { CalendarDays, Gauge, Sparkles, TrendingUp } from 'lucide-react';

const euro = (value) => new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
}).format(Number(value) || 0);

const monthLabel = (monthKey) => {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
};

export default function FoodBudgetAnalysis({ pace, recommendation }) {
  const statusText = pace.status === 'over'
    ? 'Budget mensuel dépassé'
    : pace.status === 'watch'
      ? 'Rythme supérieur au budget journalier'
      : 'Rythme maîtrisé';

  return (
    <section className={`panel food-budget-analysis status-${pace.status}`}>
      <div className="section-title">
        <h2><Gauge size={20} /> Analyse nourriture</h2>
        <span>{pace.elapsedDays}/{pace.totalDays} jours</span>
      </div>

      <div className="food-analysis-status">
        <CalendarDays size={19} />
        <div><strong>{statusText}</strong><span>Calculé uniquement sur les achats nourriture du foyer.</span></div>
      </div>

      <div className="food-analysis-grid">
        <div><span>Budget moyen/jour</span><strong>{euro(pace.budgetPerDay)}</strong></div>
        <div><span>Dépensé/jour à ce jour</span><strong>{euro(pace.actualPerDay)}</strong></div>
        <div><span>Projection fin de mois</span><strong>{euro(pace.projectedMonth)}</strong></div>
        <div><span>Disponible/jour restant</span><strong>{euro(pace.remainingPerDay)}</strong></div>
      </div>

      <div className="food-recommendation">
        <div className="food-recommendation-title"><Sparkles size={19} /><strong>Suggestion mensuelle</strong></div>
        {!recommendation.ready ? (
          <p>
            L’analyse attend trois mois entièrement terminés. Historique exploitable :
            {' '}{recommendation.auditedMonths.length}/3 mois.
          </p>
        ) : (
          <>
            <p>
              Sur les trois derniers mois terminés, la dépense moyenne est de
              {' '}{euro(recommendation.average)}. Budget conseillé pour
              {' '}{monthLabel(recommendation.effectiveMonth)} :
            </p>
            <div className="food-suggestion-amount">
              <TrendingUp size={19} />
              <strong>{euro(recommendation.suggestedBudget)}</strong>
              <span>
                {recommendation.adjustment === 0
                  ? 'Maintien conseillé'
                  : `${recommendation.adjustment > 0 ? '+' : ''}${euro(recommendation.adjustment)} maximum ce mois-ci`}
              </span>
            </div>
            <small>
              Proposition fondée sur la médiane des trois mois, avec 5 % de marge et une
              évolution limitée à 5 % ou 25 €. Elle n’est jamais appliquée automatiquement.
            </small>
          </>
        )}
      </div>
    </section>
  );
}

