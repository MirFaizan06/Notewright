// End-to-end transcription: mono samples at SR -> notes.

import { HOP, FPS, NB, NN, PIANO_LO } from './grid.js';
import { makeGroups, analyze } from './tfr.js';
import { onsetSpectra, makeLags } from './onsets.js';
import { SHORT_PERIODS } from './grid.js';
import { partialTable, momentFeatures, N_FEATURES } from './features.js';
import { MLP, sigmoid } from './mlp.js';

const BLOCK = 2048;

export function spectrogram(x, groups, progress) {
  const T = Math.ceil(x.length / HOP) + 1;
  const V = new Float32Array(T * NB);
  for (let f0 = 0; f0 < T; f0 += BLOCK) {
    V.set(analyze(x, f0, Math.min(BLOCK, T - f0), groups), f0 * NB);
    if (progress) progress(Math.min(1, (f0 + BLOCK) / T));
  }
  return { V, T };
}

export function referenceLevel(V) {
  const s = [];
  for (let i = 0; i < V.length; i += 37) s.push(V[i]);
  s.sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.995)] || 1e-3;
}

/** P(key struck at frame) for every frame and key; 0 where the gate rejects. */
export function classifyFrames(V, V2, T, net, a4, kappa, progress, pre = null, preCut = 0) {
  const ref = referenceLevel(V);
  const ref2 = referenceLevel(V2);
  const lags2 = makeLags(SHORT_PERIODS);
  const short = { aft: new Float32Array(NB), on: new Float32Array(NB), ref: ref2 };
  const bef2 = new Float32Array(NB);
  const table = partialTable(a4, kappa);
  const P = new Float32Array(T * NN);
  const aft = new Float32Array(NB), bef = new Float32Array(NB), on = new Float32Array(NB);
  const feat = new Float32Array(NN * N_FEATURES);
  const gate = new Uint8Array(NN);
  for (let t = 2; t < T - 3; t++) {
    onsetSpectra(V, T, t, aft, bef, on);
    onsetSpectra(V2, T, t, short.aft, bef2, short.on, lags2);
    if (!momentFeatures(aft, bef, on, table, ref, feat, gate, short)) continue;
    for (let n = 0; n < NN; n++) {
      if (!gate[n]) continue;
      // a tiny network discards the obvious non-notes so the large one only sees plausible ones
      if (pre && pre.forward(feat, n * N_FEATURES) < preCut) continue;
      P[t * NN + n] = sigmoid(net.forward(feat, n * N_FEATURES));
    }
    if (progress && (t & 255) === 0) progress(t / T);
  }
  return { P, ref };
}

/** Per-key peak picking with sub-frame refinement. */
export function pickNotes(P, T, threshold, opts = {}) {
  const minSep = Math.round((opts.minSepSec ?? 0.045) * FPS);
  const notes = [];
  for (let n = 0; n < NN; n++) {
    let last = null;
    for (let t = 1; t < T - 1; t++) {
      const p = P[t * NN + n];
      if (p < threshold) continue;
      if (p < P[(t - 1) * NN + n] || p <= P[(t + 1) * NN + n]) continue;
      const a = P[(t - 1) * NN + n], c = P[(t + 1) * NN + n];
      const den = a - 2 * p + c;
      const d = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
      const ev = { n, pitch: PIANO_LO + n, t, time: (t + d) / FPS + 0.003, p };
      if (last && t - last.t < minSep) {
        if (p > last.p) { notes[notes.length - 1] = ev; last = ev; }
        continue;
      }
      notes.push(ev);
      last = ev;
    }
  }
  notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  return notes;
}
