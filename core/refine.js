// Second stage: re-scores each candidate note using what the first stage thought
// about its surroundings. A duplicate one semitone away, an octave ghost, or a
// flicker next to a strong note all look different once the neighbours' scores
// are visible.

import { NN } from './grid.js';

export const REL2 = [-24, -19, -12, -7, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 7, 12, 19, 24];
export const N_REFINE = 7 + REL2.length + 5;

const FIRST_PASS_MIN = 0.04;
export { FIRST_PASS_MIN };

/** Features for a candidate at frame t of key n, from the first-stage probabilities P (T x NN). */
export function refineFeatures(P, T, n, t, out, off = 0) {
  const at = (u, k) => (u < 0 || u >= T || k < 0 || k >= NN ? 0 : P[u * NN + k]);
  let k = off;
  for (let d = -3; d <= 3; d++) out[k++] = at(t + d, n);
  for (const r of REL2) {
    let m = 0;
    for (let d = -2; d <= 2; d++) { const v = at(t + d, n + r); if (v > m) m = v; }
    out[k++] = m;
  }
  // how crowded is this moment, and how does the candidate compare with the strongest key around it
  let strong = 0, pmax = 1e-6;
  for (let key = 0; key < NN; key++) {
    let m = 0;
    for (let d = -2; d <= 2; d++) { const v = at(t + d, key); if (v > m) m = v; }
    if (m > 0.5) strong++;
    if (m > pmax) pmax = m;
  }
  const p0 = at(t, n);
  out[k++] = strong / 10;
  out[k++] = p0 / pmax;
  let before = 0, after = 0;
  for (let u = 4; u <= 12; u++) { const a = at(t - u, n), b = at(t + u, n); if (a > before) before = a; if (b > after) after = b; }
  out[k++] = before;
  out[k++] = after;
  out[k++] = n / 87;
  return out;
}
