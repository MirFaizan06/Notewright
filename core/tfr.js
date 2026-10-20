// Variable-resolution log-frequency spectrogram.
//
// Each octave is analysed with its own window length (long for bass, short for
// treble) so low notes keep their pitch resolution and high notes keep their
// timing. The result lives on the shared grid from grid.js: NB bins per frame,
// amplitude units (a unit sinusoid reads ~1.0).

import { RealFFT } from './fft.js';
import { SR, HOP, NB, binFreq, windowForBin } from './grid.js';

const PAD = 2; // zero-padding factor for smoother interpolation

const fftCache = new Map();
const winCache = new Map();

function getFFT(z) {
  let f = fftCache.get(z);
  if (!f) { f = new RealFFT(z); fftCache.set(z, f); }
  return f;
}

function getWindow(n) {
  let entry = winCache.get(n);
  if (!entry) {
    const w = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) { w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); sum += w[i]; }
    entry = { w, gain: sum / 2 };
    winCache.set(n, entry);
  }
  return entry;
}

/** Groups grid bins by window length. */
export function makeGroups(a4 = 440, periods) {
  const byN = new Map();
  for (let b = 0; b < NB; b++) {
    const n = windowForBin(b, periods);
    if (!byN.has(n)) byN.set(n, []);
    byN.get(n).push(b);
  }
  const groups = [];
  for (const [n, bins] of byN) {
    const z = n * PAD;
    const df = SR / z;
    const pos = bins.map((b) => binFreq(b, a4) / df);
    // frames per key-frame: long windows are evaluated less often and interpolated
    const mult = n >= 16384 ? 4 : n >= 8192 ? 2 : 1;
    groups.push({ n, z, bins, pos, mult });
  }
  groups.sort((p, q) => q.n - p.n);
  return groups;
}

/**
 * Analyse frames [f0, f0+count) of the signal. Returns Float32Array(count*NB), frame-major.
 * Frame f is centred on sample f*HOP.
 */
export function analyze(x, f0, count, groups) {
  const V = new Float32Array(count * NB);
  const len = x.length;
  for (const g of groups) {
    const { n, z, bins, pos, mult } = g;
    const fft = getFFT(z);
    const { w, gain } = getWindow(n);
    const buf = new Float64Array(z);
    const re = new Float64Array(z / 2 + 1);
    const im = new Float64Array(z / 2 + 1);
    const mags = new Float64Array(z / 2 + 1);
    const lo = Math.max(1, Math.floor(pos[0]) - 2);
    const hi = Math.min(z / 2 - 1, Math.ceil(pos[pos.length - 1]) + 2);
    const nb = bins.length;
    const keyAt = (k) => {
      // key frame k (global frame index k*mult) -> magnitudes at group bins
      const centre = k * mult * HOP;
      const start = centre - (n >> 1);
      for (let i = 0; i < n; i++) {
        const s = start + i;
        buf[i] = s >= 0 && s < len ? x[s] * w[i] : 0;
      }
      for (let i = n; i < z; i++) buf[i] = 0;
      fft.forward(buf, re, im);
      for (let i = lo - 1; i <= hi + 1; i++) mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / gain;
      const out = new Float32Array(nb);
      for (let j = 0; j < nb; j++) {
        const p = pos[j];
        const i = Math.round(p);
        const d = p - i;
        const y0 = mags[i - 1], y1 = mags[i], y2 = mags[i + 1];
        const v = y1 + 0.5 * d * (y2 - y0) + 0.5 * d * d * (y2 - 2 * y1 + y0);
        out[j] = v > 0 ? v : 0;
      }
      return out;
    };
    const kStart = Math.floor(f0 / mult);
    const kEnd = Math.ceil((f0 + count - 1) / mult);
    let prev = keyAt(kStart);
    for (let k = kStart; k < kEnd; k++) {
      const next = keyAt(k + 1);
      for (let m = 0; m < mult; m++) {
        const gf = k * mult + m;
        if (gf < f0 || gf >= f0 + count) continue;
        const a = m / mult;
        const row = (gf - f0) * NB;
        for (let j = 0; j < nb; j++) V[row + bins[j]] = prev[j] * (1 - a) + next[j] * a;
      }
      prev = next;
    }
    if (kEnd === kStart) { // single key frame covers the span
      const row = (kStart * mult - f0) * NB;
      if (row >= 0 && row < V.length) for (let j = 0; j < nb; j++) V[row + bins[j]] = prev[j];
    } else {
      const gf = kEnd * mult;
      if (gf >= f0 && gf < f0 + count) {
        const row = (gf - f0) * NB;
        for (let j = 0; j < nb; j++) V[row + bins[j]] = prev[j];
      }
    }
  }
  return V;
}

