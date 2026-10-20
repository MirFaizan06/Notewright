// usage: node augment.mjs <seed> <audioDir> [offset=1000]
// Writes a lossy-codec-flavoured copy of a cached piece as a<seed+offset>:
// short-time spectrum, bands quantised away below a masking-like threshold,
// slight level jitter and noise. Real MP3/AAC files lose faint partials this
// way, and the networks should not rely on them.
import { RealFFT, complexFFT } from '../core/fft.js';
import { rng } from './testsynth.mjs';
import fs from 'node:fs';
import path from 'node:path';

const seed = +process.argv[2], dir = process.argv[3], off = +(process.argv[4] || 1000);
const meta = JSON.parse(fs.readFileSync(path.join(dir, `a${seed}.json`), 'utf8'));
const buf = fs.readFileSync(path.join(dir, `a${seed}.f32`));
const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const R = rng(seed * 101 + 9);
const N = 2048, H = 512;
const win = Float64Array.from({ length: N }, (_, i) => Math.sin((Math.PI * (i + 0.5)) / N));
const fft = new RealFFT(N);
const re = new Float64Array(N / 2 + 1), im = new Float64Array(N / 2 + 1);
const qdb = R.range(14, 36);                  // how much quieter than the band peak a bin must be to survive
const keepProb = R.range(0.0, 0.3);            // chance that a weak bin survives anyway
const jitter = R.range(0.03, 0.12);
const out = new Float32Array(x.length), norm = new Float32Array(x.length);
// uneven bands, narrow at low frequency like a codec's scale-factor bands
const edges = [0]; for (let w = 4; edges[edges.length - 1] < N / 2; w = Math.ceil(w * 1.22)) edges.push(Math.min(N / 2, edges[edges.length - 1] + w));
const fr = new Float64Array(N), fi = new Float64Array(N), seg = new Float64Array(N);
for (let s = -N + H; s < x.length; s += H) {
  for (let i = 0; i < N; i++) { const k = s + i; seg[i] = k >= 0 && k < x.length ? x[k] * win[i] : 0; }
  fft.forward(seg, re, im);
  for (let b = 0; b + 1 < edges.length; b++) {
    let pk = 0;
    for (let k = edges[b]; k < edges[b + 1]; k++) pk = Math.max(pk, Math.hypot(re[k], im[k]));
    const thr = pk * Math.pow(10, -qdb / 20);
    for (let k = edges[b]; k < edges[b + 1]; k++) {
      const m = Math.hypot(re[k], im[k]);
      let g = 1;
      if (m < thr && R.range(0, 1) > keepProb) g = 0;
      else g = 1 + jitter * R.gauss();
      re[k] *= g; im[k] *= g;
    }
  }
  fr.fill(0); fi.fill(0);
  for (let k = 0; k <= N / 2; k++) { fr[k] = re[k]; fi[k] = im[k]; if (k > 0 && k < N / 2) { fr[N - k] = re[k]; fi[N - k] = -im[k]; } }
  complexFFT(fr, fi, true);
  for (let i = 0; i < N; i++) { const k = s + i; if (k >= 0 && k < x.length) { out[k] += fr[i] * win[i]; norm[k] += win[i] * win[i]; } }
}
let pk = 0;
for (let i = 0; i < x.length; i++) { out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : 0; out[i] += 4e-4 * R.gauss() * 0.3; pk = Math.max(pk, Math.abs(out[i])); }
const g = 0.8 / (pk || 1);
for (let i = 0; i < x.length; i++) out[i] *= g;
fs.writeFileSync(path.join(dir, `a${seed + off}.f32`), Buffer.from(out.buffer));
fs.writeFileSync(path.join(dir, `a${seed + off}.json`), JSON.stringify({ ...meta, seed: seed + off, codec: { qdb, keepProb, jitter } }));
console.log(`augmented ${seed} -> ${seed + off} (q ${qdb.toFixed(0)} dB)`);
