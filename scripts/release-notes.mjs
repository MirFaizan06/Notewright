// Prints the CHANGELOG section for a tag (e.g. v1.2.0). Used by the release workflow.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = (process.argv[2] || '').replace(/^v/, '');
const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const lines = text.split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start < 0) { console.log(`Notewright ${version}`); process.exit(0); }
let end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
if (end < 0) end = lines.length;
console.log(lines.slice(start + 1, end).join('\n').trim());
