// Scores held-out pieces at many thresholds from one pass over the audio.
// usage: node tools/sweep.mjs <dir> --onset s1.json --refine s2.json [--prefix v|a] [--only 351,352]
import fs from 'node:fs';
import path from 'node:path';
import { convertAudio } from '../core/notewright.js';
import { evaluate } from './evalnotes.mjs';

const dir = process.argv[2];
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const nets = {};
for (const k of ['onset', 'offset', 'refine', 'pre']) if (arg(k)) nets[k] = JSON.parse(fs.readFileSync(arg(k), 'utf8'));
const prefix = arg('prefix') || 'v';
const only = arg('only') ? arg('only').split(',').flatMap((r) => { const [a, b] = r.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; }) : null;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f.startsWith(prefix) && (!only || only.includes(+f.slice(prefix.length, -5)))).sort();
const ths = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8];
const acc = ths.map(() => ({ tp: 0, nEst: 0, nRef: 0 }));
for (const f of files) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const buf = fs.readFileSync(path.join(dir, f.replace('.json', '.f32')));
  const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const res = convertAudio(x, { nets, candidatesOnly: true });
  const gt = meta.gt.map((g) => ({ pitch: g.pitch, start: g.start, end: g.end }));
  ths.forEach((th, i) => {
    const est = res.candidates.filter((c) => c.p >= th).map((c) => ({ pitch: c.pitch, start: c.time, end: c.time + 0.3 }));
    const ev = evaluate(gt, est, 0.05);
    acc[i].tp += ev.tp; acc[i].nEst += ev.nEst; acc[i].nRef += ev.nRef;
  });
  process.stderr.write('.');
}
console.log('\nthreshold   P      R      F1');
ths.forEach((th, i) => { const a = acc[i]; const P = a.tp / a.nEst, R = a.tp / a.nRef; console.log(`${th.toFixed(2)}      ${P.toFixed(3)}  ${R.toFixed(3)}  ${(2 * P * R / (P + R)).toFixed(3)}`); });
