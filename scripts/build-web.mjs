// Builds the web app into one self-contained index.html (no network, no build dependencies).
//   node scripts/build-web.mjs [--out dist/web] [--android]
//
// The output opens straight from disk, deploys to any static host, and is also
// what the Android app bundles. The analysis worker is embedded as text and
// started from a Blob URL, so it works from file:// and inside a WebView alike.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = path.resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'dist/web');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

/* ---------- tiny ES-module bundler for our own plain modules ---------- */
function bundle(entry) {
  const order = [];
  const seen = new Map();
  const visit = (file) => {
    file = path.resolve(file);
    if (seen.has(file)) return;
    const src = fs.readFileSync(file, 'utf8');
    seen.set(file, src);
    const dir = path.dirname(file);
    for (const m of src.matchAll(/^\s*import\s+[^'"]*?from\s+['"](.+?)['"]\s*;?/gm)) visit(path.resolve(dir, m[1]));
    order.push(file);
  };
  visit(entry);

  const id = (f) => path.relative(root, f).replace(/\\/g, '/');
  let out = '(() => {\n"use strict";\nconst __m = {};\n';
  for (const file of order) {
    let src = seen.get(file);
    const dir = path.dirname(file);
    const exportsList = [];
    // imports
    src = src.replace(/^\s*import\s+([^'"]*?)\s+from\s+['"](.+?)['"]\s*;?/gm, (_, what, from) => {
      const key = id(path.resolve(dir, from));
      what = what.trim();
      if (what.startsWith('* as ')) return `const ${what.slice(5).trim()} = __m[${JSON.stringify(key)}];`;
      const inner = what.replace(/^\{|\}$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
        .map((s) => s.replace(/\s+as\s+/, ': ')).join(', ');
      return `const { ${inner} } = __m[${JSON.stringify(key)}];`;
    });
    // exports
    src = src.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => { exportsList.push([name, name]); return `${kind} ${name}`; });
    src = src.replace(/^export\s*\{([^}]*)\}\s*;?/gm, (_, list) => {
      for (const part of list.split(',').map((s) => s.trim()).filter(Boolean)) {
        const [a, b] = part.split(/\s+as\s+/);
        exportsList.push([b || a, a]);
      }
      return '';
    });
    src = src.replace(/import\.meta\.url/g, 'location.href');
    out += `\n// ---- ${id(file)}\n__m[${JSON.stringify(id(file))}] = (() => {\n${src}\nreturn { ${exportsList.map(([e, l]) => (e === l ? e : `${e}: ${l}`)).join(', ')} };\n})();\n`;
  }
  out += '})();\n';
  return out;
}

const esc = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const dataUri = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;

/* ---------- assemble ---------- */
const webDir = path.join(root, 'web');
let html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(webDir, 'styles.css'), 'utf8');
let appJs = bundle(path.join(webDir, 'js', 'app.js'));
const workerJs = bundle(path.join(webDir, 'js', 'worker.js'));
appJs = appJs.replace(/version: '[^']*'/, `version: '${pkg.version}'`);
// ad settings can be overridden per build: NW_ADS_ENABLED, NW_AD_PROVIDER, NW_AD_GATE, NW_AD_BANNER
const override = {};
const flag = (v) => String(v).toLowerCase() === 'true';
if (process.env.NW_ADS_ENABLED) override.enabled = flag(process.env.NW_ADS_ENABLED);
if (process.env.NW_AD_PROVIDER) override.provider = process.env.NW_AD_PROVIDER;
if (process.env.NW_AD_GATE) override.gate = flag(process.env.NW_AD_GATE);
if (process.env.NW_AD_BANNER) override.banner = flag(process.env.NW_AD_BANNER);
const overrideTag = Object.keys(override).length ? `<script>window.__NW_ADS_OVERRIDE = ${JSON.stringify(override)};</script>\n` : '';

const logo = dataUri(path.join(webDir, 'assets', 'logo.svg'), 'image/svg+xml');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`);
html = html.replace(/(href|src)="assets\/logo\.svg"/g, (_, a) => `${a}="${logo}"`);
// the piano recordings travel inside the file as base64, so it works from disk with no network
const pianoDir = path.join(webDir, 'assets', 'piano');
const piano = {};
for (const f of fs.readdirSync(pianoDir).filter((n) => n.endsWith('.mp3'))) piano[path.basename(f, '.mp3')] = fs.readFileSync(path.join(pianoDir, f)).toString('base64');
html = html.replace('<script type="module" src="js/app.js"></script>', () => `<script type="application/json" id="piano-data">${JSON.stringify(piano)}</script>\n<script type="text/plain" id="worker-src">\n${esc(workerJs)}\n</script>\n${overrideTag}<script>\n${esc(appJs)}\n</script>`);
html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
fs.writeFileSync(path.join(outDir, 'manifest.webmanifest'), JSON.stringify({
  name: 'Notewright', short_name: 'Notewright', description: 'Piano audio to MIDI',
  start_url: '.', display: 'standalone', background_color: '#14110e', theme_color: '#14110e',
  icons: [{ src: 'logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
}, null, 2));
fs.copyFileSync(path.join(webDir, 'assets', 'logo.svg'), path.join(outDir, 'logo.svg'));
fs.copyFileSync(path.join(webDir, 'privacy.html'), path.join(outDir, 'privacy.html'));
// files that must sit at the site root (ads.txt, app-ads.txt, ...)
const pub = path.join(webDir, 'public');
if (fs.existsSync(pub)) for (const f of fs.readdirSync(pub)) fs.copyFileSync(path.join(pub, f), path.join(outDir, f));
console.log(`built ${path.relative(root, path.join(outDir, 'index.html'))}  (${(html.length / 1024).toFixed(0)} KB, v${pkg.version})`);
