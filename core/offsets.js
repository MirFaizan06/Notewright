// "Is this key still sounding?" features and the note-end search.
// Features compare the key's partial amplitudes now with right after its onset,
// and with the last fraction of a second (a sudden drop means a damper fell).

import { NB, NN, FPS } from './grid.js';
import { N_PARTIALS } from './features.js';

export const OFF_DELTAS = [0.06, 0.12, 0.2, 0.3, 0.45, 0.6, 0.8, 1.05, 1.35, 1.75, 2.3, 3.0, 4.0, 5.5, 8.0];
export const N_OFF_FEATURES = 12 + 8 + 6 + 3;
const FLOOR = -4;
const clampL = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

function partialPeak(V, T, t, bins, h) {
  // max over three grid bins and +-1 frame at partial h
  const c = bins[h];
  if (c < 0) return 0;
  let m = 0;
  for (let dt = -1; dt <= 1; dt++) {
    const tt = t + dt < 0 ? 0 : t + dt >= T ? T - 1 : t + dt;
    for (let d = -1; d <= 1; d++) {
      const k = c + d;
      if (k < 0 || k >= NB) continue;
      const v = V[tt * NB + k];
      if (v > m) m = v;
    }
  }
  return m;
}

/** Reference partial amplitudes just after an onset at frame t0 (max over a short span). */
export function referenceAmps(V, T, t0, bins, out) {
  for (let h = 0; h < N_PARTIALS; h++) {
    let m = 0;
    for (let u = 2; u <= 6; u++) { const v = partialPeak(V, T, Math.min(T - 1, t0 + u), bins, h); if (v > m) m = v; }
    out[h] = m;
  }
}

/**
 * Fills `out` (N_OFF_FEATURES) for key n at frame t given its onset reference.
 * bins: rounded partial bins of the key. ref: global reference level.
 */
export function offsetFeatures(V, T, t, bins, refAmps, ref, deltaSec, n, out) {
  let k = 0;
  const win = Math.round(0.15 * FPS);
  for (let h = 0; h < 12; h++) {
    const now = partialPeak(V, T, t, bins, h);
    out[k++] = refAmps[h] > 0 ? clampL(Math.log10((now + 1e-6) / (refAmps[h] + 1e-6)), -3, 1) : 0;
  }
  for (let h = 0; h < 8; h++) {
    const now = partialPeak(V, T, t, bins, h);
    let m = 0;
    for (let u = Math.max(0, t - win); u < t; u += 2) { const v = partialPeak(V, T, u, bins, h); if (v > m) m = v; }
    out[k++] = m > 0 ? clampL(Math.log10((now + 1e-6) / (m + 1e-6)), -3, 1) : 0;
  }
  for (let h = 0; h < 6; h++) {
    const now = partialPeak(V, T, t, bins, h);
    out[k++] = clampL(Math.log10(now / ref + 1e-4), FLOOR, 0);
  }
  out[k++] = Math.log10(deltaSec);
  out[k++] = deltaSec > 1 ? 1 : deltaSec;
  out[k++] = n / 87;
  return out;
}

export function binsOf(table, n, out) {
  for (let h = 0; h < N_PARTIALS; h++) { const p = table[n * N_PARTIALS + h]; out[h] = p < 0 ? -1 : Math.round(p); }
  return out;
}
