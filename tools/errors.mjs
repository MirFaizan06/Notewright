// Breaks down held-out errors by cause. usage: node tools/errors.mjs <dir> --onset s1 --refine s2 [--th 0.4] [--prefix v] [--only ..]
import fs from 'node:fs';
import path from 'node:path';
import { convertAudio } from '../core/notewright.js';

const dir = process.argv[2];
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const nets = {};
for (const k of ['onset', 'offset', 'refine']) if (arg(k)) nets[k] = JSON.parse(fs.readFileSync(arg(k), 'utf8'));
const th = +(arg('th') || 0.4), prefix = arg('prefix') || 'v';
const only = arg('only') ? arg('only').split(',').map(Number) : null;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f.startsWith(prefix) && (!only || only.includes(+f.slice(prefix.length, -5)))).sort();
const miss = {}, extra = {}, tot = { ref: 0, est: 0, tp: 0 };
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (const f of files) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const buf = fs.readFileSync(path.join(dir, f.replace('.json', '.f32')));
  const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const res = convertAudio(x, { nets, candidatesOnly: true });
  const gt = meta.gt, est = res.candidates.filter((c) => c.p >= th);
  const used = new Set(), matchedGt = new Set();
  gt.forEach((g, gi) => {
    let best = -1, bd = 0.05;
    est.forEach((e, i) => { if (used.has(i) || e.pitch !== g.pitch) return; const d = Math.abs(e.time - g.start); if (d <= bd) { bd = d; best = i; } });
    if (best >= 0) { used.add(best); matchedGt.add(gi); }
  });
  tot.ref += gt.length; tot.est += est.length; tot.tp += matchedGt.size;
  const near = (g, f2) => gt.some((o) => o !== g && f2(o));
  gt.forEach((g, gi) => {
    if (matchedGt.has(gi)) return;
    // was it among the candidates at all (any p >= 0.04)?
    const cand = res.candidates.find((c) => c.pitch === g.pitch && Math.abs(c.time - g.start) <= 0.05);
    let cause;
    if (!cand) cause = 'no candidate';
    else cause = 'scored low';
    const rep = near(g, (o) => o.pitch === g.pitch && o.start < g.start && g.start - o.start < 0.2);
    const adj = near(g, (o) => Math.abs(o.pitch - g.pitch) === 1 && Math.abs(o.start - g.start) < 0.2);
    const oct = near(g, (o) => [12, 19, 24, 7].includes(Math.abs(o.pitch - g.pitch)) && Math.abs(o.start - g.start) < 0.05);
    const quiet = g.vel < 35;
    const tag = [cause, rep ? 'fast-repeat' : null, adj ? 'adjacent-semitone-near' : null, oct ? 'harmonic-partner' : null, quiet ? 'quiet' : null].filter(Boolean).join(' + ');
    inc(miss, tag);
  });
  est.forEach((e, i) => {
    if (used.has(i)) return;
    const near2 = gt.filter((g) => Math.abs(g.start - e.time) < 0.1);
    const same = near2.some((g) => g.pitch === e.pitch) ? 'right pitch, wrong time' : near2.some((g) => Math.abs(g.pitch - e.pitch) === 1) ? 'neighbour semitone of a real note' : near2.some((g) => [12, 19, 24, 7, 5].includes(Math.abs(g.pitch - e.pitch))) ? 'harmonic of a real note' : near2.length ? 'near a real onset' : 'no onset nearby';
    inc(extra, same);
  });
  process.stderr.write('.');
}
const show = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `  ${String(v).padStart(4)}  ${(100 * v / n).toFixed(0).padStart(3)}%  ${k}`).join('\n');
console.log(`\nref ${tot.ref}  est ${tot.est}  matched ${tot.tp}\n\nMISSED (${tot.ref - tot.tp}):\n${show(miss, tot.ref - tot.tp)}\n\nEXTRA (${tot.est - tot.tp}):\n${show(extra, tot.est - tot.tp)}`);
