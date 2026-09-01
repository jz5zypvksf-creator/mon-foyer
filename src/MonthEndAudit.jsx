import { AlertTriangle, CheckCircle2, Landmark, PiggyBank, RefreshCw, Scale, WalletCards } from 'lucide-react';
import { monthlyAccountingPresentation } from './lib/monthlyAccountingPresentation.js';
import { formatMoney } from './domain/money/money.js';
import './MonthEndAudit.css';
const statusLabel = { balanced: 'Balance contrôlée', review: 'À compléter', critical: 'Anomalies à corriger' };

function AmountRow({ label, value, strong = false, note = '' }) {
  return (
    <div className={strong ? 'month-end-row is-total' : 'month-end-row'}>
      <span>{label}{note && <small>{note}</small>}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

export default function MonthEndAudit({ audit, month, running, onRun, nextMonthIncome = 0, patrimony = {} }) {
  const presentation = monthlyAccountingPresentation(audit, nextMonthIncome);

  return (
    <section className={`panel month-end-audit status-${audit?.status || 'pending'}`}>
      <div className="section-title">
        <h2><Scale size={21} /> Clôture comptable mensuelle</h2>
        <span>{month}</span>
      </div>
      {!audit ? (
        <div className="month-end-empty"><AlertTriangle size={22} /><span>Aucune clôture enregistrée pour ce mois.</span></div>
      ) : (
        <>
          <div className="month-end-status">
            {audit.status === 'balanced' ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
            <div><strong>{statusLabel[audit.status] || audit.status}</strong><small>Audit du {new Date(audit.generated_at).toLocaleString('fr-BE')}</small></div>
          </div>
          <div className="month-end-sections">
            <section className="month-end-block">
              <h3><Scale size={18} /> 1. Résultat du mois</h3>
              <AmountRow label="Revenus affectés au mois" value={presentation.assignedIncome} />
              <AmountRow label="Remboursements" value={presentation.reimbursements} />
              <AmountRow label="Dépenses réelles" value={-presentation.expenses} />
              <AmountRow label="Résultat budgétaire" value={presentation.budgetResult} strong />
              <p>Le solde d’ouverture n’est jamais considéré comme un revenu.</p>
            </section>
            <section className="month-end-block">
              <h3><PiggyBank size={18} /> 2. Mouvements d’épargne</h3>
              <AmountRow label="Versements vers l’épargne" value={-presentation.savingsTransfers} />
              <AmountRow label="Retraits depuis l’épargne" value={presentation.savingsWithdrawals} />
              <AmountRow label="Effort net d’épargne" value={presentation.netSavingsEffort} />
              <AmountRow label="Après mouvements d’épargne" value={presentation.cashAfterSavings} strong />
              <p>Ces transferts déplacent l’argent sans devenir une dépense ou un revenu.</p>
            </section>
            <section className="month-end-block">
              <h3><Landmark size={18} /> 3. Trésorerie bancaire</h3>
              <AmountRow label="Solde d’ouverture" value={presentation.openingBalance} />
              <AmountRow label="Revenus encaissés pendant le mois" value={presentation.incomeReceivedDuringMonth} />
              <AmountRow label="Déjà reçus pour le mois suivant" value={presentation.nextMonthIncome} note="Exclus du résultat de ce mois" />
              {presentation.bankBalance != null && <AmountRow label="Solde Belfius certifié" value={presentation.bankBalance} strong />}
            </section>
            <section className="month-end-block">
              <h3><WalletCards size={18} /> 4. Situation financière actuelle</h3>
              <AmountRow label="Compte Belfius" value={patrimony.belfius} />
              <AmountRow label="Compte Beobank" value={patrimony.beobank} />
              <AmountRow label="Autres comptes d’épargne" value={patrimony.otherSavings} />
              <AmountRow label="Chèques-repas" value={patrimony.mealVouchers} />
              <AmountRow label="Encours Mastercard" value={-Math.abs(Number(patrimony.mastercard) || 0)} />
              <AmountRow label="Patrimoine financier net" value={patrimony.net} strong />
            </section>
          </div>
          {(audit.anomalies || []).length > 0 && <ul className="month-end-anomalies">{audit.anomalies.map((anomaly) => <li key={anomaly.code}>{anomaly.message}</li>)}</ul>}
        </>
      )}
      <button className="secondary-button month-end-run" type="button" onClick={onRun} disabled={running}>
        <RefreshCw size={17} className={running ? 'is-spinning' : ''} />
        {running ? 'Audit en cours…' : 'Relancer l’audit complet'}
      </button>
      <p className="month-end-note">Budget, épargne, banque et patrimoine sont volontairement séparés pour éviter tout double comptage.</p>
    </section>
  );
}
