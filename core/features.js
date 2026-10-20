// Features for the key classifier: for one onset moment and one piano key, the
// observed log amplitudes at that key's partial positions (after / before /
// newly appeared), plus cues from harmonically related keys.

import { NB, NN, MIDI_LO, SEMI, PIANO_LO, midiFreq, inharmonicityB } from './grid.js';

export const N_PARTIALS = 16;
const REL = [-24, -19, -12, -7, -4, -3, -1, 1, 3, 4, 7, 12, 19, 24];
// keys whose partials coincide with this key's (octave, twelfth, two octaves below): full new-energy profile
const PARENTS = [-12, -19, -24];
export const N_FEATURES = 3 * N_PARTIALS + REL.length * 2 + 4 + 2 * N_PARTIALS + PARENTS.length * N_PARTIALS;
const F_MAX = 9500;
const FLOOR = -4;
export const GATE_DB = -2.6;

/** Grid bin position of each key's partials. pos = -1 when beyond the usable range. */
export function partialTable(a4 = 440, kappa = 1) {
  const pos = new Float32Array(NN * N_PARTIALS).fill(-1);
  for (let n = 0; n < NN; n++) {
    const midi = PIANO_LO + n;
    const f0 = midiFreq(midi, a4);
    const B = inharmonicityB(midi, kappa);
    for (let h = 1; h <= N_PARTIALS; h++) {
      const fh = h * f0 * Math.sqrt(1 + B * h * h);
      if (fh > F_MAX) break;
      pos[n * N_PARTIALS + h - 1] = (12 * Math.log2(fh / a4) + 69 - MIDI_LO) * SEMI;
    }
  }
  return pos;
}

const clampLog = (x) => (x < FLOOR ? FLOOR : x > 0 ? 0 : x);

/**
 * Fills `out` (length NN * N_FEATURES) for one onset moment.
 * aft/bef/on are the spectra from onsetSpectra.
 */
export function momentFeatures(aft, bef, on, table, ref, out, gate, short) {
  let mA = ref * 1e-3, mO = ref * 0.003;
  for (let b = 0; b < NB; b++) { if (aft[b] > mA) mA = aft[b]; if (on[b] > mO) mO = on[b]; }
  const invA = 1 / mA, invO = 1 / mO;
  // per key, per partial: neighbourhood maxima
  const LA = new Float32Array(NN * N_PARTIALS);
  const LB = new Float32Array(NN * N_PARTIALS);
  const LO = new Float32Array(NN * N_PARTIALS);
  for (let n = 0; n < NN; n++) {
    for (let h = 0; h < N_PARTIALS; h++) {
      const idx = n * N_PARTIALS + h;
      const p = table[idx];
      if (p < 0) { LA[idx] = LB[idx] = LO[idx] = FLOOR; continue; }
      const c = Math.round(p);
      let a = 0, b = 0, o = 0;
      for (let d = -1; d <= 1; d++) {
        const k = c + d;
        if (k < 0 || k >= NB) continue;
        if (aft[k] > a) a = aft[k];
        if (bef[k] > b) b = bef[k];
        if (on[k] > o) o = on[k];
      }
      LA[idx] = clampLog(Math.log10(a * invA + 1e-4));
      LB[idx] = clampLog(Math.log10(b * invA + 1e-4));
      LO[idx] = clampLog(Math.log10(o * invO + 1e-4));
    }
  }
  // short-window view: sharper in time, blurrier in pitch
  const LA2 = new Float32Array(NN * N_PARTIALS);
  const LO2 = new Float32Array(NN * N_PARTIALS);
  {
    let mA2 = short.ref * 1e-3, mO2 = short.ref * 0.003;
    for (let b = 0; b < NB; b++) { if (short.aft[b] > mA2) mA2 = short.aft[b]; if (short.on[b] > mO2) mO2 = short.on[b]; }
    const iA = 1 / mA2, iO = 1 / mO2;
    for (let n = 0; n < NN; n++) {
      for (let h = 0; h < N_PARTIALS; h++) {
        const idx = n * N_PARTIALS + h;
        const p = table[idx];
        if (p < 0) { LA2[idx] = LO2[idx] = FLOOR; continue; }
        const c = Math.round(p);
        let a = 0, o = 0;
        for (let d = -1; d <= 1; d++) {
          const k = c + d;
          if (k < 0 || k >= NB) continue;
          if (short.aft[k] > a) a = short.aft[k];
          if (short.on[k] > o) o = short.on[k];
        }
        LA2[idx] = clampLog(Math.log10(a * iA + 1e-4));
        LO2[idx] = clampLog(Math.log10(o * iO + 1e-4));
      }
    }
  }
  const gA = Math.log10(mA / ref + 1e-4), gO = Math.log10(mO * invA + 1e-4);
  let nGate = 0;
  for (let n = 0; n < NN; n++) {
    // gate: does this key's own partial region show any new energy at all?
    let g = FLOOR;
    for (let h = 0; h < 8; h++) { const v = LO[n * N_PARTIALS + h]; if (table[n * N_PARTIALS + h] >= 0 && v > g) g = v; }
    const pass = g >= GATE_DB && mO > ref * 0.004 ? 1 : 0;
    if (gate) gate[n] = pass;
    if (!pass) continue;
    nGate++;
    const o = n * N_FEATURES;
    let k = 0;
    const base = n * N_PARTIALS;
    for (let h = 0; h < N_PARTIALS; h++) out[o + k++] = LA[base + h];
    for (let h = 0; h < N_PARTIALS; h++) out[o + k++] = LB[base + h];
    for (let h = 0; h < N_PARTIALS; h++) out[o + k++] = LO[base + h];
    for (let r = 0; r < REL.length; r++) {
      const q = n + REL[r];
      if (q < 0 || q >= NN) { out[o + k++] = FLOOR; out[o + k++] = FLOOR; }
      else { out[o + k++] = LO[q * N_PARTIALS]; out[o + k++] = LO[q * N_PARTIALS + 1]; }
    }
    out[o + k++] = n / 87;
    out[o + k++] = (n / 87) * (n / 87);
    out[o + k++] = gA;
    out[o + k++] = gO;
    for (let h = 0; h < N_PARTIALS; h++) out[o + k++] = LA2[base + h];
    for (let h = 0; h < N_PARTIALS; h++) out[o + k++] = LO2[base + h];
    for (const r of PARENTS) {
      const q = n + r;
      if (q < 0) { for (let h = 0; h < N_PARTIALS; h++) out[o + k++] = FLOOR; }
      else for (let h = 0; h < N_PARTIALS; h++) out[o + k++] = LO[q * N_PARTIALS + h];
    }
  }
  return nGate;
}

export { REL };
