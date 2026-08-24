import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('la vue Accueil ordinateur reprend toujours toute la largeur disponible', () => {
  assert.match(styles, /\.content\s*\{[^}]*display:\s*block;[^}]*min-width:\s*0;/s);
  assert.match(styles, /\.home-view\s*\{[^}]*inline-size:\s*100%;[^}]*min-inline-size:\s*0;/s);
  assert.match(styles, /\.home-view\s*>\s*\*\s*\{[^}]*min-width:\s*0;/s);
});
