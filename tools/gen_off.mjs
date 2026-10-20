// usage: node gen_off.mjs <seed> <outDir>  -> rows for the "still sounding?" classifier
import { compose, render, rng } from './testsynth.mjs';
import { makeGroups, analyze } from '../core/tfr.js';
import { estimateTuning } from '../core/tuning.js';
import { partialTable, N_PARTIALS } from '../core/features.js';
import { OFF_DELTAS, N_OFF_FEATURES, offsetFeatures, referenceAmps, binsOf } from '../core/offsets.js';
import { NB, HOP, FPS, PIANO_LO, SR } from '../core/grid.js';
import { referenceLevel } from '../core/transcribe.js';
import fs from 'node:fs';
import path from 'node:path';
const seed = +process.argv[2], dir = process.argv[3], secs = 40;
fs.mkdirSync(dir, { recursive: true });
const R = rng(seed * 31 + 5);
const piece = compose(seed, secs, 'mixed');
const opts = { seed };
if (R.range(0, 1) < 0.75) { opts.reverb = R.range(0.1, 0.6); opts.rt60 = R.range(0.5, 2.8); }
if (R.range(0, 1) < 0.15) opts.echo = { delay: R.range(0.15, 0.4), gain: R.range(0.2, 0.5) };
if (R.range(0, 1) < 0.35) opts.noiseDb = R.range(-52, -36);
const r = render(piece, opts);
const x = r.audio;
const a4 = 440 * Math.pow(2, estimateTuning(x, SR) / 1200);
const groups = makeGroups(a4);
const T = Math.ceil(x.length / HOP) + 1;
const V = new Float32Array(T * NB);
for (let f0 = 0; f0 < T; f0 += 2048) V.set(analyze(x, f0, Math.min(2048, T - f0), groups), f0 * NB);
const ref = referenceLevel(V);
const table = partialTable(a4, 1);
const gt = r.notes.map(n => { let aud = n.end; for (const [d, u] of piece.pedal) if (n.end >= d && n.end < u) aud = u; return { pitch: n.pitch, start: n.start, end: aud }; });
const rows = [], ys = [];
const bins = new Int32Array(N_PARTIALS), refA = new Float32Array(N_PARTIALS), f = new Float32Array(N_OFF_FEATURES);
for (const g of gt) {
  const n = g.pitch - PIANO_LO;
  binsOf(table, n, bins);
  const t0 = Math.round(g.start * FPS);
  referenceAmps(V, T, t0, bins, refA);
  for (const d of OFF_DELTAS) {
    const t = Math.round((g.start + d) * FPS);
    if (t >= T - 2) continue;
    offsetFeatures(V, T, t, bins, refA, ref, d, n, f);
    rows.push(Float32Array.from(f)); ys.push(g.end > g.start + d ? 1 : 0);
  }
}
const buf = new Float32Array(rows.length * N_OFF_FEATURES); rows.forEach((v, i) => buf.set(v, i * N_OFF_FEATURES));
const base = path.join(dir, `o${seed}`);
fs.writeFileSync(base + '.x', Buffer.from(buf.buffer));
fs.writeFileSync(base + '.y', Buffer.from(Uint8Array.from(ys).buffer));
console.log(`off seed ${seed}: rows ${rows.length}, alive ${ys.reduce((a, b) => a + b, 0)}`);
