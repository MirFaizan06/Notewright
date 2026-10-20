import test from 'node:test';
import assert from 'node:assert/strict';
import { RealFFT } from '../core/fft.js';

test('RealFFT matches a direct DFT', () => {
  const n = 128;
  const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.37) + 0.3 * Math.cos(i * 1.9) + ((i * 7919) % 13) / 13);
  const re = new Float64Array(n / 2 + 1), im = new Float64Array(n / 2 + 1);
  new RealFFT(n).forward(x, re, im);
  for (let k = 0; k <= n / 2; k++) {
    let r = 0, i = 0;
    for (let t = 0; t < n; t++) { r += x[t] * Math.cos((2 * Math.PI * k * t) / n); i -= x[t] * Math.sin((2 * Math.PI * k * t) / n); }
    assert.ok(Math.abs(r - re[k]) < 1e-9 && Math.abs(i - im[k]) < 1e-9, `bin ${k}`);
  }
});
