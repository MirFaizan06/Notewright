// Global tuning estimate: how far the recording sits from A4 = 440 Hz, in cents.
// Spectral peaks of mid-register partials are folded onto one semitone and
// averaged on the circle, weighted by loudness.

import { RealFFT } from './fft.js';

export function estimateTuning(x, sr) {
  const N = 8192;
  const Z = N * 4;
  const fft = new RealFFT(Z);
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const buf = new Float64Array(Z);
  const re = new Float64Array(Z / 2 + 1);
  const im = new Float64Array(Z / 2 + 1);
  const mag = new Float64Array(Z / 2 + 1);
  const df = sr / Z;
  const kLo = Math.floor(160 / df);
  const kHi = Math.floor(1300 / df);

  // pick frames evenly spread across the file, skip near-silent ones
  const nFrames = Math.max(1, Math.floor((x.length - N) / N));
  const want = Math.min(60, nFrames);
  const cand = [];
  for (let i = 0; i < want; i++) {
    const start = Math.floor((i + 0.5) * ((x.length - N) / want));
    let e = 0;
    for (let j = 0; j < N; j += 4) e += x[start + j] * x[start + j];
    cand.push({ start, e });
  }
  const emax = Math.max(...cand.map((c) => c.e)) || 1;

  let sx = 0, sy = 0, wsum = 0;
  for (const c of cand) {
    if (c.e < emax * 0.02) continue;
    for (let i = 0; i < N; i++) buf[i] = x[c.start + i] * w[i];
    buf.fill(0, N);
    fft.forward(buf, re, im);
    let fmax = 0;
    for (let k = kLo - 1; k <= kHi + 1; k++) { mag[k] = Math.hypot(re[k], im[k]); if (mag[k] > fmax) fmax = mag[k]; }
    for (let k = kLo; k <= kHi; k++) {
      if (mag[k] < fmax * 0.05 || mag[k] < mag[k - 1] || mag[k] <= mag[k + 1]) continue;
      const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(mag[k] + 1e-12), cc = Math.log(mag[k + 1] + 1e-12);
      const den = a - 2 * b + cc;
      const d = den !== 0 ? 0.5 * (a - cc) / den : 0;
      const f = (k + d) * df;
      const semis = 12 * Math.log2(f / 440);
      const frac = semis - Math.round(semis); // -0.5..0.5
      const wgt = mag[k] / fmax;
      sx += wgt * Math.cos(2 * Math.PI * frac);
      sy += wgt * Math.sin(2 * Math.PI * frac);
      wsum += wgt;
    }
  }
  if (wsum === 0) return 0;
  const conf = Math.hypot(sx, sy) / wsum;
  if (conf < 0.25) return 0;
  return (Math.atan2(sy, sx) / (2 * Math.PI)) * 100;
}
