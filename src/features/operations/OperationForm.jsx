import { Plus } from 'lucide-react';

/**
 * Présentation du formulaire d'opération. Les champs métier sont fournis par App pendant
 * la migration progressive; l'en-tête, l'annulation et la validation vivent désormais ici.
 * Le composant ne filtre aucun type métier : « reimbursement » reste un type valide.
 */
export default function OperationForm({
  editingId,
  onSubmit,
  onCancel,
  isValid,
  status,
  children,
}) {
  return (
    <section className="view">
      <form className="panel form-panel" onSubmit={onSubmit}>
        <div className="section-title">
          <h2>{editingId ? 'Modifier' : 'Ajouter'} une operation</h2>
          {editingId && (
            <button type="button" className="text-button" onClick={onCancel}>Annuler</button>
          )}
        </div>

        {children}

        <div className="operation-form-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Annuler</button>
          <button className="primary-button" type="submit" disabled={!isValid}>
            <Plus size={20} /> Enregistrer
          </button>
        </div>
        {!isValid && <p className="hint status-error" role="alert">Renseigne un libellé et un montant supérieur à zéro.</p>}
        {status && status !== 'Renseigne un libellé et un montant supérieur à zéro.' && (
          <p className="hint status-error" role="status">{status}</p>
        )}
      </form>
    </section>
  );
}
