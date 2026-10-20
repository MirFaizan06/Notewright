// usage: node feat_piece.mjs <seed> <audioDir> <outDir>
// Turns a cached piece into rows for the key classifier (p<seed>.x/.y) and the
// note-end classifier (o<seed>.x/.y). Fast: no rendering.
import { makeGroups } from '../core/tfr.js';
import { estimateTuning } from '../core/tuning.js';
import { spectrogram, referenceLevel } from '../core/transcribe.js';
import { onsetSpectra, makeLags } from '../core/onsets.js';
import { partialTable, momentFeatures, N_FEATURES, N_PARTIALS } from '../core/features.js';
import { OFF_DELTAS, N_OFF_FEATURES, offsetFeatures, referenceAmps, binsOf } from '../core/offsets.js';
import { NB, NN, FPS, PIANO_LO, SR, SHORT_PERIODS } from '../core/grid.js';
import { rng } from './testsynth.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [seed, audioDir, outDir] = [+process.argv[2], process.argv[3], process.argv[4]];
fs.mkdirSync(outDir, { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(audioDir, `a${seed}.json`), 'utf8'));
const buf = fs.readFileSync(path.join(audioDir, `a${seed}.f32`));
const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const gt = meta.gt;
const a4 = 440 * Math.pow(2, estimateTuning(x, SR) / 1200);
const { V, T } = spectrogram(x, makeGroups(a4));
const { V: V2 } = spectrogram(x, makeGroups(a4, SHORT_PERIODS));
const ref = referenceLevel(V);
const lags2 = makeLags(SHORT_PERIODS);
const short = { aft: new Float32Array(NB), on: new Float32Array(NB), ref: referenceLevel(V2) };
const bef2 = new Float32Array(NB);
const table = partialTable(a4, 1);

// ---- key classifier rows
const byPitch = new Map();
for (const g of gt) { if (!byPitch.has(g.pitch)) byPitch.set(g.pitch, []); byPitch.get(g.pitch).push(g.start); }
const allStarts = [...new Set(gt.map((g) => g.start))].sort((a, b) => a - b);
const aft = new Float32Array(NB), bef = new Float32Array(NB), on = new Float32Array(NB);
const feat = new Float32Array(NN * N_FEATURES), gate = new Uint8Array(NN);
const xs = [], ys = [];
const R2 = rng(seed * 7 + 1);
let si = 0;
for (let t = 2; t < T - 3; t++) {
  const ts = t / FPS;
  while (si < allStarts.length && allStarts[si] < ts - 0.06) si++;
  const nearOnset = si < allStarts.length && Math.abs(allStarts[si] - ts) <= 0.06;
  onsetSpectra(V, T, t, aft, bef, on);
  onsetSpectra(V2, T, t, short.aft, bef2, short.on, lags2);
  if (!momentFeatures(aft, bef, on, table, ref, feat, gate, short)) continue;
  for (let n = 0; n < NN; n++) {
    if (!gate[n]) continue;
    let label = 0, skip = false;
    const st = byPitch.get(PIANO_LO + n);
    if (st) for (const s of st) { const d = Math.abs(s - ts - 0.003); if (d <= 0.0125) label = 1; else if (d <= 0.04) skip = true; }
    if (label === 0 && skip) continue;
    if (label === 0 && R2.range(0, 1) > (nearOnset ? 0.3 : 0.04)) continue;
    xs.push(feat.slice(n * N_FEATURES, (n + 1) * N_FEATURES)); ys.push(label);
  }
}
const rows = new Float32Array(xs.length * N_FEATURES);
xs.forEach((v, i) => rows.set(v, i * N_FEATURES));
fs.writeFileSync(path.join(outDir, `p${seed}.x`), Buffer.from(rows.buffer));
fs.writeFileSync(path.join(outDir, `p${seed}.y`), Buffer.from(Uint8Array.from(ys).buffer));

// ---- note-end rows
const orows = [], oys = [];
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
    orows.push(Float32Array.from(f)); oys.push(g.end > g.start + d ? 1 : 0);
  }
}
const obuf = new Float32Array(orows.length * N_OFF_FEATURES);
orows.forEach((v, i) => obuf.set(v, i * N_OFF_FEATURES));
fs.writeFileSync(path.join(outDir, `o${seed}.x`), Buffer.from(obuf.buffer));
fs.writeFileSync(path.join(outDir, `o${seed}.y`), Buffer.from(Uint8Array.from(oys).buffer));
console.log(`seed ${seed}: key rows ${xs.length} (pos ${ys.reduce((a, b) => a + b, 0)}), end rows ${orows.length}`);
