// usage: node gen_nn.mjs <seed> <outDir> [secs]
// Renders a random synthetic piece and writes frame-level training rows for the key classifier.
import { compose, render, rng } from './testsynth.mjs';
import { makeGroups, analyze } from '../core/tfr.js';
import { estimateTuning } from '../core/tuning.js';
import { onsetSpectra } from '../core/onsets.js';
import { partialTable, momentFeatures, N_FEATURES } from '../core/features.js';
import { NB, NN, FPS, HOP, PIANO_LO, SR } from '../core/grid.js';
import fs from 'node:fs';
import path from 'node:path';

const seed = +process.argv[2], dir = process.argv[3], secs = +(process.argv[4] || 40);
fs.mkdirSync(dir, { recursive: true });
const R = rng(seed * 31 + 5);
const piece = compose(seed, secs, 'mixed');
const opts = { seed };
if (R.range(0, 1) < 0.75) { opts.reverb = R.range(0.1, 0.6); opts.rt60 = R.range(0.5, 2.8); }
if (R.range(0, 1) < 0.15) opts.echo = { delay: R.range(0.15, 0.4), gain: R.range(0.2, 0.5) };
if (R.range(0, 1) < 0.35) opts.noiseDb = R.range(-52, -36);
const r = render(piece, opts);
const x = r.audio;
const cents = estimateTuning(x, SR);
const a4 = 440 * Math.pow(2, cents / 1200);
const groups = makeGroups(a4);
const T = Math.ceil(x.length / HOP) + 1;
const V = new Float32Array(T * NB);
for (let f0 = 0; f0 < T; f0 += 2048) V.set(analyze(x, f0, Math.min(2048, T - f0), groups), f0 * NB);
const sample = []; for (let i = 0; i < T * NB; i += 37) sample.push(V[i]); sample.sort((a, b) => a - b);
const ref = sample[Math.floor(sample.length * 0.995)] || 1e-3;
const table = partialTable(a4, 1);
const gt = r.notes.map(n => {
  let aud = n.end; for (const [d, u] of piece.pedal) if (n.end >= d && n.end < u) aud = u;
  return { pitch: n.pitch, start: n.start, end: aud, keyEnd: n.end, vel: n.vel };
});
const byPitch = new Map();
for (const g of gt) { if (!byPitch.has(g.pitch)) byPitch.set(g.pitch, []); byPitch.get(g.pitch).push(g.start); }
const allStarts = [...new Set(gt.map(g => g.start))].sort((a, b) => a - b);
const aft = new Float32Array(NB), bef = new Float32Array(NB), on = new Float32Array(NB);
const feat = new Float32Array(NN * N_FEATURES), gate = new Uint8Array(NN);
const xs = [], ys = [];
let pos = 0, neg = 0, si = 0;
const R2 = rng(seed * 7 + 1);
for (let t = 2; t < T - 3; t++) {
  const ts = t / FPS;
  while (si < allStarts.length && allStarts[si] < ts - 0.06) si++;
  const nearOnset = si < allStarts.length && Math.abs(allStarts[si] - ts) <= 0.06;
  onsetSpectra(V, T, t, aft, bef, on);
  const ng = momentFeatures(aft, bef, on, table, ref, feat, gate);
  if (!ng) continue;
  for (let n = 0; n < NN; n++) {
    if (!gate[n]) continue;
    let label = 0, skip = false;
    const st = byPitch.get(PIANO_LO + n);
    if (st) for (const s of st) { const d = Math.abs(s - ts - 0.003); if (d <= 0.0125) label = 1; else if (d <= 0.04) skip = true; }
    if (label === 0 && skip) continue;
    if (label === 0 && R2.range(0, 1) > (nearOnset ? 0.3 : 0.04)) continue;
    xs.push(feat.slice(n * N_FEATURES, (n + 1) * N_FEATURES));
    ys.push(label);
    if (label) pos++; else neg++;
  }
}
const rows = new Float32Array(xs.length * N_FEATURES);
xs.forEach((v, i) => rows.set(v, i * N_FEATURES));
const base = path.join(dir, `p${seed}`);
fs.writeFileSync(base + '.x', Buffer.from(rows.buffer));
fs.writeFileSync(base + '.y', Buffer.from(Uint8Array.from(ys).buffer));
fs.writeFileSync(base + '.json', JSON.stringify({ seed, secs, cents, nGt: gt.length, pos, neg, opts, gt }));
console.log(`seed ${seed}: gt ${gt.length}, rows ${xs.length} (pos ${pos}, neg ${neg}), cents ${cents.toFixed(1)}`);
