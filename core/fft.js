// Real-input FFT built on a half-size complex radix-2 transform.
// No dependencies; used by the analysis stage, the tuner and the test tools.

export class RealFFT {
  /** @param {number} n transform length, power of two >= 8 */
  constructor(n) {
    if (n < 8 || (n & (n - 1)) !== 0) throw new Error('RealFFT: n must be a power of two >= 8');
    this.n = n;
    const h = n >> 1;
    this.h = h;
    this.rev = new Uint32Array(h);
    let bits = 0;
    while ((1 << bits) < h) bits++;
    for (let i = 0; i < h; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cosH = new Float64Array(h >> 1);
    this.sinH = new Float64Array(h >> 1);
    for (let k = 0; k < (h >> 1); k++) {
      this.cosH[k] = Math.cos((2 * Math.PI * k) / h);
      this.sinH[k] = Math.sin((2 * Math.PI * k) / h);
    }
    this.cosN = new Float64Array(h + 1);
    this.sinN = new Float64Array(h + 1);
    for (let k = 0; k <= h; k++) {
      this.cosN[k] = Math.cos((2 * Math.PI * k) / n);
      this.sinN[k] = Math.sin((2 * Math.PI * k) / n);
    }
    this.zr = new Float64Array(h);
    this.zi = new Float64Array(h);
  }

  /**
   * Forward transform of n real samples. Writes bins 0..n/2 into re/im.
   * @param {ArrayLike<number>} x
   * @param {Float64Array|Float32Array} re
   * @param {Float64Array|Float32Array} im
   */
  forward(x, re, im) {
    const { h, rev, zr, zi, cosH, sinH, cosN, sinN } = this;
    for (let m = 0; m < h; m++) {
      const r = rev[m];
      zr[r] = x[2 * m];
      zi[r] = x[2 * m + 1];
    }
    for (let size = 2; size <= h; size <<= 1) {
      const half = size >> 1;
      const step = h / size;
      for (let i = 0; i < h; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = cosH[k];
          const wi = -sinH[k];
          const a = i + j;
          const b = a + half;
          const tr = wr * zr[b] - wi * zi[b];
          const ti = wr * zi[b] + wi * zr[b];
          zr[b] = zr[a] - tr;
          zi[b] = zi[a] - ti;
          zr[a] += tr;
          zi[a] += ti;
        }
      }
    }
    for (let k = 0; k <= h; k++) {
      const k2 = k === h ? 0 : k;
      const m2 = k === 0 ? 0 : h - k;
      const ar = zr[k2];
      const ai = zi[k2];
      const br = zr[m2];
      const bi = -zi[m2];
      const er = (ar + br) * 0.5;
      const ei = (ai + bi) * 0.5;
      const or = (ai - bi) * 0.5;
      const oi = -(ar - br) * 0.5;
      const wr = cosN[k];
      const wi = -sinN[k];
      re[k] = er + wr * or - wi * oi;
      im[k] = ei + wr * oi + wi * or;
    }
  }
}

/** In-place complex FFT (forward when inverse=false). Length must be a power of two. */
export function complexFFT(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const ang = ((inverse ? 2 : -2) * Math.PI) / size;
    const wpr = Math.cos(ang);
    const wpi = Math.sin(ang);
    for (let i = 0; i < n; i += size) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const tr = wr * re[b] - wi * im[b];
        const ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = nwr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

export function nextPow2(v) {
  let p = 1;
  while (p < v) p <<= 1;
  return p;
}
