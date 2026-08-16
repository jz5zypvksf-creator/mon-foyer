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

      // "Transfert depuis l'épargne" est un type d'interface distinct, mais reste
      // techniquement enregistré comme un revenu interne afin de créditer le compte courant.
      // budgetMonthRules exclut déjà les libellés "Transfert depuis épargne" des revenus budgétaires.
      patched = patched.replace(
        'value={draft.type}\n                  onChange={(event) => {\n                    const type = event.target.value;',
        "value={draft.type === 'income' && draft.savingsSource ? 'transfer' : draft.type}\n                  onChange={(event) => {\n                    const selectedType = event.target.value;\n                    const type = selectedType === 'transfer' ? 'income' : selectedType;\n                    const savingsSource = selectedType === 'transfer'\n                      ? (draft.savingsSource || data.savingsGoals[0]?.id || '')\n                      : selectedType === 'income' ? '' : draft.savingsSource;",
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

      // Le sélecteur existant devient explicitement le compte épargne source.
      patched = patched.replace(
        '                  Source du revenu\n                  <select value={draft.savingsSource || \'\'}',
        "                  {draft.savingsSource ? 'Compte épargne source' : 'Source du revenu'}\n                  <select value={draft.savingsSource || ''}",
      );
      patched = patched.replace(
        '<option value="">Revenu du foyer</option>\n                    {data.savingsGoals.map((goal) => (<option key={goal.id} value={goal.id}>Épargne {goal.label}</option>))}',
        "{!draft.savingsSource && <option value=\"\">Revenu du foyer</option>}\n                    {data.savingsGoals.map((goal) => (<option key={goal.id} value={goal.id}>Épargne {goal.label} · {formatCurrency(goal.saved || 0)}</option>))}",
      );

      // Pour un transfert, le libellé libre sert de motif et le compte de destination reste Belfius.
      patched = patched.replace(
        'placeholder="Ex. Courses, salaire, assurance"',
        "placeholder={draft.savingsSource ? 'Ex. Paiement taxe, régularisation voiture…' : 'Ex. Courses, salaire, assurance'}",
      );
      patched = patched.replace(
        '<label>\n                Moyen de paiement',
        "<label>\n                {draft.savingsSource ? 'Compte de destination' : 'Moyen de paiement'}",
      );

      // Un transfert doit toujours créditer le compte courant Belfius.
      patched = patched.replace(
        '<select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>',
        "<select value={draft.paymentMethod} disabled={Boolean(draft.savingsSource)} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>",
      );

      // Lors du choix initial du transfert, force Belfius comme destination.
      patched = patched.replace(
        '                      savingsSource,\n                    });',
        "                      savingsSource,\n                      paymentMethod: selectedType === 'transfer' ? 'Compte Belfius' : draft.paymentMethod,\n                    });",
      );

      if (!patched.includes("selectedType === 'transfer'")
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
console.log('Type Transfert depuis épargne intégré.');
