import fs from 'node:fs';

const path = 'vite.config.js';
let source = fs.readFileSync(path, 'utf8');

function leisureVacationsIntegration() {
  return {
    name: 'mon-foyer-leisure-vacations',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') && !id.endsWith('\\src\\App.jsx')) return null;
      let patched = code;

      if (!patched.includes("import LeisureVacations from './LeisureVacations.jsx';")) {
        patched = patched.replace(
          "import SavingsInterface, { REQUIRED_SAVINGS_GOALS, savingsBucketForDisplay } from './SavingsInterface.jsx';",
          "import SavingsInterface, { REQUIRED_SAVINGS_GOALS, savingsBucketForDisplay } from './SavingsInterface.jsx';\nimport LeisureVacations from './LeisureVacations.jsx';\nimport './NavSix.css';",
        );
      } else if (!patched.includes("import './NavSix.css';")) {
        patched = patched.replace(
          "import LeisureVacations from './LeisureVacations.jsx';",
          "import LeisureVacations from './LeisureVacations.jsx';\nimport './NavSix.css';",
        );
      }

      if (!patched.includes("import DuplicateAudit from './DuplicateAudit.jsx';")) {
        patched = patched.replace(
          "import LeisureVacations from './LeisureVacations.jsx';",
          "import LeisureVacations from './LeisureVacations.jsx';\nimport DuplicateAudit from './DuplicateAudit.jsx';",
        );
      }

      // Une opération passée ou datée d'aujourd'hui est exécutée, pas programmée.
      patched = patched.replace(
        ".filter((operation) => operation.type !== 'income' && operation.date > scheduleCutoff);",
        ".filter((operation) => operation.type !== 'income' && operation.date > today);",
      );
      patched = patched.replace(
        "        operation.date > scheduleCutoff\n        && !existingFixedSignatures.has(fixedExpenseSignature(operation))",
        "        operation.date > today\n        && !existingFixedSignatures.has(fixedExpenseSignature(operation))",
      );

      // Lecture budgétaire mensuelle : le grand solde est Revenus budgétaires du mois
      // moins dépenses exécutées du mois. Le report historique des moyens de paiement
      // reste visible séparément mais n'altère plus le résultat du mois.
      patched = patched.replace(
        "  const availableForPayments = useMemo(\n    () => PAYMENT_METHODS.reduce((sum, method) => sum + (paymentBalances[method] || 0), 0),\n    [paymentBalances],\n  );",
        "  const availableForPayments = totals.balance;",
      );

      // Le budget nourriture restant est une enveloppe indicative, pas une dépense déjà engagée.
      // Le prévisionnel financier ne déduit donc que les opérations effectivement programmées.
      patched = patched.replace(
        "  const totalRemainingToCover = scheduledExpenseTotal + remainingFoodBudget;",
        "  const totalRemainingToCover = scheduledExpenseTotal;",
      );
      patched = patched.replace(
        '<span>Dépenses programmées : {formatCurrency(scheduledExpenseTotal)}</span>\n                  <span>Budget nourriture restant : {formatCurrency(remainingFoodBudget)}</span>',
        '<span>Dépenses programmées : {formatCurrency(scheduledExpenseTotal)}</span>\n                  <span>Budget nourriture restant : {formatCurrency(remainingFoodBudget)} · indicatif, non déduit</span>',
      );
      patched = patched.replace(
        '<div><span>− Budget nourriture restant</span><strong>− {formatCurrency(remainingFoodBudget)}</strong></div>',
        '<div><span>Budget nourriture restant (indicatif)</span><strong>{formatCurrency(remainingFoodBudget)}</strong></div>',
      );
      patched = patched.replace(
        '<span>Disponible pour les paiements</span>\n                <strong>{formatCurrency(availableForPayments)}</strong>',
        '<span>Solde budgétaire du mois</span>\n                <strong>{formatCurrency(availableForPayments)}</strong>',
      );
      patched = patched.replace(
        '<span>Disponible actuel : {formatCurrency(availableForPayments)}</span>',
        '<span>Solde budgétaire actuel : {formatCurrency(availableForPayments)}</span>',
      );
      patched = patched.replace(
        '<div><span>Disponible actuel</span><strong>{formatCurrency(availableForPayments)}</strong></div>',
        '<div><span>Solde budgétaire actuel</span><strong>{formatCurrency(availableForPayments)}</strong></div>',
      );

      // Totaux lisibles en un coup d'œil.
      patched = patched.replace(
        '<h2>Dépenses programmées</h2>\n                <strong>{formatCurrency(scheduledExpenseTotal)}</strong>',
        '<h2>Dépenses programmées</h2>\n                <strong>Total : {formatCurrency(scheduledExpenseTotal)}</strong>',
      );
      patched = patched.replace(
        'const careSummary = useMemo(() => careBalances(data.operations), [data.operations]);',
        "const careSummary = useMemo(() => careBalances(data.operations, selectedMonth), [data.operations, selectedMonth]);\n  const careTotalToRecover = careSummary.reduce((sum, item) => sum + Math.max(Number(item.balance || 0), 0), 0);",
      );
      patched = patched.replace(
        '<div className="section-title"><h2>Dépenses à récupérer</h2><span>Papa & Nonna</span></div>',
        '<div className="section-title"><h2>Dépenses à récupérer</h2><strong>Total : {formatCurrency(careTotalToRecover)}</strong></div><p className="scheduled-caption">Papa & Nonna</p>',
      );

      // Contrôle explicite de l'écart entre la comptabilité Mon Foyer et le dernier solde Belfius.
      const scheduledAnchor = '            <section className="panel scheduled-panel">';
      if (!patched.includes('Contrôle de la balance Belfius')) {
        patched = patched.replace(
          scheduledAnchor,
          `            {belfiusSnapshot && (\n              <section className="panel">\n                <div className="section-title"><h2>Contrôle de la balance Belfius</h2><strong className={Math.abs(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0)) < 0.01 ? 'income' : 'expense'}>{formatCurrency(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0))}</strong></div>\n                <div className="history-summary">\n                  <div><span>Solde Mon Foyer cumulé</span><strong>{formatCurrency(paymentBalances['Compte Belfius'] || 0)}</strong></div>\n                  <div><span>Solde Belfius réel</span><strong>{formatCurrency(belfiusSnapshot.balance || 0)}</strong></div>\n                  <div><span>Écart comptable</span><strong className={Math.abs(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0)) < 0.01 ? 'income' : 'expense'}>{formatCurrency(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0))}</strong></div>\n                </div>\n                <p className="hint">Ce contrôle bancaire est distinct du solde budgétaire mensuel. {Math.abs(Number(belfiusSnapshot.balance || 0) - Number(paymentBalances['Compte Belfius'] || 0)) < 0.01 ? 'Balance conforme au dernier relevé Belfius.' : 'Écart à auditer : il peut provenir d’un solde d’ouverture absent, d’une écriture manquante ou d’un doublon. Aucun ajustement automatique n’est effectué.'}</p>\n              </section>\n            )}\n\n${scheduledAnchor}`,
        );
      }

      const savingsBlock = '<SavingsInterface goals={data.savingsGoals} bankSavings={bankSavings} onUpdate={updateGoal} />';
      if (!patched.includes('leisure-launch-card')) {
        patched = patched.replace(
          savingsBlock,
          `${savingsBlock}\n            <div className="leisure-launch-card">\n              <div><strong>Loisirs / Vacances</strong><span>Suivre le solde Beobank et enregistrer restaurants, hôtels et voyages.</span></div>\n              <button type="button" onClick={() => setActiveView('leisure')}>Ouvrir</button>\n            </div>`,
        );
      }

      const addViewAnchor = "        {activeView === 'add' && (";
      if (!patched.includes("activeView === 'leisure'")) {
        patched = patched.replace(
          addViewAnchor,
          `        {activeView === 'leisure' && (\n          <LeisureVacations\n            goal={data.savingsGoals.find((goal) => savingsBucketForGoal(goal) === 'vacances')}\n            onUpdateGoal={updateGoal}\n            onBack={() => setActiveView('home')}\n          />\n        )}\n\n${addViewAnchor}`,
        );
      }

      const historyAnchor = "        {activeView === 'history' && (\n          <section className=\"view\">\n            <div className=\"panel\">";
      if (!patched.includes('mode="history"')) {
        patched = patched.replace(
          historyAnchor,
          "        {activeView === 'history' && (\n          <section className=\"view\">\n            <DuplicateAudit mode=\"history\" operations={data.operations} selectedMonth={selectedMonth} onDeleteOperation={(row) => deleteOperation(row.id)} />\n            <div className=\"panel\">",
        );
      }

      const settingsAnchor = "        {activeView === 'settings' && (\n          <section className=\"view\">";
      if (!patched.includes('mode="recurring"')) {
        patched = patched.replace(
          settingsAnchor,
          "        {activeView === 'settings' && (\n          <section className=\"view\">\n            <DuplicateAudit mode=\"recurring\" recurringExpenses={data.recurringFixedExpenses || []} onDeleteRecurring={(row) => deleteRecurringFixedExpense(row.id)} />",
        );
      }

      if (!patched.includes('label="Loisirs"')) {
        patched = patched.replace(
          '<NavButton icon={ReceiptText} label="Historique" active={activeView === \'history\'} onClick={() => setActiveView(\'history\')} />',
          '<NavButton icon={ReceiptText} label="Historique" active={activeView === \'history\'} onClick={() => setActiveView(\'history\')} />\n        <NavButton icon={Umbrella} label="Loisirs" active={activeView === \'leisure\'} onClick={() => setActiveView(\'leisure\')} />',
        );
      }

      if (!patched.includes("import LeisureVacations from './LeisureVacations.jsx';")
        || !patched.includes("import DuplicateAudit from './DuplicateAudit.jsx';")
        || !patched.includes('Total : {formatCurrency(careTotalToRecover)}')
        || !patched.includes('Contrôle de la balance Belfius')
        || !patched.includes('const availableForPayments = totals.balance;')
        || !patched.includes('const totalRemainingToCover = scheduledExpenseTotal;')
        || !patched.includes('onDeleteOperation={(row) => deleteOperation(row.id)}')
        || !patched.includes('onDeleteRecurring={(row) => deleteRecurringFixedExpense(row.id)}')
        || !patched.includes("operation.type !== 'income' && operation.date > today")) {
        throw new Error('Intégration finale Loisirs/Audit/Totaux/Balance mensuelle incomplète');
      }
      return { code: patched, map: null };
    },
  };
}

const exportMarker = '\nexport default defineConfig(';
const exportIndex = source.indexOf(exportMarker);
if (exportIndex < 0) throw new Error('vite.config.js: export marker introuvable');

const existingStart = source.lastIndexOf('function leisureVacationsIntegration()', exportIndex);
if (existingStart >= 0) source = source.slice(0, existingStart) + leisureVacationsIntegration.toString() + '\n' + source.slice(exportIndex);
else source = source.slice(0, exportIndex) + '\n' + leisureVacationsIntegration.toString() + '\n' + source.slice(exportIndex);

source = source.replace(
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careHotfixIntegration(), careUxFinalIntegration(), react()]',
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careHotfixIntegration(), leisureVacationsIntegration(), careUxFinalIntegration(), react()]',
);

if (!source.includes('leisureVacationsIntegration()')) throw new Error('Plugin Loisirs/Vacances non branché');
fs.writeFileSync(path, source);
console.log('Interface Loisirs/Vacances + balance budgétaire mensuelle intégrées.');
