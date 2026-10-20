// The per-frame spectra the key classifier looks at: after, before, and newly appeared.

import { NB, HOP, windowForBin } from './grid.js';

/** Per-bin look-ahead (frames): about how long that bin's analysis window needs to see a new note. */
export function makeLags(periods) {
  const lag = new Int32Array(NB);
  for (let b = 0; b < NB; b++) lag[b] = Math.min(14, Math.max(1, Math.round((windowForBin(b, periods) / 2 / HOP) * 0.7)));
  return lag;
}
const defaultLags = makeLags();

/**
 * Spectra around frame tp. Each bin looks ahead by about the time its own analysis
 * window needs to have fully seen a new note, and behind by a little more.
 */
export function onsetSpectra(V, T, tp, aft, bef, on, lags = defaultLags) {
  for (let b = 0; b < NB; b++) {
    const l = lags[b];
    const ta = Math.min(T - 1, tp + Math.max(1, Math.round(l * 0.8)));
    let before = 0;
    const lo = Math.max(0, tp - l - 3), hi = Math.max(0, tp - Math.max(1, Math.round(l * 0.4)));
    for (let u = lo; u <= hi; u++) { const v = V[u * NB + b]; if (v > before) before = v; }
    const a = V[ta * NB + b];
    aft[b] = a; bef[b] = before;
    const d = a - before;
    on[b] = d > 0 ? d : 0;
  }
}
