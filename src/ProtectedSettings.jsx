import { useEffect, useMemo, useState } from 'react';
import {
  Fingerprint,
  KeyRound,
  LockKeyhole,
  PiggyBank,
  Plus,
  Save,
  ShieldCheck,
  ShoppingBasket,
  UserRoundCog,
} from 'lucide-react';
import { householdId, supabase } from './infrastructure/supabase/supabaseClient.js';
import { parseMoney } from './domain/money/money.js';
import { normalizeStandingOrderReference, standingOrderAlreadyAssigned } from './lib/configurationRules.js';
import './ProtectedSettings.css';

const moneyInput = (value) => Number(value || 0).toFixed(2).replace('.', ',');

function friendlyAuthError(error) {
  const code = error?.code || '';
  if (code === 'passkey_disabled') return 'Face ID doit encore être activé dans la configuration sécurisée Supabase.';
  if (code === 'webauthn_credential_not_found') return 'Aucune passkey Face ID n’est encore enregistrée pour ce compte.';
  if (code === 'webauthn_credential_exists') return 'Face ID est déjà configuré sur cet appareil.';
  if (String(error?.message || '').toLowerCase().includes('cancel')) return 'Identification Face ID annulée.';
  return error?.message || 'Identification impossible.';
}

function SavingsSettingRow({ goal, savingsGoals, onSaved }) {
  const [draft, setDraft] = useState(() => ({
    label: goal.label || '',
    target: moneyInput(goal.target),
    monthlyAmount: moneyInput(goal.monthly_amount ?? goal.monthlyAmount),
    standingOrderReference: goal.standing_order_reference || goal.standingOrderReference || '',
    standingOrderDay: goal.standing_order_day || goal.standingOrderDay || '',
    active: goal.active !== false,
  }));
  const [status, setStatus] = useState('');

  useEffect(() => {
    setDraft({
      label: goal.label || '',
      target: moneyInput(goal.target),
      monthlyAmount: moneyInput(goal.monthly_amount ?? goal.monthlyAmount),
      standingOrderReference: goal.standing_order_reference || goal.standingOrderReference || '',
      standingOrderDay: goal.standing_order_day || goal.standingOrderDay || '',
      active: goal.active !== false,
    });
  }, [goal]);

  const save = async () => {
    const label = draft.label.trim();
    const target = parseMoney(draft.target);
    const monthlyAmount = parseMoney(draft.monthlyAmount);
    const day = draft.standingOrderDay === '' ? null : Number(draft.standingOrderDay);
    if (!label || !Number.isFinite(target) || target < 0 || !Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
      setStatus('Vérifie le nom et les montants.');
      return;
    }
    if (day != null && (!Number.isInteger(day) || day < 1 || day > 31)) {
      setStatus('Le jour de l’ordre permanent doit être compris entre 1 et 31.');
      return;
    }
    const originalReference = goal.standing_order_reference || goal.standingOrderReference || '';
    if (normalizeStandingOrderReference(draft.standingOrderReference) !== normalizeStandingOrderReference(originalReference)
      && standingOrderAlreadyAssigned(draft.standingOrderReference, savingsGoals, goal.id)) {
      setStatus('Ce numéro d’OP est déjà relié à un autre compte d’épargne.');
      return;
    }
    setStatus('Enregistrement…');
    const payload = {
      label,
      target,
      monthly_amount: monthlyAmount,
      standing_order_reference: draft.standingOrderReference.trim() || null,
      standing_order_day: day,
      active: draft.active,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('savings_goals')
      .update(payload)
      .eq('id', goal.id)
      .eq('household_id', householdId)
      .select('id, label, target, saved, bucket, monthly_amount, standing_order_reference, standing_order_day, active')
      .single();
    if (error) {
      setStatus(`Enregistrement impossible : ${error.message}`);
      return;
    }
    onSaved(data);
    setStatus('Compte d’épargne mis à jour.');
  };

  return (
    <article className="protected-setting-row">
      <div className="protected-card-heading">
        <span><PiggyBank size={18} /><strong>{draft.label || 'Compte d’épargne'}</strong></span>
        <span className={draft.active ? 'protected-badge active' : 'protected-badge inactive'}>
          {draft.active ? 'Actif' : 'Inactif'}
        </span>
      </div>
      <label>Nom du compte
        <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
      </label>
      <div className="protected-grid">
        <label>Objectif
          <input inputMode="decimal" value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} />
        </label>
        <label>Versement mensuel
          <input inputMode="decimal" value={draft.monthlyAmount} onChange={(event) => setDraft({ ...draft, monthlyAmount: event.target.value })} />
        </label>
      </div>
      <div className="protected-grid">
        <label>Numéro d’OP
          <input value={draft.standingOrderReference} onChange={(event) => setDraft({ ...draft, standingOrderReference: event.target.value })} placeholder="Ex. 18833987" />
        </label>
        <label>Jour prévu
          <input type="number" min="1" max="31" value={draft.standingOrderDay} onChange={(event) => setDraft({ ...draft, standingOrderDay: event.target.value })} />
        </label>
      </div>
      <label className="protected-check">
        <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
        Compte actif
      </label>
      <button type="button" className="secondary-button" onClick={save}><Save size={17} /> Enregistrer</button>
      {status && <p className="protected-status">{status}</p>}
    </article>
  );
}

export default function ProtectedSettings({
  session,
  selectedMonth,
  budgetSettings,
  carePeople,
  savingsGoals,
  onBudgetSettingsChange,
  onCarePeopleChange,
  onSavingsGoalsChange,
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('');
  const [foodBudget, setFoodBudget] = useState('500,00');
  const [effectiveMonth, setEffectiveMonth] = useState(selectedMonth);
  const [newPerson, setNewPerson] = useState('');
  const [newSavings, setNewSavings] = useState({ label: '', saved: '0,00', target: '0,00', monthlyAmount: '0,00', op: '', day: '' });
  const [sectionStatus, setSectionStatus] = useState('');

  const passkeySupported = useMemo(() => (
    Boolean(window.PublicKeyCredential && supabase?.auth?.registerPasskey && supabase?.auth?.signInWithPasskey)
  ), []);

  useEffect(() => {
    setEffectiveMonth(selectedMonth);
    const applicable = [...budgetSettings]
      .filter((row) => String(row.effective_month || row.effectiveMonth || '') <= selectedMonth)
      .sort((a, b) => String(b.effective_month || b.effectiveMonth).localeCompare(String(a.effective_month || a.effectiveMonth)))[0];
    setFoodBudget(moneyInput(applicable?.food_budget ?? applicable?.foodBudget ?? 500));
  }, [budgetSettings, selectedMonth]);

  useEffect(() => {
    if (!unlocked) return undefined;
    const lock = () => setUnlocked(false);
    const timeoutId = window.setTimeout(lock, 10 * 60 * 1000);
    const lockWhenHidden = () => {
      if (document.visibilityState === 'hidden') lock();
    };
    document.addEventListener('visibilitychange', lockWhenHidden);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', lockWhenHidden);
    };
  }, [unlocked]);

  const unlockWithPassword = async (event) => {
    event.preventDefault();
    if (!session?.user?.email || !password) return;
    setAuthStatus('Vérification…');
    const previousUserId = session.user.id;
    const { data, error } = await supabase.auth.signInWithPassword({ email: session.user.email, password });
    setPassword('');
    if (error || data.user?.id !== previousUserId) {
      setAuthStatus(error ? `Accès refusé : ${friendlyAuthError(error)}` : 'Accès refusé.');
      return;
    }
    setUnlocked(true);
    setAuthStatus('Paramètres déverrouillés pour cette visite.');
  };

  const unlockWithFaceId = async () => {
    setAuthStatus('Identification Face ID…');
    const expectedUserId = session?.user?.id;
    const { data, error } = await supabase.auth.signInWithPasskey();
    if (error || data.user?.id !== expectedUserId) {
      setAuthStatus(error ? friendlyAuthError(error) : 'La passkey ne correspond pas au compte connecté.');
      return;
    }
    setUnlocked(true);
    setAuthStatus('Face ID confirmé.');
  };

  const registerFaceId = async () => {
    setAuthStatus('Configuration de Face ID…');
    const { error } = await supabase.auth.registerPasskey();
    setAuthStatus(error ? friendlyAuthError(error) : 'Face ID est maintenant associé à Mon Foyer sur cet appareil.');
  };

  const saveFoodBudget = async () => {
    const value = parseMoney(foodBudget);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth) || !Number.isFinite(value) || value < 0) {
      setSectionStatus('Vérifie le mois et le montant du budget nourriture.');
      return;
    }
    const payload = { household_id: householdId, effective_month: effectiveMonth, food_budget: value, updated_by: session.user.id, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('household_budget_settings').upsert(payload, { onConflict: 'household_id,effective_month' }).select().single();
    if (error) { setSectionStatus(`Budget non enregistré : ${error.message}`); return; }
    onBudgetSettingsChange((current) => [...current.filter((row) => (row.effective_month || row.effectiveMonth) !== effectiveMonth), data]);
    setSectionStatus(`Budget nourriture enregistré à partir de ${effectiveMonth}.`);
  };

  const addPerson = async () => {
    const name = newPerson.trim();
    if (!name) return;
    const { data, error } = await supabase.from('care_people').insert({ household_id: householdId, name }).select().single();
    if (error) { setSectionStatus(error.code === '23505' ? 'Cette personne existe déjà.' : `Ajout impossible : ${error.message}`); return; }
    onCarePeopleChange((current) => [...current, data]);
    setNewPerson('');
    setSectionStatus(`${name} est maintenant relié aux dépenses à récupérer.`);
  };

  const togglePerson = async (person) => {
    const active = person.active === false;
    const { data, error } = await supabase.from('care_people').update({ active, updated_at: new Date().toISOString() }).eq('id', person.id).eq('household_id', householdId).select().single();
    if (error) { setSectionStatus(`Modification impossible : ${error.message}`); return; }
    onCarePeopleChange((current) => current.map((row) => row.id === data.id ? data : row));
  };

  const addSavingsGoal = async () => {
    const label = newSavings.label.trim();
    const saved = parseMoney(newSavings.saved);
    const target = parseMoney(newSavings.target);
    const monthlyAmount = parseMoney(newSavings.monthlyAmount);
    const day = newSavings.day === '' ? null : Number(newSavings.day);
    if (!label || [saved, target, monthlyAmount].some((value) => !Number.isFinite(value) || value < 0) || (day != null && (day < 1 || day > 31))) {
      setSectionStatus('Vérifie le nouveau compte d’épargne.');
      return;
    }
    if (standingOrderAlreadyAssigned(newSavings.op, savingsGoals)) {
      setSectionStatus('Ce numéro d’OP est déjà relié à un autre compte d’épargne.');
      return;
    }
    const payload = {
      household_id: householdId,
      label,
      saved,
      target,
      monthly_amount: monthlyAmount,
      standing_order_reference: newSavings.op.trim() || null,
      standing_order_day: day,
      bucket: `custom_${crypto.randomUUID().replaceAll('-', '')}`,
      active: true,
    };
    const { data, error } = await supabase.from('savings_goals').insert(payload).select('id, label, target, saved, bucket, monthly_amount, standing_order_reference, standing_order_day, active').single();
    if (error) { setSectionStatus(`Création impossible : ${error.message}`); return; }
    onSavingsGoalsChange((current) => [...current, data]);
    setNewSavings({ label: '', saved: '0,00', target: '0,00', monthlyAmount: '0,00', op: '', day: '' });
    setSectionStatus(`Le compte « ${label} » a été créé.`);
  };

  const replaceSavingsGoal = (savedGoal) => {
    onSavingsGoalsChange((current) => current.map((goal) => goal.id === savedGoal.id ? { ...goal, ...savedGoal } : goal));
  };

  if (!unlocked) {
    return (
      <section className="panel protected-settings locked">
        <div className="section-title"><h2><LockKeyhole size={21} /> Paramètres protégés</h2><span>Verrouillés</span></div>
        <p className="hint">Budget nourriture, personnes à rembourser et comptes d’épargne.</p>
        <form onSubmit={unlockWithPassword} className="protected-unlock-form">
          <label>Mot de passe du compte
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="primary-button" type="submit"><KeyRound size={18} /> Déverrouiller</button>
        </form>
        {passkeySupported && <button className="secondary-button" type="button" onClick={unlockWithFaceId}><Fingerprint size={19} /> Utiliser Face ID</button>}
        {authStatus && <p className="protected-status">{authStatus}</p>}
      </section>
    );
  }

  return (
    <section className="panel protected-settings">
      <div className="section-title"><h2><ShieldCheck size={21} /> Paramètres protégés</h2><span>Déverrouillés</span></div>
      <div className="protected-security-actions">
        <button className="secondary-button" type="button" onClick={() => setUnlocked(false)}><LockKeyhole size={17} /> Reverrouiller</button>
        {passkeySupported && <button className="secondary-button" type="button" onClick={registerFaceId}><Fingerprint size={19} /> Configurer Face ID</button>}
      </div>
      {authStatus && <p className="protected-status">{authStatus}</p>}

      <div className="protected-subsection">
        <h3><ShoppingBasket size={19} /> Budget nourriture</h3>
        <div className="protected-grid">
          <label>À partir du mois
            <input type="month" value={effectiveMonth} onChange={(event) => setEffectiveMonth(event.target.value)} />
          </label>
          <label>Montant mensuel
            <input inputMode="decimal" value={foodBudget} onChange={(event) => setFoodBudget(event.target.value)} />
          </label>
        </div>
        <button className="secondary-button" type="button" onClick={saveFoodBudget}><Save size={17} /> Enregistrer le budget</button>
        <p className="hint">Le nouveau montant s’applique à partir du mois choisi, sans modifier les mois antérieurs.</p>
      </div>

      <div className="protected-subsection">
        <h3><UserRoundCog size={19} /> Personnes et remboursements</h3>
        <div className="protected-add-row">
          <input value={newPerson} onChange={(event) => setNewPerson(event.target.value)} placeholder="Nouvelle personne" />
          <button type="button" onClick={addPerson} aria-label="Ajouter la personne"><Plus size={19} /></button>
        </div>
        <div className="protected-people-list">
          {carePeople.map((person) => (
            <div key={person.id}><strong>{person.name}</strong><button type="button" className="secondary-button" onClick={() => togglePerson(person)}>{person.active === false ? 'Réactiver' : 'Désactiver'}</button></div>
          ))}
        </div>
        <p className="hint">Une personne désactivée reste dans l’historique, mais n’apparaît plus dans les nouvelles saisies.</p>
      </div>

      <div className="protected-subsection">
        <h3><PiggyBank size={19} /> Comptes d’épargne</h3>
        <div className="protected-setting-row new-savings-row">
          <div className="protected-card-heading">
            <span><Plus size={18} /><strong>Nouveau compte</strong></span>
          </div>
          <label>Nom du nouveau compte<input value={newSavings.label} onChange={(event) => setNewSavings({ ...newSavings, label: event.target.value })} placeholder="Ex. Travaux terrasse" /></label>
          <div className="protected-grid">
            <label>Solde initial<input inputMode="decimal" value={newSavings.saved} onChange={(event) => setNewSavings({ ...newSavings, saved: event.target.value })} /></label>
            <label>Objectif<input inputMode="decimal" value={newSavings.target} onChange={(event) => setNewSavings({ ...newSavings, target: event.target.value })} /></label>
          </div>
          <div className="protected-grid">
            <label>Versement mensuel<input inputMode="decimal" value={newSavings.monthlyAmount} onChange={(event) => setNewSavings({ ...newSavings, monthlyAmount: event.target.value })} /></label>
            <label>Jour prévu<input type="number" min="1" max="31" value={newSavings.day} onChange={(event) => setNewSavings({ ...newSavings, day: event.target.value })} /></label>
          </div>
          <label>Numéro d’OP<input value={newSavings.op} onChange={(event) => setNewSavings({ ...newSavings, op: event.target.value })} /></label>
          <button className="primary-button" type="button" onClick={addSavingsGoal}><Plus size={18} /> Créer le compte</button>
        </div>
        {savingsGoals.map((goal) => <SavingsSettingRow key={goal.id} goal={goal} savingsGoals={savingsGoals} onSaved={replaceSavingsGoal} />)}
      </div>
      {sectionStatus && <p className="protected-status">{sectionStatus}</p>}
    </section>
  );
}
