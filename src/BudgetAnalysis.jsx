import { BarChart3, Lightbulb, ShieldPlus } from 'lucide-react';
import './BudgetAnalysis.css';

const money = (value) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
const monthLabel = (month) => new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })
  .format(new Date(`${month}-01T12:00:00`));

function trendText(trend) {
  if (!trend) return 'Une comparaison apparaîtra dès que deux mois terminés contiendront des données.';
  const direction = trend.difference > 0 ? 'augmenté' : trend.difference < 0 ? 'diminué' : 'été identiques';
  const amount = money(Math.abs(trend.difference));
  const percent = trend.percent === null ? '' : ` (${Math.abs(trend.percent).toFixed(1).replace('.', ',')} %)`;
  return `Les dépenses ont ${direction} de ${amount}${percent} entre ${monthLabel(trend.previousMonth)} et ${monthLabel(trend.latestMonth)}.`;
}

export default function BudgetAnalysis({ analysis }) {
  const { emergency } = analysis;
  return (
    <section className={`panel budget-analysis status-${analysis.status.key}`}>
      <div className="section-title">
        <h2><BarChart3 size={21} /> Analyse de votre budget</h2>
        <span>{analysis.isCurrentMonth ? 'Mois en cours' : 'Mois terminé'}</span>
      </div>
      <div className="budget-analysis-verdict">
        <Lightbulb size={22} />
        <div>
          <strong>{analysis.status.label}</strong>
          <span>Solde prévisionnel : {money(analysis.forecastBalance)} après les montants restant à couvrir.</span>
        </div>
      </div>
      <div className="budget-analysis-facts">
        <div><span>Disponible au début du mois</span><strong>{money(analysis.current.openingBalance)}</strong></div>
        <div><span>Revenus encaissés dans le mois</span><strong>{money(analysis.current.income)}</strong></div>
        <div><span>Revenus affectés au mois</span><strong>{money(analysis.current.assignedIncome)}</strong></div>
        <div><span>Transferts depuis l’épargne</span><strong>{money(analysis.current.savingsFunding)}</strong></div>
        <div><span>Ressources budgétaires cumulées</span><strong>{money(analysis.current.resources)}</strong></div>
        <div><span>Dépenses exécutées</span><strong>{money(analysis.current.expenses)}</strong></div>
        <div><span>Dépenses programmées</span><strong>{money(analysis.scheduledExpenseTotal)}</strong></div>
        <div><span>Nourriture encore prévue</span><strong>{money(analysis.remainingFoodBudget)}</strong></div>
      </div>
      <p className="budget-analysis-observation">{trendText(analysis.trend)}</p>
      <div className={`emergency-advice is-${emergency.key}`}>
        <ShieldPlus size={23} />
        <div>
          <strong>Fonds d’urgence : {money(emergency.saved)}</strong>
          <span>{emergency.reason}</span>
          {emergency.monthlySuggestion !== null ? (
            <b>Suggestion mensuelle de départ : {money(emergency.monthlySuggestion)}</b>
          ) : null}
        </div>
      </div>
      <details className="budget-analysis-method">
        <summary>Comment l’analyse est-elle calculée ?</summary>
        <p>
          Le disponible du début du mois est reconstitué depuis le solde Belfius du CSV, complété par les chèques repas. Il comprend donc déjà les salaires
          reçus en fin de mois précédent. Le champ « mois budgétaire concerné » rattache les salaires, employeurs et revenus complémentaires (par exemple l’ONEM) au bon mois sans modifier leur date bancaire.
          Les ajustements Belfius et transferts depuis l’épargne sont exclus des revenus. Le prévisionnel déduit les dépenses exécutées et programmées,
          mais pas le budget nourriture restant, qui demeure indicatif.
          La suggestion du fonds d’urgence exige trois mois terminés positifs. Elle retient le plus petit montant entre 10 % du revenu mensuel moyen
          et 25 % de la plus petite marge mensuelle, puis arrondit vers le bas par tranche de 5 €.
        </p>
      </details>
    </section>
  );
}
