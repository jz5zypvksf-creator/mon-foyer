import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);

let app = fs.readFileSync(appPath, 'utf8');

const anchor = "  const activeViewRef = useRef(activeView);";
const addition = `  const activeViewRef = useRef(activeView);\n\n  useEffect(() => {\n    const removeObsoleteBelfiusShortcut = () => {\n      document.querySelectorAll('button, a').forEach((element) => {\n        if (element.textContent?.trim() === 'Rapprocher Belfius') {\n          element.remove();\n        }\n      });\n    };\n\n    removeObsoleteBelfiusShortcut();\n    const observer = new MutationObserver(removeObsoleteBelfiusShortcut);\n    observer.observe(document.body, { childList: true, subtree: true });\n    return () => observer.disconnect();\n  }, []);`;

if (!app.includes(anchor)) throw new Error('Point d’insertion V31.9.2 introuvable.');
if (!app.includes("textContent?.trim() === 'Rapprocher Belfius'")) {
  app = app.replace(anchor, addition);
}
fs.writeFileSync(appPath, app);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-9-2';");
fs.writeFileSync(swPath, sw);

console.log('V31.9.2 : raccourci flottant Belfius supprimé définitivement.');
