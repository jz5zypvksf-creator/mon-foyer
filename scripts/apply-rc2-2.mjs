import fs from 'node:fs';

const auditPath = new URL('../src/BelfiusAudit.jsx', import.meta.url);
const stylesPath = new URL('../src/styles.css', import.meta.url);
let audit = fs.readFileSync(auditPath, 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');

function mustReplace(from, to, label) {
  if (!audit.includes(from)) throw new Error('RC2.2 motif introuvable: ' + label);
  audit = audit.replace(from, to);
}

mustReplace(
  '  const usedBank = new Set();\n  const usedApp = new Set();\n  const matched = [];\n  const review = [];',
  '  const usedBank = new Set();\n  const usedApp = new Set();\n  const pendingBank = new Set();\n  const pendingApp = new Set();\n  const matched = [];\n  const review = [];',
  'pending sets',
);

mustReplace(
  "      review.push({\n        bank: bankRow,\n        candidates: automatic.map(({ row, evidence }) => ({ app: row, ...evidence })),\n        reason: 'Plusieurs correspondances fiables possibles',\n      });",
  "      pendingBank.add(bankIndex);\n      automatic.forEach(({ index }) => pendingApp.add(index));\n      review.push({\n        bank: bankRow,\n        candidates: automatic.map(({ row, evidence }) => ({ app: row, ...evidence })),\n        reason: 'Plusieurs correspondances fiables possibles',\n      });",
  'ambiguous automatic',
);

mustReplace(
  '    if (proposals.length > 0) {\n      review.push({',
  '    if (proposals.length > 0) {\n      pendingBank.add(bankIndex);\n      proposals.slice(0, 3).forEach(({ index }) => pendingApp.add(index));\n      review.push({',
  'proposal pending',
);

mustReplace(
  '  const missing = monthBankRows\n    .filter((row, index) => !usedBank.has(index))',
  '  const missing = monthBankRows\n    .filter((row, index) => !usedBank.has(index) && !pendingBank.has(index))',
  'missing exclusive',
);

mustReplace(
  '  const extra = appRows\n    .filter((row, index) => !usedApp.has(index))',
  '  const extra = appRows\n    .filter((row, index) => !usedApp.has(index) && !pendingApp.has(index))',
  'extra exclusive',
);

if (!audit.includes('function parseBalanceDate(value)')) {
  mustReplace(
    'function parseBalanceMonth(value) {',
    "function parseBalanceDate(value) {\n  const match = String(value || '').match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);\n  return match ? match[3] + '-' + match[2] + '-' + match[1] : '';\n}\n\nfunction parseBalanceMonth(value) {",
    'balance date helper',
  );
}

mustReplace(
  "  const monthExtra = (result?.extra || []).filter((row) => String(row.date || '').slice(0, 7) === safeMonth);\n  const difference = audit ? Number(appBelfiusBalance || 0) - audit.balance : 0;",
  "  const monthExtra = (result?.extra || []).filter((row) => String(row.date || '').slice(0, 7) === safeMonth);\n  const cutoffDate = parseBalanceDate(audit?.balanceDate);\n  const futureExtra = monthExtra.filter((row) => cutoffDate && String(row.date || '') > cutoffDate);\n  const actionableExtra = monthExtra.filter((row) => !cutoffDate || String(row.date || '') <= cutoffDate);\n  const difference = audit ? Number(appBelfiusBalance || 0) - audit.balance : 0;",
  'future split',
);

audit = audit.replace(/monthExtra\.length === 0/g, 'actionableExtra.length === 0');

mustReplace(
  '            <div><span>Correspondances sûres</span><strong>{result.matched.length}</strong></div>\n            <div><span>À confirmer</span><strong>{result.review.length}</strong></div>\n            <div><span>Ventilations reconnues</span><strong>{result.splits.length}</strong></div>\n            <div><span>Regroupements reconnus</span><strong>{result.groups.length}</strong></div>\n            <div><span>Absentes de Mon Foyer</span><strong>{monthMissing.length}</strong></div>\n            <div><span>En trop dans Mon Foyer</span><strong>{monthExtra.length}</strong></div>',
  '            <div className="audit-kpi safe"><span><i className="audit-dot" />Correspondances sûres</span><strong>{result.matched.length}</strong></div>\n            <div className="audit-kpi review"><span><i className="audit-dot" />À confirmer</span><strong>{result.review.length}</strong></div>\n            <div className="audit-kpi split"><span><i className="audit-dot" />Ventilations</span><strong>{result.splits.length}</strong></div>\n            <div className="audit-kpi group"><span><i className="audit-dot" />Regroupements</span><strong>{result.groups.length}</strong></div>\n            <div className="audit-kpi future"><span><i className="audit-dot" />À venir</span><strong>{futureExtra.length}</strong></div>\n            <div className="audit-kpi danger"><span><i className="audit-dot" />Anomalies Belfius</span><strong>{monthMissing.length}</strong></div>\n            <div className="audit-kpi danger"><span><i className="audit-dot" />À vérifier Mon Foyer</span><strong>{actionableExtra.length}</strong></div>',
  'summary cards',
);

audit = audit.replace('<details className="audit-details">\n              <summary>Correspondances sûres', '<details className="audit-details status-safe">\n              <summary><span className="audit-dot" />Correspondances sûres');
audit = audit.replace('<details className="audit-details" open>\n              <summary>Correspondances à confirmer', '<details className="audit-details status-review" open>\n              <summary><span className="audit-dot" />Correspondances à confirmer');
audit = audit.replace('<details className="audit-details" open>\n              <summary>Regroupements reconnus', '<details className="audit-details status-group" open>\n              <summary><span className="audit-dot" />Regroupements reconnus');
audit = audit.replace('<details className="audit-details" open>\n              <summary>Ventilations reconnues', '<details className="audit-details status-split" open>\n              <summary><span className="audit-dot" />Ventilations reconnues');
audit = audit.replace('<details className="audit-details" open>\n              <summary>Opérations Belfius absentes', '<details className="audit-details status-danger" open>\n              <summary><span className="audit-dot" />Opérations Belfius absentes');

mustReplace(
  '          {monthExtra.length > 0 && (\n            <details className="audit-details" open>\n              <summary>Opérations Mon Foyer sans correspondance ({monthExtra.length})</summary>\n              {monthExtra.map((row) => (\n                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.type === \'income\' ? row.amount : -row.amount)}</span></article>\n              ))}\n            </details>\n          )}',
  '          {futureExtra.length > 0 && (\n            <details className="audit-details status-future" open>\n              <summary><span className="audit-dot" />Opérations programmées — en attente du prochain relevé ({futureExtra.length})</summary>\n              <p className="audit-section-note">Déjà enregistrées dans Mon Foyer, mais postérieures au dernier solde Belfius importé.</p>\n              {futureExtra.map((row) => (\n                <article key={row.id}><strong>{row.date} · {row.label}</strong><span className="audit-badge future">À venir · {money(row.type === \'income\' ? row.amount : -row.amount)}</span></article>\n              ))}\n            </details>\n          )}\n\n          {actionableExtra.length > 0 && (\n            <details className="audit-details status-danger" open>\n              <summary><span className="audit-dot" />Opérations Mon Foyer à vérifier ({actionableExtra.length})</summary>\n              {actionableExtra.map((row) => (\n                <article key={row.id}><strong>{row.date} · {row.label}</strong><span>{money(row.type === \'income\' ? row.amount : -row.amount)}</span></article>\n              ))}\n            </details>\n          )}',
  'future and actionable',
);

if (!styles.includes('V32 RC2.2 — Audit bancaire')) {
  styles += '\n\n/* V32 RC2.2 — Audit bancaire */\n'
    + '.audit-kpi span{display:flex;align-items:center;gap:7px}.audit-dot{display:inline-block;width:10px;height:10px;flex:0 0 10px;border-radius:999px;background:#83919b;box-shadow:0 0 0 3px rgba(131,145,155,.12)}\n'
    + '.audit-kpi.safe .audit-dot,.status-safe .audit-dot{background:#2f9d62}.audit-kpi.review .audit-dot,.status-review .audit-dot{background:#e0a11b}.audit-kpi.future .audit-dot,.status-future .audit-dot{background:#3984c6}.audit-kpi.group .audit-dot,.status-group .audit-dot{background:#7655b7}.audit-kpi.split .audit-dot,.status-split .audit-dot{background:#d98128}.audit-kpi.danger .audit-dot,.status-danger .audit-dot{background:#c64b4b}\n'
    + '.audit-details{border-radius:16px;overflow:hidden;border:1px solid #dbe4e0;background:#fff}.audit-details summary{display:flex;align-items:center;gap:9px;padding:13px 14px;font-weight:850;cursor:pointer}.audit-details.status-safe{background:#f2faf5;border-color:#cfe7d8}.audit-details.status-review{background:#fff9ea;border-color:#ead9a7}.audit-details.status-future{background:#f2f7fc;border-color:#cbddeb}.audit-details.status-group{background:#f7f3fc;border-color:#dcd0ed}.audit-details.status-split{background:#fff7ef;border-color:#ecd2b7}.audit-details.status-danger{background:#fff4f4;border-color:#eccaca}\n'
    + '.audit-section-note{margin:0;padding:0 14px 11px;color:var(--muted);font-size:.82rem;line-height:1.35}.audit-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;font-size:.76rem;font-weight:850;white-space:nowrap}.audit-badge.future{background:#deecf8;color:#1d6097}\n'
    + '@media(max-width:600px){.audit-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.audit-details article{grid-template-columns:1fr;gap:4px}.audit-details article span{text-align:left}.audit-badge{white-space:normal}}\n';
}

fs.writeFileSync(auditPath, audit);
fs.writeFileSync(stylesPath, styles);
console.log('RC2.2 applied');
