// End-to-end evaluation on held-out synthetic pieces (made by mkval.mjs).
// usage: node tools/evalnet.mjs <dir> [--onset net.json] [--offset net.json] [--refine net.json] [--threshold 0.5] [--prefix v|a] [--only 361,362]
import fs from 'node:fs';
import path from 'node:path';
import { convertAudio } from '../core/notewright.js';
import { evaluate } from './evalnotes.mjs';

const dir = process.argv[2];
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const nets = {};
if (arg('onset')) nets.onset = JSON.parse(fs.readFileSync(arg('onset'), 'utf8'));
if (arg('offset')) nets.offset = JSON.parse(fs.readFileSync(arg('offset'), 'utf8'));
if (arg('pre')) nets.pre = JSON.parse(fs.readFileSync(arg('pre'), 'utf8'));
if (arg('refine')) nets.refine = JSON.parse(fs.readFileSync(arg('refine'), 'utf8'));
const prefix = arg('prefix') || 'v';
const only = arg('only') ? arg('only').split(',').map(Number) : null;
const options = { nets, ...(arg('threshold') ? { threshold: +arg('threshold') } : {}), ...(arg('sens') ? { sensitivity: +arg('sens') } : {}) };

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f.startsWith(prefix) && (!only || only.includes(+f.slice(prefix.length, -5)))).sort();
let tot = { tp: 0, nEst: 0, nRef: 0, tpOff: 0 }, all = [];
for (const f of files) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const buf = fs.readFileSync(path.join(dir, f.replace('.json', '.f32')));
  const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const t0 = Date.now();
  const res = convertAudio(x, options);
  const est = res.notes.map((n) => ({ pitch: n.pitch, start: n.start, end: n.end }));
  const gt = meta.gt.map((g) => ({ pitch: g.pitch, start: g.start, end: g.end }));
  const ev = evaluate(gt, est, 0.05);
  tot.tp += ev.tp; tot.nEst += ev.nEst; tot.nRef += ev.nRef;
  all.push(ev.medianOnsetErr);
  console.log(`${f.padEnd(10)} ref ${String(ev.nRef).padStart(4)} est ${String(ev.nEst).padStart(4)}  P ${ev.precision.toFixed(3)}  R ${ev.recall.toFixed(3)}  F1 ${ev.f1.toFixed(3)}  F1+off ${ev.f1off.toFixed(3)}  med ${(ev.medianOnsetErr * 1000).toFixed(1)}ms  (${((Date.now() - t0) / 1000).toFixed(1)}s)  ${JSON.stringify({ rv: meta.opts.reverb?.toFixed?.(2), rt: meta.opts.rt60?.toFixed?.(1), echo: !!meta.opts.echo, noise: meta.opts.noiseDb?.toFixed?.(0) })}`);
  if (process.argv.includes('--v')) {
    console.log('   MISSED', ev.missed.slice(0, 12).map((m) => `${m.pitch}@${m.start.toFixed(2)}`).join(' '));
    console.log('   EXTRA ', ev.extra.slice(0, 12).map((m) => `${m.pitch}@${m.start.toFixed(2)}`).join(' '));
  }
}
if (process.argv.includes('--sweep')) { /* handled above */ }
const P = tot.tp / tot.nEst, R = tot.tp / tot.nRef;
console.log(`\nOVERALL  P ${P.toFixed(3)}  R ${R.toFixed(3)}  F1 ${(2 * P * R / (P + R)).toFixed(3)}   (${tot.nRef} reference notes in ${files.length} pieces)`);
