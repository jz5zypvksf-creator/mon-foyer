import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const cssPath = new URL('../src/styles.css', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);

let app = fs.readFileSync(appPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

if (!app.includes("import BelfiusAudit from './BelfiusAudit.jsx';")) {
  app = app.replace(
    "import { householdId, isSupabaseConfigured, supabase } from './lib/supabase';",
    "import { householdId, isSupabaseConfigured, supabase } from './lib/supabase';\nimport BelfiusAudit from './BelfiusAudit.jsx';",
  );
}

const settingsAnchor = `        {activeView === 'settings' && (\n          <section className="view">\n            <section className="panel">`;
const settingsReplacement = `        {activeView === 'settings' && (\n          <section className="view">\n            <BelfiusAudit\n              operations={data.operations}\n              appBelfiusBalance={paymentBalances['Compte Belfius'] || 0}\n            />\n\n            <section className="panel">`;

if (!app.includes(settingsAnchor)) {
  throw new Error('V31.9 : point d’insertion des réglages introuvable.');
}
app = app.replace(settingsAnchor, settingsReplacement);
fs.writeFileSync(appPath, app);

const marker = '/* V31.9 — audit bancaire Belfius */';
if (!css.includes(marker)) {
  css += `\n\n${marker}\n.belfius-audit .section-title h2 {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.55rem;\n}\n\n.belfius-upload {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.65rem;\n  margin-top: 0.8rem;\n  padding: 0.85rem 1rem;\n  border: 1px dashed #7f9db9;\n  border-radius: 14px;\n  color: #163a5f;\n  background: #f5f9fd;\n  font-weight: 800;\n  cursor: pointer;\n}\n\n.belfius-upload input {\n  position: absolute;\n  opacity: 0;\n  pointer-events: none;\n}\n\n.audit-results {\n  display: grid;\n  gap: 0.9rem;\n  margin-top: 1rem;\n}\n\n.audit-verdict {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  padding: 0.95rem 1rem;\n  border-radius: 16px;\n}\n\n.audit-verdict.ok {\n  color: #246c4b;\n  background: #edf8f0;\n  border: 1px solid #cde4d4;\n}\n\n.audit-verdict.warning {\n  color: #9b4f00;\n  background: #fff8eb;\n  border: 1px solid #f0d4a8;\n}\n\n.audit-verdict div {\n  display: grid;\n  gap: 0.15rem;\n}\n\n.audit-verdict span {\n  font-size: 0.84rem;\n  opacity: 0.82;\n}\n\n.audit-summary-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\n  gap: 0.65rem;\n}\n\n.audit-summary-grid > div {\n  display: grid;\n  gap: 0.2rem;\n  padding: 0.85rem;\n  border: 1px solid #dbe4e7;\n  border-radius: 14px;\n  background: #fff;\n}\n\n.audit-summary-grid span {\n  color: #687784;\n  font-size: 0.82rem;\n}\n\n.audit-summary-grid strong {\n  color: #163a5f;\n  font-size: 1.05rem;\n}\n\n.audit-details {\n  border: 1px solid #d8e3ee;\n  border-radius: 14px;\n  background: #f9fbfd;\n  overflow: hidden;\n}\n\n.audit-details summary {\n  padding: 0.85rem 1rem;\n  cursor: pointer;\n  color: #163a5f;\n  font-weight: 800;\n}\n\n.audit-details article {\n  display: flex;\n  justify-content: space-between;\n  gap: 1rem;\n  padding: 0.75rem 1rem;\n  border-top: 1px solid #e1e8ee;\n}\n\n.audit-details article span {\n  color: #687784;\n  text-align: right;\n}\n\n@media (max-width: 560px) {\n  .belfius-upload {\n    width: 100%;\n    justify-content: center;\n  }\n\n  .audit-details article {\n    display: grid;\n  }\n\n  .audit-details article span {\n    text-align: left;\n  }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-9';");
fs.writeFileSync(swPath, sw);

console.log('V31.9 appliquée : audit CSV Belfius intégré aux réglages.');
// deployment trigger
