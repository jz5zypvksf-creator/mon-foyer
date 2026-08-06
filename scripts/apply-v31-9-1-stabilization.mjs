import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const auditPath = new URL('../src/BelfiusAudit.jsx', import.meta.url);
const cssPath = new URL('../src/styles.css', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);

let app = fs.readFileSync(appPath, 'utf8');
let audit = fs.readFileSync(auditPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

// V31.9.1 : stabilisation fonctionnelle, visuelle et responsive.
// Supprime tout ancien raccourci flottant devenu redondant.
app = app.replace(/\s*<button[^>]*>[\s\S]*?Rapprocher Belfius[\s\S]*?<\/button>/g, '');
app = app.replace(/\s*<[^>]+className=["'][^"']*(?:belfius[^"']*(?:floating|fab)|(?:floating|fab)[^"']*belfius)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '');

// Limite l'audit aux dates réellement couvertes par le CSV et ignore les ajustements techniques.
const oldAppRows = `  const appRows = operations\n    .filter((row) => (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius')\n    .map((row) => ({ ...row, amount: Number(row.amount) || 0 }));`;
const newAppRows = `  const bankDates = bankRows.map((row) => row.date).filter(Boolean).sort();\n  const firstBankDate = bankDates[0] || '';\n  const lastBankDate = bankDates[bankDates.length - 1] || '';\n  const appRows = operations\n    .filter((row) => (row.paymentMethod || row.payment_method || 'Compte Belfius') === 'Compte Belfius')\n    .filter((row) => !String(row.label || '').startsWith('Ajustement Belfius'))\n    .filter((row) => (!firstBankDate || row.date >= firstBankDate) && (!lastBankDate || row.date <= lastBankDate))\n    .map((row) => ({ ...row, amount: Number(row.amount) || 0 }));`;
if (!audit.includes(oldAppRows)) throw new Error('Bloc de rapprochement Belfius introuvable.');
audit = audit.replace(oldAppRows, newAppRows);

// Affiche explicitement la période analysée.
const oldCount = `{audit && <span>{audit.rows.length} opérations bancaires</span>}`;
const newCount = `{audit && <span>{audit.rows.length} opérations · ${'${'}audit.rows.map((row) => row.date).sort()[0] || '—'} au ${'${'}audit.rows.map((row) => row.date).sort().at(-1) || '—'}</span>}`;
if (audit.includes(oldCount)) audit = audit.replace(oldCount, newCount);

fs.writeFileSync(appPath, app);
fs.writeFileSync(auditPath, audit);

const marker = '/* V31.9.1 — stabilisation et lisibilité multi-écrans */';
if (!css.includes(marker)) {
  css += `\n\n${marker}\n:root {\n  text-size-adjust: 100%;\n  -webkit-text-size-adjust: 100%;\n}\n\nhtml, body, #root {\n  min-width: 320px;\n  max-width: 100%;\n  overflow-x: hidden;\n}\n\nbutton, input, select, textarea, .belfius-upload {\n  min-height: 44px;\n}\n\nbutton, .belfius-upload {\n  touch-action: manipulation;\n}\n\n.view {\n  padding-left: max(1rem, env(safe-area-inset-left));\n  padding-right: max(1rem, env(safe-area-inset-right));\n}\n\n.bottom-nav {\n  padding-bottom: max(0.55rem, env(safe-area-inset-bottom));\n}\n\n.panel, .forecast-card, .scheduled-row, .operation-row {\n  max-width: 100%;\n}\n\n.section-title {\n  gap: 0.75rem;\n  flex-wrap: wrap;\n}\n\n.section-title h2 {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n\ninput, select, textarea {\n  max-width: 100%;\n  font-size: 16px;\n}\n\n.audit-summary-grid strong,\n.forecast-amount,\n.scheduled-row-amount {\n  font-variant-numeric: tabular-nums;\n}\n\n@media (max-width: 430px) {\n  .view {\n    padding-left: max(0.75rem, env(safe-area-inset-left));\n    padding-right: max(0.75rem, env(safe-area-inset-right));\n  }\n\n  .panel {\n    border-radius: 16px;\n  }\n\n  .audit-summary-grid {\n    grid-template-columns: 1fr 1fr;\n  }\n\n  .audit-summary-grid > div {\n    min-width: 0;\n  }\n}\n\n@media (max-width: 360px) {\n  .audit-summary-grid {\n    grid-template-columns: 1fr;\n  }\n}\n\n@media (min-width: 1024px) {\n  .view {\n    width: min(1180px, calc(100% - 3rem));\n    margin-inline: auto;\n  }\n}\n`;
}
fs.writeFileSync(cssPath, css);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-9-1';");
fs.writeFileSync(swPath, sw);

console.log('V31.9.1 appliquée : audit fiabilisé, raccourci redondant supprimé, responsive renforcé.');
