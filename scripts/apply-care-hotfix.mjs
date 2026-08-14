import fs from 'node:fs';

// Hotfix ciblé : détail Papa/Nonna + suppression du doublon Taxes du 03/08/2026.
const path = 'vite.config.js';
let source = fs.readFileSync(path, 'utf8');

function careHotfixIntegration() {
  return {
    name: 'mon-foyer-care-hotfix',
    enforce: 'post',
    transform(code, id) {
      const isApp = id.endsWith('/src/App.jsx') || id.endsWith('\\src\\App.jsx');
      if (!isApp) return null;
      let patched = code;

      if (!patched.includes('const viewCareHistory = (person) =>')) {
        patched = patched.replace(
          '  const editingOperation = useMemo(() => {',
          "  const viewCareHistory = (person) => { setHistoryPerson(person); setHistoryType('all'); setHistoryCategory('all'); setHistoryPaymentMethod('all'); setHistorySearch(''); setShowReviewOnly(false); setActiveView('history'); };\n\n  const editingOperation = useMemo(() => {",
        );
      }

      const reimbursementButton = '<button type="button" className="secondary-button" onClick={() => startCareReimbursement(item.person)}>Remboursement</button>';
      const detailButton = '<button type="button" className="secondary-button" onClick={() => viewCareHistory(item.person)}>Voir le détail</button>';
      if (!patched.includes('onClick={() => viewCareHistory(item.person)}>Voir le détail</button>')) {
        patched = patched.replaceAll(reimbursementButton, detailButton + reimbursementButton);
      }

      if (!patched.includes('mon-foyer-cleanup-taxes-2026-08-v1')) {
        const careAnchor = /  const careSummary = useMemo\(\(\) => careBalances\(data\.operations(?:, selectedMonth)?\), \[[^\]]+\]\);/;
        const match = patched.match(careAnchor);
        if (!match) throw new Error('careSummary introuvable pour le nettoyage ciblé');

        const cleanupLines = [
          match[0],
          "  useEffect(() => {",
          "    const cleanupKey = 'mon-foyer-cleanup-taxes-2026-08-v1';",
          "    if (localStorage.getItem(cleanupKey) === 'done') return;",
          "    const normalizeCareLabel = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();",
          "    const isTaxes300 = (row) => Math.abs(Number(row?.amount || 0) - 300) < 0.01 && normalizeCareLabel(row?.label).includes('epargne taxes');",
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
        ];
        patched = patched.replace(match[0], cleanupLines.join('\n'));
      }

      if (!patched.includes('Voir le détail') || !patched.includes('mon-foyer-cleanup-taxes-2026-08-v1')) {
        throw new Error('Care hotfix incomplet');
      }
      return { code: patched, map: null };
    },
  };
}

if (!source.includes('function careHotfixIntegration()')) {
  const marker = '\nexport default defineConfig(';
  if (!source.includes(marker)) throw new Error('vite.config.js: export marker introuvable');
  source = source.replace(marker, '\n' + careHotfixIntegration.toString() + '\n' + marker);
}

source = source.replace(
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careUxFinalIntegration(), react()]',
  'plugins: [beobankImporterIntegration(), belfiusAuditRc246Integration(), finalRc246Integration(), careUxFinalIntegration(), careHotfixIntegration(), react()]',
);

if (!source.includes('careHotfixIntegration()')) throw new Error('Plugin careHotfix non branché');
fs.writeFileSync(path, source);
console.log('Care hotfix appliqué.');
