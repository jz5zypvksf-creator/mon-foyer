import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

const before = `  const ratio = goal.target ? Math.min((goal.saved / goal.target) * 100, 100) : 0;`;
const after = `  const actualRatio = goal.target ? (goal.saved / goal.target) * 100 : 0;\n  const progressRatio = Math.min(Math.max(actualRatio, 0), 100);`;

if (!app.includes(before)) {
  throw new Error('V31.1: calcul du pourcentage d’épargne introuvable.');
}
app = app.replace(before, after);
app = app.replace('<span>{Math.round(ratio)}%</span>', '<span>{Math.round(actualRatio)}%</span>');
app = app.replace('style={{ width: `${ratio}%` }}', 'style={{ width: `${progressRatio}%` }}');

fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v\d+(?:-\d+)?';/, "const CACHE_NAME = 'mon-foyer-v31-1';");
fs.writeFileSync(swPath, sw);

console.log('V31.1 appliquée : pourcentage réel affiché, barre plafonnée à 100 %.');
