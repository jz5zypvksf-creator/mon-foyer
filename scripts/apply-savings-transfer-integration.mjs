import fs from 'node:fs';

const path = 'vite.config.js';
let source = fs.readFileSync(path, 'utf8');

function savingsTransferIntegration() {
  return {
    name: 'mon-foyer-savings-transfer',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') && !id.endsWith('\\src\\App.jsx')) return null;
      let patched = code;

      // Utilise exactement la même logique de consolidation que l'écran Épargne :
      // un seul poste par catégorie canonique, meilleure valeur conservée, anciens doublons exclus.
      if (!patched.includes('function transferSavingsGoals(goals = [])')) {
        patched = patched.replace(
          'const iconMap = {',
          `function transferSavingsGoals(goals = []) {
  const byBucket = new Map();
  goals.forEach((goal) => {
    const bucket = savingsBucketForDisplay(goal);
    if (bucket === 'autre') return;
    const current = byBucket.get(bucket);
    const currentWeight = current
      ? Math.abs(Number(current.saved || 0)) * 100000 + Math.abs(Number(current.target || 0))
      : -1;
    const candidateWeight = Math.abs(Number(goal.saved || 0)) * 100000 + Math.abs(Number(goal.target || 0));
    if (!current || candidateWeight > currentWeight) byBucket.set(bucket, goal);
  });

  const order = ['solde_peugeot', 'vacances', 'garage', 'taxes', 'frais_maison', 'pension_alain', 'pension_esther', 'urgence'];
  return [...byBucket.entries()]
    .sort(([bucketA], [bucketB]) => {
      const a = order.indexOf(bucketA);
      const b = order.indexOf(bucketB);
      return (a < 0 ? 999 : a) - (b < 0 ? 999 : b);
    })
    .map(([bucket, goal]) => ({
      ...goal,
      transferLabel: REQUIRED_SAVINGS_GOALS.find((item) => item.bucket === bucket)?.label || goal.label,
    }));
}

const iconMap = {`,
        );
      }

      // "Transfert depuis l'épargne" est un type d'interface distinct, mais reste
      // techniquement enregistré comme un revenu interne afin de créditer le compte courant.
      patched = patched.replace(
        'value={draft.type}\n                  onChange={(event) => {\n                    const type = event.target.value;',
        "value={draft.type === 'income' && draft.savingsSource ? 'transfer' : draft.type}\n                  onChange={(event) => {\n                    const selectedType = event.target.value;\n                    const type = selectedType === 'transfer' ? 'income' : selectedType;\n                    const savingsSource = selectedType === 'transfer'\n                      ? (draft.savingsSource || transferSavingsGoals(data.savingsGoals)[0]?.id || '')\n                      : selectedType === 'income' ? '' : draft.savingsSource;",
      );
      patched = patched.replace(
        '                      type,\n                      category: nextCategory,',
        '                      type,\n                      category: nextCategory,\n                      savingsSource,',
      );
      if (!patched.includes('<option value="transfer">Transfert depuis l’épargne</option>')) {
        patched = patched.replace(
          '<option value="income">Revenus</option>',
          '<option value="income">Revenus</option>\n                  <option value="transfer">Transfert depuis l’épargne</option>',
        );
      }

      patched = patched.replace(
        '                  Source du revenu\n                  <select value={draft.savingsSource || \'\'}',
        "                  {draft.savingsSource ? 'Compte épargne source' : 'Source du revenu'}\n                  <select value={draft.savingsSource || ''}",
      );
      patched = patched.replace(
        '<option value="">Revenu du foyer</option>\n                    {data.savingsGoals.map((goal) => (<option key={goal.id} value={goal.id}>Épargne {goal.label}</option>))}',
        "{!draft.savingsSource && <option value=\"\">Revenu du foyer</option>}\n                    {transferSavingsGoals(data.savingsGoals).map((goal) => (<option key={goal.id} value={goal.id}>{goal.transferLabel} · {formatCurrency(goal.saved || 0)}</option>))}",
      );

      patched = patched.replace(
        'placeholder="Ex. Courses, salaire, assurance"',
        "placeholder={draft.savingsSource ? 'Ex. Paiement taxe, régularisation voiture…' : 'Ex. Courses, salaire, assurance'}",
      );
      patched = patched.replace(
        '<label>\n                Moyen de paiement',
        "<label>\n                {draft.savingsSource ? 'Compte de destination' : 'Moyen de paiement'}",
      );
      patched = patched.replace(
        '<select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>',
        "<select value={draft.paymentMethod} disabled={Boolean(draft.savingsSource)} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>",
      );
      patched = patched.replace(
        '                      savingsSource,\n                    });',
        "                      savingsSource,\n                      paymentMethod: selectedType === 'transfer' ? 'Compte Belfius' : draft.paymentMethod,\n                    });",
      );

      if (!patched.includes('function transferSavingsGoals(goals = [])')
        || !patched.includes('transferSavingsGoals(data.savingsGoals)')
        || !patched.includes("selectedType === 'transfer'")
        || !patched.includes('<option value="transfer">Transfert depuis l’épargne</option>')
        || !patched.includes("'Compte épargne source'")
        || !patched.includes("disabled={Boolean(draft.savingsSource)}")) {
        throw new Error('Intégration Transfert depuis épargne incomplète');
      }

      return { code: patched, map: null };
    },
  };
}

const exportMarker = '\nexport default defineConfig(';
const exportIndex = source.indexOf(exportMarker);
if (exportIndex < 0) throw new Error('vite.config.js: export marker introuvable');

const existingStart = source.lastIndexOf('function savingsTransferIntegration()', exportIndex);
if (existingStart >= 0) {
  source = source.slice(0, existingStart) + savingsTransferIntegration.toString() + '\n' + source.slice(exportIndex);
} else {
  source = source.slice(0, exportIndex) + '\n' + savingsTransferIntegration.toString() + '\n' + source.slice(exportIndex);
}

source = source.replace(
  'careHotfixIntegration(), leisureVacationsIntegration(), careUxFinalIntegration(), react()',
  'careHotfixIntegration(), leisureVacationsIntegration(), savingsTransferIntegration(), careUxFinalIntegration(), react()',
);

if (!source.includes('savingsTransferIntegration()')) throw new Error('Plugin transfert épargne non branché');
fs.writeFileSync(path, source);
console.log('Type Transfert depuis épargne avec liste canonique intégré.');
