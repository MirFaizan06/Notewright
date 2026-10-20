// Tiny dense network runner (ReLU hidden layers, one logit out). No dependencies.

export class MLP {
  /** @param {{sizes:number[], mean:number[], std:number[], W:number[][]|Float32Array[], B:number[][]|Float32Array[]}} spec */
  constructor(spec) {
    this.sizes = spec.sizes;
    this.mean = Float32Array.from(spec.mean);
    this.invStd = Float32Array.from(spec.std, (s) => 1 / s);
    this.W = spec.W.map((w) => Float32Array.from(w));
    this.B = spec.B.map((b) => Float32Array.from(b));
    const widest = Math.max(...this.sizes);
    this.bufA = new Float32Array(widest);
    this.bufB = new Float32Array(widest);
  }

  /** Logit for one feature row (rows are read from `x` starting at `off`). */
  forward(x, off = 0) {
    const { sizes, W, B } = this;
    const nIn = sizes[0];
    let cur = this.bufA;
    let nxt = this.bufB;
    for (let i = 0; i < nIn; i++) cur[i] = (x[off + i] - this.mean[i]) * this.invStd[i];
    for (let l = 0; l < W.length; l++) {
      const inN = sizes[l], outN = sizes[l + 1];
      const w = W[l], b = B[l];
      for (let j = 0; j < outN; j++) nxt[j] = b[j];
      for (let i = 0; i < inN; i++) {
        const v = cur[i];
        if (v === 0) continue;
        const row = i * outN;
        for (let j = 0; j < outN; j++) nxt[j] += v * w[row + j];
      }
      if (l < W.length - 1) for (let j = 0; j < outN; j++) if (nxt[j] < 0) nxt[j] = 0;
      const t = cur; cur = nxt; nxt = t;
    }
    return cur[0];
  }
}

export function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
