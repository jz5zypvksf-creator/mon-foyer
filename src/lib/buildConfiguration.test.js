import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viteConfig = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');

test('Vite utilise uniquement le plugin React sans réécriture des sources', () => {
  assert.match(viteConfig, /plugins:\s*\[react\(\)\]/);
  assert.doesNotMatch(viteConfig, /replace(?:All)?\s*\(/);
  assert.doesNotMatch(viteConfig, /mon-foyer-.*integration/i);
});

test('le point d’entrée rend directement App sans ancien rapprochement flottant', () => {
  assert.match(mainSource, /import App from ['"]\.\/App\.jsx['"]/);
  assert.doesNotMatch(mainSource, /AppWithReconciliation/);
});
