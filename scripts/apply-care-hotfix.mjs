import fs from 'node:fs';

// Correctif final du lot :
// - détail Papa/Nonna ;
// - nettoyage ciblé du doublon Taxes du 03/08/2026 ;
// - validation Belfius réellement attachée à l'écriture choisie ;
// - reconnaissance mandat/OP compatible avec bank-reference ;
// - exclusion des transferts internes d'épargne de la rubrique « sans mouvement Belfius » ;
// - neutralisation des écritures Mon Foyer équivalentes après validation ;
// - sécurisation des regroupements multiples (ex. JW Donate).
const path = 'vite.config.js';
let source = fs.readFileSync(path, 'utf8');

function careHotfixIntegration() {
  return {
    name: 'mon-foyer-care-hotfix',
    // Après les autres plugins métier "pre", avant React.
    enforce: 'pre',
    transform(code, id) {
      const isApp = id.endsWith('/src/App.jsx') || id.endsWith('\\src\\App.jsx');
      const isAudit = id.endsWith('/src/BelfiusAudit.jsx') || id.endsWith('\\src\\BelfiusAudit.jsx');
      if (!isApp && !isAudit) return null;
      let patched = code;

      if (isAudit) {
        // belfiusMatchingRules retourne désormais « bank-reference » pour mandat / OP.
        patched = patched.replaceAll(
          "strongCommunicationMatch(bankRow, expense)?.kind === 'direct-debit'",
          "['direct-debit', 'bank-reference'].includes(strongCommunicationMatch(bankRow, expense)?.kind)",
        );

        // Une validation manuelle doit désigner une écriture précise, pas toutes les
        // écritures portant le même libellé/catégorie.
        patched = patched.replace(
          "  const target = rule.target;\n  if (target.label && normalize(target.label) === normalize(appRow.label)) return true;",
          "  const target = rule.target;\n  if (target.id) return target.id === appRow.id;\n  if (target.label && normalize(target.label) === normalize(appRow.label)) return true;",
        );
        patched = patched.replace(
          "      target: {\n        label: appRow.label || '',",
          "      target: {\n        id: appRow.id || '',\n        label: appRow.label || '',",
        );

        // Les versements vers une réserve d'épargne sont des transferts internes.
        // Ils sont contrôlés via les OP et la section Épargne, pas comme dépenses
        // Belfius orphelines.
        patched = patched.replace(
          ".filter((row) => !isBeobankSavingsAppRow(row))",
          ".filter((row) => !isBeobankSavingsAppRow(row))\n    .filter((row) => !normalize(row.label || '').startsWith('epargne '))",
        );

        // Une fois une opération bancaire validée, une ancienne écriture Mon Foyer
        // économiquement équivalente ne doit plus réapparaître comme anomalie.
        patched = patched.replace(
          "function sameAppIdentity(left, right) {\n  return normalize(left?.label) === normalize(right?.label) && Math.abs(Number(left?.amount || 0) - Number(right?.amount || 0)) <= AMOUNT_TOLERANCE && (left?.person || 'Foyer') === (right?.person || 'Foyer');\n}",
          "function sameAppIdentity(left, right) {\n  const amountSame = Math.abs(Number(left?.amount || 0) - Number(right?.amount || 0)) <= AMOUNT_TOLERANCE;\n  const personSame = (left?.person || 'Foyer') === (right?.person || 'Foyer');\n  const leftLabel = normalize(left?.label || '');\n  const rightLabel = normalize(right?.label || '');\n  const labelSame = leftLabel === rightLabel || (leftLabel && rightLabel && (leftLabel.includes(rightLabel) || rightLabel.includes(leftLabel)));\n  const categorySame = Boolean(left?.category && right?.category && left.category === right.category);\n  const storeSame = !left?.store || !right?.store || normalize(left.store) === normalize(right.store);\n  return amountSame && personSame && (labelSame || (categorySame && storeSame));\n}",
        );

        // Les regroupements doivent pouvoir utiliser toutes les lignes bancaires encore
        // libres. Un candidat déjà placé en simple « proposition » ne doit pas empêcher
        // un regroupement exact de plusieurs mouvements du même bénéficiaire.
        patched = patched.replace(
          ".filter(({ index }) => !usedBank.has(index) && !pendingBank.has(index));\n    const group = possibleBankGroup(appRow, availableBank, recurringExpenses);",
          ".filter(({ index }) => !usedBank.has(index));\n    const group = possibleBankGroup(appRow, availableBank, recurringExpenses);",
        );
        patched = patched.replace(
          "    group.rows.forEach(({ index }) => usedBank.add(index));\n    usedApp.add(appIndex);",
          "    group.rows.forEach(({ index }) => { usedBank.add(index); pendingBank.delete(index); });\n    pendingApp.delete(appIndex);\n    usedApp.add(appIndex);",
        );

        if (!patched.includes("target.id) return target.id === appRow.id")
          || !patched.includes("'bank-reference'")
          || !patched.includes("startsWith('epargne ')")
          || !patched.includes("id: appRow.id || ''")
          || !patched.includes('const amountSame = Math.abs')
          || !patched.includes('pendingBank.delete(index)')) {
          throw new Error('Correctif Belfius/OP incomplet');
        }
      }

      if (isApp) {
        const reimbursementButton = '<button type="button" className="secondary-button" onClick={() => startCareReimbursement(item.person)}>Remboursement</button>';
        const detailButton = '<button type="button" className="secondary-button" onClick={() => { setHistoryPerson(item.person); setHistoryType(\'all\'); setHistoryCategory(\'all\'); setHistoryPaymentMethod(\'all\'); setHistorySearch(\'\'); setShowReviewOnly(false); setActiveView(\'history\'); }}>Voir le détail</button>';
        if (!patched.includes('>Voir le détail</button>')) {
          patched = patched.replaceAll(reimbursementButton, detailButton + reimbursementButton);
        }

        // V2 : réessaie le nettoyage même si une ancienne Preview avait déjà exécuté
        // la première version. La ligne du 03/08 n'est retirée que si la ligne correcte
        // du 04/08 à 300 € est présente simultanément.
        if (!patched.includes('mon-foyer-cleanup-taxes-2026-08-v2')) {
          const anchor = '  const editingOperation = useMemo(() => {';
          if (!patched.includes(anchor)) throw new Error('Point insertion nettoyage introuvable');
          const cleanup = [
            "  useEffect(() => {",
            "    const cleanupKey = 'mon-foyer-cleanup-taxes-2026-08-v2';",
            "    if (localStorage.getItem(cleanupKey) === 'done') return;",
            "    const normalizeCleanupLabel = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();",
            "    const isTaxes300 = (row) => Math.abs(Number(row?.amount || 0) - 300) < 0.01 && normalizeCleanupLabel(row?.label).includes('epargne taxes');",
            "    const correct = data.operations.find((row) => row.date === '2026-08-04' && isTaxes300(row));",
            "    const duplicates = correct ? data.operations.filter((row) => row.date === '2026-08-03' && isTaxes300(row)) : [];",
            "    if (!correct || duplicates.length === 0) return;",
            "    const duplicateIds = duplicates.map((row) => row.id);",
            "    const applyLocalCleanup = () => {",
            "      setData((current) => {",
            "        const next = { ...current, operations: current.operations.filter((row) => !duplicateIds.includes(row.id)) };",
            "        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));",
            "        return next;",
            "      });",
            "      localStorage.setItem(cleanupKey, 'done');",
            "    };",
            "    if (USE_REMOTE_BUDGET) {",
            "      supabase.from('operations').delete().in('id', duplicateIds).eq('household_id', householdId).then(({ error }) => {",
            "        if (!error) applyLocalCleanup();",
            "      });",
            "    } else {",
            "      applyLocalCleanup();",
            "    }",
            "  }, [data.operations]);",
            "",
          ].join('\n');
          patched = patched.replace(anchor, cleanup + anchor);
        }

        if (!patched.includes('Voir le détail') || !patched.includes('mon-foyer-cleanup-taxes-2026-08-v2')) {
          throw new Error('Correctif remboursements incomplet');
        }
      }

      return { code: patched, map: null };
    },
  };
}

const exportMarker = '\nexport default defineConfig(';
const exportIndex = source.indexOf(exportMarker);
if (exportIndex < 0) throw new Error('vite.config.js: export marker introuvable');

const existingStart = source.lastIndexOf('function careHotfixIntegration()', exportIndex);
if (existingStart >= 0) {
  source = source.slice(0, existingStart)
    + careHotfixIntegration.toString()
    + '\n'
    + source.slice(exportIndex);
} else {
  source = source.slice(0, exportIndex)
    + '\n'
    + careHotfixIntegration.toString()
    + '\n'
    + source.slice(exportIndex);
}

source = source.replace(
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careUxFinalIntegration(), react()]',
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careHotfixIntegration(), careUxFinalIntegration(), react()]',
);
source = source.replace(
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careHotfixIntegration(), careUxFinalIntegration(), react()]',
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careHotfixIntegration(), careUxFinalIntegration(), react()]',
);

if (!source.includes('careHotfixIntegration()')) throw new Error('Plugin careHotfix non branché');
fs.writeFileSync(path, source);
console.log('Correctif Belfius/OP + doublons + regroupements appliqué.');
