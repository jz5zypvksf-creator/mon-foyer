import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viteConfig = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const protectedSettingsSource = readFileSync(new URL('../features/security/components/ProtectedSettings.jsx', import.meta.url), 'utf8');
const biometricHookSource = readFileSync(new URL('../features/security/hooks/useBiometricAuth.js', import.meta.url), 'utf8');
const supabaseClientSource = readFileSync(new URL('../infrastructure/supabase/supabaseClient.js', import.meta.url), 'utf8');

test('Vite utilise uniquement le plugin React sans réécriture des sources', () => {
  assert.match(viteConfig, /plugins:\s*\[react\(\)\]/);
  assert.doesNotMatch(viteConfig, /replace(?:All)?\s*\(/);
  assert.doesNotMatch(viteConfig, /mon-foyer-.*integration/i);
});

test('le point d’entrée rend App et le module biométrique reste isolé et vérifié côté serveur', () => {
  assert.match(mainSource, /import App from ['"]\.\/App\.jsx['"]/);
  assert.doesNotMatch(mainSource, /AppWithReconciliation/);
  assert.match(appSource, /lazy\(\(\) => import\('\.\/features\/security\/components\/ProtectedSettings\.jsx'\)\)/);
  assert.match(protectedSettingsSource, /useBiometricAuth\(session\?\.user\?\.id\)/);
  assert.match(biometricHookSource, /navigator\.credentials\.create\(\{ publicKey \}\)/);
  assert.match(biometricHookSource, /navigator\.credentials\.get\(\{ publicKey \}\)/);
  assert.match(biometricHookSource, /passkey\.verifyRegistration/);
  assert.match(biometricHookSource, /passkey\.verifyAuthentication/);
  assert.doesNotMatch(biometricHookSource, /from\(['"]biometric_credentials['"]\)/);
  assert.match(supabaseClientSource, /experimental:\s*\{ passkey:\s*true \}/);
});
