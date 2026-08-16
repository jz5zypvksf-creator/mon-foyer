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

      patched = patched.replace(
        ".filter((operation) => operation.type !== 'income' && operation.date > scheduleCutoff);",
        ".filter((operation) => operation.type !== 'income' && operation.date > today);",
      );
      patched = patched.replace(
        "        operation.date > scheduleCutoff\n        && !existingFixedSignatures.has(fixedExpenseSignature(operation))",
        "        operation.date > today\n        && !existingFixedSignatures.has(fixedExpenseSignature(operation))",
      );

      patched = patched.replace(
        '<h2>Dépenses programmées</h2>\n                <strong>{formatCurrency(scheduledExpenseTotal)}</strong>',
        '<h2>Dépenses programmées</h2>\n                <strong>Total : {formatCurrency(scheduledExpenseTotal)}</strong>',
      );

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
          "        {activeView === 'history' && (\n          <section className=\"view\">\n            <DuplicateAudit mode=\"history\" operations={data.operations} selectedMonth={selectedMonth} />\n            <div className=\"panel\">",
        );
      }

      const settingsAnchor = "        {activeView === 'settings' && (\n          <section className=\"view\">";
      if (!patched.includes('mode="recurring"')) {
        patched = patched.replace(
          settingsAnchor,
          "        {activeView === 'settings' && (\n          <section className=\"view\">\n            <DuplicateAudit mode=\"recurring\" recurringExpenses={data.recurringFixedExpenses || []} />",
        );
      }

      if (!patched.includes('label="Loisirs"')) {
        patched = patched.replace(
          '<NavButton icon={ReceiptText} label="Historique" active={activeView === \'history\'} onClick={() => setActiveView(\'history\')} />',
          '<NavButton icon={ReceiptText} label="Historique" active={activeView === \'history\'} onClick={() => setActiveView(\'history\')} />\n        <NavButton icon={Umbrella} label="Loisirs" active={activeView === \'leisure\'} onClick={() => setActiveView(\'leisure\')} />',
        );
      }

      if (!patched.includes("import LeisureVacations from './LeisureVacations.jsx';")
        || !patched.includes("import './NavSix.css';")
        || !patched.includes("import DuplicateAudit from './DuplicateAudit.jsx';")
        || !patched.includes('leisure-launch-card')
        || !patched.includes("activeView === 'leisure'")
        || !patched.includes('label="Loisirs"')
        || !patched.includes('mode="history"')
        || !patched.includes('mode="recurring"')
        || !patched.includes("operation.type !== 'income' && operation.date > today")
        || !patched.includes('Total : {formatCurrency(scheduledExpenseTotal)}')) {
        throw new Error('Intégration Loisirs/Vacances + audit + total programmé incomplète');
      }
      return { code: patched, map: null };
    },
  };
}

function quickTotalsIntegration() {
  return {
    name: 'mon-foyer-quick-totals',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') && !id.endsWith('\\src\\App.jsx')) return null;
      let patched = code;

      const careSummaryLine = 'const careSummary = useMemo(() => careBalances(data.operations, selectedMonth), [data.operations, selectedMonth]);';
      if (patched.includes(careSummaryLine) && !patched.includes('const careTotalToRecover =')) {
        patched = patched.replace(
          careSummaryLine,
          `${careSummaryLine}\n  const careTotalToRecover = careSummary.reduce((sum, item) => sum + Math.max(Number(item.balance || 0), 0), 0);`,
        );
      }

      patched = patched.replace(
        '<div className="section-title"><h2>Dépenses à récupérer</h2><span>Papa & Nonna</span></div>',
        '<div className="section-title"><h2>Dépenses à récupérer</h2><strong>Total : {formatCurrency(careTotalToRecover)}</strong></div><p className="scheduled-caption">Papa & Nonna</p>',
      );

      if (!patched.includes('const careTotalToRecover =') || !patched.includes('Total : {formatCurrency(careTotalToRecover)}')) {
        throw new Error('Total global des dépenses à récupérer non intégré');
      }
      return { code: patched, map: null };
    },
  };
}

const exportMarker = '\nexport default defineConfig(';
const exportIndex = source.indexOf(exportMarker);
if (exportIndex < 0) throw new Error('vite.config.js: export marker introuvable');

const replaceFunction = (name, fn) => {
  const start = source.lastIndexOf(`function ${name}()`, exportIndex);
  if (start < 0) {
    source = source.slice(0, exportIndex) + '\n' + fn.toString() + '\n' + source.slice(exportIndex);
    return;
  }
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const end = nextFunction >= 0 && nextFunction < exportIndex ? nextFunction : exportIndex;
  source = source.slice(0, start) + fn.toString() + '\n' + source.slice(end);
};

replaceFunction('leisureVacationsIntegration', leisureVacationsIntegration);
replaceFunction('quickTotalsIntegration', quickTotalsIntegration);

source = source.replace(
  /plugins:\s*\[([^\]]*)\]/,
  (match, inner) => {
    const names = inner.split(',').map((item) => item.trim()).filter(Boolean);
    const without = names.filter((item) => item !== 'leisureVacationsIntegration()' && item !== 'quickTotalsIntegration()');
    const careIndex = without.indexOf('careUxFinalIntegration()');
    if (careIndex >= 0) {
      without.splice(careIndex, 0, 'leisureVacationsIntegration()');
      without.splice(careIndex + 2, 0, 'quickTotalsIntegration()');
    } else {
      without.push('leisureVacationsIntegration()', 'quickTotalsIntegration()');
    }
    return `plugins: [${without.join(', ')}]`;
  },
);

if (!source.includes('leisureVacationsIntegration()') || !source.includes('quickTotalsIntegration()')) {
  throw new Error('Plugins Preview non branchés');
}
fs.writeFileSync(path, source);
console.log('Interface Loisirs/Vacances + totaux globaux intégrés.');
