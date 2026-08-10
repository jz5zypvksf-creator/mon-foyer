import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const auditPath = new URL('../src/BelfiusAudit.jsx', import.meta.url);
const stylesPath = new URL('../src/styles.css', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');
let audit = fs.readFileSync(auditPath, 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`RC2.4 motif introuvable: ${label}`);
  return source.replace(from, to);
}

// 1) Nouvelle poche Pension A&E.
if (!app.includes("id: 'pension'")) {
  app = replaceOnce(
    app,
    "    { id: 'voiture', label: 'Voiture', target: 6000, saved: 1200 },",
    "    { id: 'voiture', label: 'Voiture', target: 6000, saved: 1200 },\n    { id: 'pension', label: 'Pension A&E', target: 0, saved: 0 },",
    'goal pension',
  );
}

// 2) État local des versements bancaires identifiés dans le CSV.
app = replaceOnce(
  app,
  "  const [activeView, setActiveView] = useState('home');",
  "  const [activeView, setActiveView] = useState('home');\n  const [bankSavings, setBankSavings] = useState({});",
  'bank savings state',
);

// 3) GoalCard affiche la part reconnue par Belfius.
app = replaceOnce(
  app,
  "function GoalCard({ goal, onUpdate }) {",
  "function GoalCard({ goal, onUpdate, bankDetected = 0 }) {",
  'goal card signature',
);
app = replaceOnce(
  app,
  "      <div className=\"progress-track slim\">\n        <div className=\"progress-fill green\" style={{ width: `${progressRatio}%` }} />\n      </div>\n      <div className=\"goal-inputs\">",
  "      <div className=\"progress-track slim\">\n        <div className=\"progress-fill green\" style={{ width: `${progressRatio}%` }} />\n      </div>\n      {bankDetected > 0 && (\n        <div className=\"goal-bank-sync\">\n          <span>🏦 Versements Belfius identifiés dans le CSV</span>\n          <strong>{formatCurrency(bankDetected)}</strong>\n        </div>\n      )}\n      <div className=\"goal-inputs\">",
  'goal bank badge',
);
app = replaceOnce(
  app,
  "                  <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} />",
  "                  <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} bankDetected={bankSavings[goal.id] || 0} />",
  'goal render bank amount',
);

// 4) Transmission de la détection depuis l'audit.
app = replaceOnce(
  app,
  "              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}",
  "              onSynchronizeBelfiusBalance={synchronizeBelfiusBalance}\n              onSavingsDetected={setBankSavings}",
  'audit savings callback',
);

// 5) Moteur de reconnaissance des virements d'épargne.
if (!audit.includes('function detectSavingsTransfers')) {
  const anchor = "function labelText(bankRow) {";
  const helper = `function detectSavingsTransfers(rows) {\n  const totals = {};\n  const add = (key, amount) => { totals[key] = (totals[key] || 0) + Math.abs(Number(amount) || 0); };\n\n  (rows || []).forEach((row) => {\n    if (row.amount >= 0) return;\n    const text = normalize(\`${'${'}row.label || ''} ${'${'}row.communication || ''} ${'${'}row.details || ''}\`);\n    const amount = Math.abs(Number(row.amount) || 0);\n\n    if (text.includes('pour voiture') || text.includes('epargne voiture')) { add('voiture', amount); return; }\n    if (text.includes('vacances') || text.includes('epargne vacances')) { add('vacances', amount); return; }\n    if (text.includes('fonds urgence') || text.includes('fonds d urgence') || text.includes('epargne urgence')) { add('urgence', amount); return; }\n    if (text.includes('epargne maison') || text.includes('reserve maison')) { add('maison', amount); return; }\n    if (text.includes('pension') || (text.includes('ethias') && Math.abs(amount - 110) <= AMOUNT_TOLERANCE)) { add('pension', amount); return; }\n  });\n\n  return totals;\n}\n\n`;
  audit = replaceOnce(audit, anchor, helper + anchor, 'savings detector');
}

audit = replaceOnce(
  audit,
  "  onSynchronizeBelfiusBalance,\n}) {",
  "  onSynchronizeBelfiusBalance,\n  onSavingsDetected,\n}) {",
  'audit callback prop',
);

audit = replaceOnce(
  audit,
  "      setAudit(parseBelfius(text));",
  "      const parsedAudit = parseBelfius(text);\n      setAudit(parsedAudit);\n      if (typeof onSavingsDetected === 'function') {\n        onSavingsDetected(detectSavingsTransfers(parsedAudit.rows));\n      }",
  'audit file savings callback',
);

// 6) UX discrète et lisible.
if (!styles.includes('V32 RC2.4 — épargne Belfius')) {
  styles += `\n\n/* V32 RC2.4 — épargne Belfius */\n.goal-bank-sync {\n  margin: 9px 0 4px;\n  padding: 8px 10px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  border-radius: 10px;\n  background: #f0f7fb;\n  border: 1px solid #cfe1ed;\n  color: #174f78;\n  font-size: .78rem;\n}\n.goal-bank-sync strong { white-space: nowrap; }\n@media (max-width: 600px) {\n  .goal-bank-sync { align-items: flex-start; flex-direction: column; gap: 3px; }\n}\n`;
}

fs.writeFileSync(appPath, app);
fs.writeFileSync(auditPath, audit);
fs.writeFileSync(stylesPath, styles);
console.log('RC2.4 appliquée: reconnaissance épargne Belfius et rapprochement sécurisé.');
