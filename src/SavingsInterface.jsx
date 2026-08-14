import { Landmark, CheckCircle2, AlertTriangle } from 'lucide-react';
import BeobankStatementImport from './BeobankStatementImport.jsx';
import './BeobankStatementImport.css';
import './SavingsInterface.css';
import { SAVINGS_ORDER_RULES, savingsRuleForBucket } from './savingsOrderRules.js';

const money = (value) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function savingsBucketForDisplay(goal) {
  const text = normalize(`${goal?.label || ''} ${goal?.bucket || ''}`).trim();
  if (text.includes('vacance') || text.includes('loisir')) return 'vacances';
  if (text.includes('garage') || text.includes('entretien vehicule')) return 'garage';
  if (text.includes('taxe') || text.includes('impot')) return 'taxes';
  // Les anciennes cartes sont réutilisées : Voiture = solde Peugeot, Maison = frais maison/foyer.
  if (text === 'voiture' || text.includes('solde peugeot') || text.includes('epargne voiture')) return 'solde_peugeot';
  if (text === 'maison' || text.includes('frais divers maison') || text.includes('frais divers foyer') || text.includes('epargne maison')) return 'frais_maison';
  if (text.includes('pension alain')) return 'pension_alain';
  if (text.includes('pension esther')) return 'pension_esther';
  if (text.includes('urgence')) return 'urgence';
  if (text === 'autre' || text.includes('autre')) return 'autre';
  return goal?.bucket || goal?.id || 'autre';
}

function canonicalLabel(bucket, fallback) {
  return savingsRuleForBucket(bucket)?.label || fallback;
}

function preferredGoal(current, candidate) {
  if (!current) return candidate;
  const currentWeight = Math.abs(Number(current.saved || 0)) * 100000 + Math.abs(Number(current.target || 0));
  const candidateWeight = Math.abs(Number(candidate.saved || 0)) * 100000 + Math.abs(Number(candidate.target || 0));
  return candidateWeight > currentWeight ? candidate : current;
}

function SavingsCard({ goal, detected = 0, onUpdate }) {
  const bucket = savingsBucketForDisplay(goal);
  const rule = savingsRuleForBucket(bucket);
  const label = canonicalLabel(bucket, goal.label);
  const target = Number(goal.target || 0);
  const saved = Number(goal.saved || 0);
  const ratio = target > 0 ? Math.round((saved / target) * 100) : null;
  const progress = ratio === null ? 0 : Math.min(Math.max(ratio, 0), 100);
  const detectedOk = detected > 0;

  return (
    <article className="savings-op-card">
      <div className="savings-op-head">
        <div>
          <strong>{label}</strong>
          {rule && <span className="savings-op-ref">OP {rule.op}</span>}
        </div>
        {ratio !== null && <b>{ratio}%</b>}
      </div>
      {target > 0 && <div className="progress-track slim"><div className="progress-fill green" style={{ width: `${progress}%` }} /></div>}
      {rule && (
        <div className={detectedOk ? 'savings-op-control ok' : 'savings-op-control pending'}>
          {detectedOk ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{detectedOk ? `Versement identifié dans le CSV : ${money(detected)}` : 'Versement du mois à contrôler dans le prochain CSV'}</span>
          {rule.expectedMonthly != null && <em>Référence mensuelle : {money(rule.expectedMonthly)}</em>}
        </div>
      )}
      <div className="goal-inputs">
        <label>Mis de côté (épargne)
          <input type="text" inputMode="decimal" defaultValue={saved.toFixed(2).replace('.', ',')} onBlur={(event) => onUpdate(goal.id, 'saved', event.target.value)} />
        </label>
        <label>Objectif
          <input type="text" inputMode="decimal" defaultValue={target.toFixed(2).replace('.', ',')} onBlur={(event) => onUpdate(goal.id, 'target', event.target.value)} />
        </label>
      </div>
      {bucket === 'vacances' && (
        <BeobankStatementImport currentBalance={saved} onApply={(balance) => onUpdate(goal.id, 'saved', balance)} />
      )}
    </article>
  );
}

export default function SavingsInterface({ goals = [], bankSavings = {}, onUpdate }) {
  const byBucket = new Map();
  goals.forEach((goal) => {
    const bucket = savingsBucketForDisplay(goal);
    if (bucket === 'autre') return;
    byBucket.set(bucket, preferredGoal(byBucket.get(bucket), goal));
  });

  const order = ['solde_peugeot', 'vacances', 'garage', 'taxes', 'frais_maison', 'pension_alain', 'pension_esther', 'urgence'];
  const displayedGoals = [...byBucket.entries()]
    .sort(([bucketA], [bucketB]) => {
      const a = order.indexOf(bucketA);
      const b = order.indexOf(bucketB);
      return (a < 0 ? 999 : a) - (b < 0 ? 999 : b);
    })
    .map(([, goal]) => goal);

  const total = displayedGoals.reduce((sum, goal) => sum + Number(goal.saved || 0), 0);

  return (
    <section className="panel savings-interface">
      <div className="section-title">
        <h2><Landmark size={21} /> Épargne</h2>
        <span>{money(total)}</span>
      </div>
      <p className="hint">Les numéros d’ordre permanent servent d’identifiants bancaires. Le montant peut varier sans casser la reconnaissance.</p>
      <div className="goals-grid">
        {displayedGoals.map((goal) => {
          const bucket = savingsBucketForDisplay(goal);
          return <SavingsCard key={bucket} goal={goal} detected={bankSavings[bucket] || 0} onUpdate={onUpdate} />;
        })}
      </div>
    </section>
  );
}

export const REQUIRED_SAVINGS_GOALS = SAVINGS_ORDER_RULES.map((rule) => ({
  bucket: rule.bucket,
  label: rule.label,
  target: 0,
  saved: 0,
}));
