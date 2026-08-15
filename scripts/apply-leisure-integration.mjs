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
          "import SavingsInterface, { REQUIRED_SAVINGS_GOALS, savingsBucketForDisplay } from './SavingsInterface.jsx';\nimport LeisureVacations from './LeisureVacations.jsx';",
        );
      }

      if (!patched.includes("import DuplicateAudit from './DuplicateAudit.jsx';")) {
        patched = patched.replace(
          "import LeisureVacations from './LeisureVacations.jsx';",
          "import LeisureVacations from './LeisureVacations.jsx';\nimport DuplicateAudit from './DuplicateAudit.jsx';",
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

      // Audit anti-doublons de l'historique du mois affiché.
      const historyAnchor = "        {activeView === 'history' && (\n          <section className=\"view\">\n            <div className=\"panel\">";
      if (!patched.includes('mode="history"')) {
        patched = patched.replace(
          historyAnchor,
          "        {activeView === 'history' && (\n          <section className=\"view\">\n            <DuplicateAudit mode=\"history\" operations={data.operations} selectedMonth={selectedMonth} />\n            <div className=\"panel\">",
        );
      }

      // Audit anti-doublons des frais fixes récurrents, visible dans Réglages.
      const settingsAnchor = "        {activeView === 'settings' && (\n          <section className=\"view\">";
      if (!patched.includes('mode="recurring"')) {
        patched = patched.replace(
          settingsAnchor,
          "        {activeView === 'settings' && (\n          <section className=\"view\">\n            <DuplicateAudit mode=\"recurring\" recurringExpenses={data.recurringFixedExpenses || []} />",
        );
      }

      // Accès permanent depuis la navigation principale, entre Historique et Messages.
      if (!patched.includes('label="Loisirs"')) {
        patched = patched.replace(
          '<NavButton icon={ReceiptText} label="Historique" active={activeView === \'history\'} onClick={() => setActiveView(\'history\')} />',
          '<NavButton icon={ReceiptText} label="Historique" active={activeView === \'history\'} onClick={() => setActiveView(\'history\')} />\n        <NavButton icon={Umbrella} label="Loisirs" active={activeView === \'leisure\'} onClick={() => setActiveView(\'leisure\')} />',
        );
      }

      if (!patched.includes("import LeisureVacations from './LeisureVacations.jsx';")
        || !patched.includes("import DuplicateAudit from './DuplicateAudit.jsx';")
        || !patched.includes('leisure-launch-card')
        || !patched.includes("activeView === 'leisure'")
        || !patched.includes('label="Loisirs"')
        || !patched.includes('mode="history"')
        || !patched.includes('mode="recurring"')) {
        throw new Error('Intégration Loisirs/Vacances + audit doublons incomplète');
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
console.log('Interface Loisirs/Vacances + audit anti-doublons intégrés.');
