import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function beobankImporterIntegration() {
  return {
    name: 'mon-foyer-beobank-importer-integration',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') && !id.endsWith('\\src\\App.jsx')) return null;
      let patched = code;
      patched = patched.replace(
        "import BelfiusAudit from './BelfiusAudit.jsx';",
        "import BelfiusAudit from './BelfiusAudit.jsx';\nimport BeobankStatementImport from './BeobankStatementImport.jsx';\nimport './BeobankStatementImport.css';",
      );
      const oldBlock = `{data.savingsGoals.map((goal) => (\n                  <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} bankDetected={bankSavings[savingsBucketForGoal(goal)] || 0} />\n                ))}`;
      const newBlock = `{data.savingsGoals.map((goal) => (\n                  <div key={goal.id}>\n                    <GoalCard goal={goal} onUpdate={updateGoal} bankDetected={bankSavings[savingsBucketForGoal(goal)] || 0} />\n                    {savingsBucketForGoal(goal) === 'vacances' && (\n                      <BeobankStatementImport currentBalance={Number(goal.saved || 0)} onApply={(balance) => updateGoal(goal.id, 'saved', balance)} />\n                    )}\n                  </div>\n                ))}`;
      patched = patched.replace(oldBlock, newBlock);
      if (patched === code || !patched.includes('BeobankStatementImport')) {
        throw new Error('RC2.4.6 Beobank: integration target not found; refusing misleading build.');
      }
      return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [beobankImporterIntegration(), react()],
});
