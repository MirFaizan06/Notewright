// Rewrites text files in the repository with LF line endings (git does the same on commit).
import fs from 'node:fs';
import path from 'node:path';
const skip = new Set(['node_modules', '.git', 'dist', 'build', '.gradle', 'tmp']);
const text = /\.(js|mjs|html|css|svg|json|md|txt|java|gradle|properties|xml|pro|yml|yaml|py|sh|bat|webmanifest|example)$|^\.gitignore$|^\.gitattributes$|^LICENSE$/;
let changed = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (text.test(e.name) && !e.name.endsWith('.bat')) {
      const s = fs.readFileSync(p, 'utf8');
      if (s.includes('\r\n')) { fs.writeFileSync(p, s.replace(/\r\n/g, '\n')); changed++; }
    }
  }
};
walk(process.argv[2] || '.');
console.log('normalised', changed, 'files');
