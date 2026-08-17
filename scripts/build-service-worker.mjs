import { readFile, writeFile } from 'node:fs/promises';

const templatePath = new URL('../public/sw.js', import.meta.url);
const indexPath = new URL('../dist/index.html', import.meta.url);
const outputPath = new URL('../dist/sw.js', import.meta.url);
const marker = "const PRECACHE_ASSETS = ['/']; // __PRECACHE_ASSETS__";

const [template, html] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(indexPath, 'utf8'),
]);

if (!template.includes(marker)) {
  throw new Error('Marqueur de précache introuvable dans public/sw.js');
}

const paths = new Set(['/', '/index.html', '/manifest.json', '/icon.svg']);
const assetPattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;

for (const match of html.matchAll(assetPattern)) {
  const url = new URL(match[1], 'https://mon-foyer.local');
  if (url.origin === 'https://mon-foyer.local') {
    paths.add(url.pathname + url.search);
  }
}

const assets = [...paths];
const serviceWorker = template.replace(
  marker,
  `const PRECACHE_ASSETS = ${JSON.stringify(assets)};`,
);

await writeFile(outputPath, serviceWorker);
console.log(`Service worker généré avec ${assets.length} ressource(s) hors connexion.`);
