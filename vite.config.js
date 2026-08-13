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

function belfiusAuditRc246Integration() {
  return {
    name: 'mon-foyer-belfius-audit-rc246-integration',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/BelfiusAudit.jsx') && !id.endsWith('\\src\\BelfiusAudit.jsx')) return null;
      let patched = code;

      patched = patched.replace(
        "import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';",
        "import { AlertTriangle, CheckCircle2, FileSearch, Pencil, RefreshCw, Upload } from 'lucide-react';\nimport { classifyBankBusinessRule, hasStrongCommunicationFingerprint, isTrueOrphanAppOperation, shouldOfferAmountDateFallback } from './belfiusMatchingRules.js';",
      );

      patched = patched.replace(
        /function isBeobankSavingsTransfer\(row\) \{[\s\S]*?\n\}/,
        "function isBeobankSavingsTransfer(row) {\n  return Boolean(classifyBankBusinessRule(row));\n}",
      );

      patched = patched.replace(
        "  // Montant/date seuls ne sont plus une preuve suffisante : ils deviennent une proposition.\n  return {",
        "  // Une communication forte connue interdit toute proposition concurrente basée seulement sur montant/date.\n  if (!shouldOfferAmountDateFallback(bankRow, recurringExpenses)) return null;\n\n  // Montant/date seuls ne sont plus une preuve suffisante : ils deviennent une proposition.\n  return {",
      );

      patched = patched.replace(
        ".filter((row) => !isBeobankSavingsTransfer(row))",
        ".filter((row) => !classifyBankBusinessRule(row)?.excludeFromExpenseMatching)",
      );

      patched = patched.replace(
        "    if (usedApp.has(appIndex)) return;",
        "    if (usedApp.has(appIndex) || pendingApp.has(appIndex)) return;",
      );
      patched = patched.replace(
        ".filter(({ index }) => !usedBank.has(index));",
        ".filter(({ index }) => !usedBank.has(index) && !pendingBank.has(index));",
      );
      patched = patched.replace(
        "    if (usedBank.has(bankIndex)) return;",
        "    if (usedBank.has(bankIndex) || pendingBank.has(bankIndex)) return;",
      );
      patched = patched.replace(
        ".filter(({ index }) => !usedApp.has(index));",
        ".filter(({ index }) => !usedApp.has(index) && !pendingApp.has(index));",
      );

      patched = patched.replace(
        "export default function BelfiusAudit({",
        "function sameAppIdentity(left, right) {\n  return normalize(left?.label) === normalize(right?.label)\n    && Math.abs(Number(left?.amount || 0) - Number(right?.amount || 0)) <= AMOUNT_TOLERANCE\n    && (left?.person || 'Foyer') === (right?.person || 'Foyer');\n}\n\nexport default function BelfiusAudit({",
      );

      patched = patched.replace(
        "  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate);",
        "  const matchedApps = result?.matched?.map((entry) => entry.app) || [];\n  const actionableExtra = monthExtra\n    .filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate)\n    .filter((row) => isTrueOrphanAppOperation(row, { cutoffDate }))\n    .filter((row) => !matchedApps.some((matched) => matched.id !== row.id && sameAppIdentity(matched, row)));",
      );

      patched = patched.replace(
        "  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;",
        "  const remainingToTreat = (result?.review.length || 0) + monthMissing.length + actionableExtra.length;\n  const strongFingerprintCount = (audit?.rows || []).filter((row) => hasStrongCommunicationFingerprint(row, recurringExpenses)).length;",
      );

      patched = patched.replace(
        "          Tu peux quitter l'application et reprendre l'audit sans recharger le fichier.",
        "          {strongFingerprintCount > 0 ? ` ${strongFingerprintCount} empreinte(s) bancaire(s) forte(s) reconnue(s).` : ''}\n          Tu peux quitter l'application et reprendre l'audit sans recharger le fichier.",
      );

      patched = patched.replace(
        '<span><i className="audit-dot" />À vérifier Mon Foyer</span>',
        '<span><i className="audit-dot" />Écritures sans mouvement</span>',
      );
      patched = patched.replace(
        '<summary><span className="audit-dot" />Opérations Mon Foyer à vérifier ({actionableExtra.length})</summary>',
        '<summary><span className="audit-dot" />Écritures Mon Foyer sans mouvement Belfius ({actionableExtra.length})</summary>\n              <p className="audit-section-note">Écritures arrivées à échéance mais sans mouvement bancaire identifié. Elles sont à contrôler, pas automatiquement considérées comme erronées.</p>',
      );

      const requiredMarkers = [
        "classifyBankBusinessRule(row)?.excludeFromExpenseMatching",
        "shouldOfferAmountDateFallback(bankRow, recurringExpenses)",
        "Écritures Mon Foyer sans mouvement Belfius",
        "sameAppIdentity",
      ];
      if (requiredMarkers.some((marker) => !patched.includes(marker))) {
        throw new Error('RC2.4.6 Belfius: integration target not found; refusing misleading build.');
      }
      return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), react()],
});
