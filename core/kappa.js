// String-stiffness estimate: how much stretched the partials of this piano are,
// relative to the typical curve in grid.js (1.0 = typical).
//
// For keys that clearly sound in loud frames, the upper partials line up only
// when the stiffness is right, so the candidate with the strongest upper
// partials wins.

import { NB, NN, FPS } from './grid.js';
import { partialTable, N_PARTIALS } from './features.js';

export const KAPPAS = [0.4, 0.6, 0.85, 1.2, 1.7, 2.4, 3.4];

export function estimateKappa(V, T, a4) {
  // loudest frames, spread over the recording
  const energy = new Float32Array(T);
  for (let t = 0; t < T; t++) { let s = 0; for (let b = 0; b < NB; b += 3) s += V[t * NB + b]; energy[t] = s; }
  const stride = Math.max(1, Math.floor(FPS / 2));
  const cand = [];
  for (let t = 4; t < T - 4; t += stride) cand.push(t);
  cand.sort((a, b) => energy[b] - energy[a]);
  const frames = cand.slice(0, Math.min(300, Math.ceil(cand.length * 0.4)));
  if (!frames.length) return 1;

  const tables = KAPPAS.map((k) => partialTable(a4, k));
  const peak = (t, p) => {
    if (p < 0) return 0;
    const c = Math.round(p);
    let m = 0;
    for (let d = -1; d <= 1; d++) { const k = c + d; if (k >= 0 && k < NB) { const v = V[t * NB + k]; if (v > m) m = v; } }
    return m;
  };
  // keys that sound: judged with the middle partials, which every candidate places almost identically
  const ref = tables[3];
  const score = new Float64Array(KAPPAS.length);
  for (const t of frames) {
    let fmax = 0;
    for (let b = 0; b < NB; b++) if (V[t * NB + b] > fmax) fmax = V[t * NB + b];
    for (let n = 0; n < NN; n++) {
      const a2 = peak(t, ref[n * N_PARTIALS + 1]), a3 = peak(t, ref[n * N_PARTIALS + 2]), a4_ = peak(t, ref[n * N_PARTIALS + 3]);
      if (a2 < 0.1 * fmax || a3 < 0.08 * fmax || a4_ < 0.05 * fmax) continue;
      const norm = (a2 + a3 + a4_) / 3;
      for (let k = 0; k < KAPPAS.length; k++) {
        let up = 0, cnt = 0;
        for (let h = 7; h < N_PARTIALS; h++) {
          const p = tables[k][n * N_PARTIALS + h];
          if (p < 0) break;
          up += peak(t, p); cnt++;
        }
        if (cnt) score[k] += Math.min(2, up / cnt / norm);
      }
    }
  }
  let best = 3;
  for (let k = 0; k < KAPPAS.length; k++) if (score[k] > score[best]) best = k;
  // parabolic refinement in log-kappa between neighbours
  if (best > 0 && best < KAPPAS.length - 1) {
    const a = score[best - 1], b = score[best], c = score[best + 1];
    const den = a - 2 * b + c;
    if (den < 0) {
      const d = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den));
      const lk = Math.log(KAPPAS[best]) + d * (Math.log(KAPPAS[best + 1]) - Math.log(KAPPAS[best - 1])) / 2;
      return Math.exp(lk);
    }
  }
  return KAPPAS[best];
}
