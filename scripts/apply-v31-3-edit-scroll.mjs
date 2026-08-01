import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

const before = "    setRecurringStatus('Modification du frais récurrent en cours.');\n    window.scrollTo({ top: 0, behavior: 'smooth' });";
const after = "    setRecurringStatus('Modification du frais récurrent en cours.');\n    window.setTimeout(() => {\n      const form = document.querySelector('.recurring-form');\n      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });\n      form?.querySelector('input')?.focus({ preventScroll: true });\n    }, 80);";

if (!app.includes(before)) {
  throw new Error('V31.3: fonction de modification des récurrences introuvable.');
}

app = app.replace(before, after);
fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-3';");
fs.writeFileSync(swPath, sw);

console.log('V31.3 appliquée : le crayon ouvre visiblement le formulaire de modification.');
// trigger deployment
