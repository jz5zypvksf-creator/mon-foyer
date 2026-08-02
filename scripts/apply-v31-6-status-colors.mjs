import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const cssPath = new URL('../src/styles.css', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);

let app = fs.readFileSync(appPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

const marker = `  const availableAfterPlannedExpenses = availableForPayments - totalRemainingToCover;\n`;
const insert = `  const availableAfterPlannedExpenses = availableForPayments - totalRemainingToCover;\n  const forecastStatus = availableAfterPlannedExpenses < 0\n    ? { key: 'danger', label: 'Déficit prévisionnel' }\n    : availableAfterPlannedExpenses < 50\n      ? { key: 'warning', label: 'Marge de sécurité faible' }\n      : availableAfterPlannedExpenses >= 500\n        ? { key: 'excellent', label: 'Excédent confortable' }\n        : { key: 'comfortable', label: 'Situation confortable' };\n`;

if (!app.includes(marker)) throw new Error('V31.6 : calcul prévisionnel introuvable.');
app = app.replace(marker, insert);

const before = `              <div className={\`forecast-card balance-forecast-card \${availableAfterPlannedExpenses >= 0 ? 'is-positive' : 'is-negative'}\`}>\n                <div className="forecast-icon"><WalletCards size={22} /></div>\n                <div className="forecast-copy">\n                  <strong>Solde prévisionnel fin de mois</strong>\n                  <span>Disponible actuel : {formatCurrency(availableForPayments)}</span>\n                  <span>{availableAfterPlannedExpenses >= 0 ? 'Excédent estimé' : 'Déficit estimé'}</span>\n                </div>\n                <strong className={\`forecast-amount \${availableAfterPlannedExpenses >= 0 ? 'positive' : 'negative'}\`}>\n                  {formatCurrency(availableAfterPlannedExpenses)}\n                </strong>\n              </div>`;

const after = `              <div className={\`forecast-card balance-forecast-card status-\${forecastStatus.key}\`}>\n                <div className="forecast-icon"><WalletCards size={22} /></div>\n                <div className="forecast-copy">\n                  <strong>Solde prévisionnel fin de mois</strong>\n                  <span>Disponible actuel : {formatCurrency(availableForPayments)}</span>\n                  <span className="forecast-status-label">{forecastStatus.label}</span>\n                </div>\n                <strong className={\`forecast-amount status-text-\${forecastStatus.key}\`}>\n                  {formatCurrency(availableAfterPlannedExpenses)}\n                </strong>\n              </div>`;

if (!app.includes(before)) throw new Error('V31.6 : carte de solde introuvable.');
app = app.replace(before, after);
fs.writeFileSync(appPath, app);

const cssMarker = '/* V31.6 — seuils de santé budgétaire */';
if (!css.includes(cssMarker)) {
  css += `\n\n${cssMarker}\n.balance-forecast-card.status-danger {\n  border-color: #efc1c1;\n  background: #fff5f5;\n}\n.balance-forecast-card.status-warning {\n  border-color: #f1d3a2;\n  background: #fff9ef;\n}\n.balance-forecast-card.status-comfortable {\n  border-color: #cde4d4;\n  background: #f7fcf8;\n}\n.balance-forecast-card.status-excellent {\n  border-color: #c9dbee;\n  background: #f5f9fe;\n}\n.status-text-danger { color: #b42318; }\n.status-text-warning { color: #b26000; }\n.status-text-comfortable { color: #2f7d57; }\n.status-text-excellent { color: #24618a; }\n.forecast-status-label { font-weight: 800; }\n.status-danger .forecast-status-label { color: #b42318; }\n.status-warning .forecast-status-label { color: #b26000; }\n.status-comfortable .forecast-status-label { color: #2f7d57; }\n.status-excellent .forecast-status-label { color: #24618a; }\n`;
  fs.writeFileSync(cssPath, css);
}

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-6';");
fs.writeFileSync(swPath, sw);

console.log('V31.6 appliquée.');
// deployment trigger
