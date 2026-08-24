import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const buildIntegration = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');

test('la vue Accueil ordinateur reprend toujours toute la largeur disponible', () => {
  assert.match(styles, /\.content\s*\{[^}]*display:\s*block;[^}]*min-width:\s*0;/s);
  assert.match(styles, /\.home-view\s*\{[^}]*inline-size:\s*100%;[^}]*min-inline-size:\s*0;/s);
  assert.match(styles, /\.home-view\s*>\s*\*\s*\{[^}]*min-width:\s*0;/s);
});

test('chaque ancien bloc de l’Accueil possède une zone explicite dans la grille', () => {
  [
    'balance-control-panel',
    'care-summary-panel',
    'expense-types-summary-panel',
    'expense-types-settings-panel',
  ].forEach((className) => {
    assert.match(styles, new RegExp(`\\.home-view\\s*>\\s*\\.${className}\\s*\\{`));
    assert.ok(app.includes(className) || buildIntegration.includes(className), `${className} absent du rendu`);
  });
});
