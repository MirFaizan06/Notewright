// The public entry point: mono samples at 22.05 kHz in, notes out.

import { SR, FPS, HOP, NB, NN, PIANO_LO } from './grid.js';
import { makeGroups } from './tfr.js';
import { SHORT_PERIODS } from './grid.js';
import { estimateTuning } from './tuning.js';
import { partialTable, N_PARTIALS } from './features.js';
import { MLP, sigmoid } from './mlp.js';
import { spectrogram, classifyFrames, pickNotes } from './transcribe.js';
import { refineFeatures, N_REFINE, FIRST_PASS_MIN } from './refine.js';
import { OFF_DELTAS, N_OFF_FEATURES, offsetFeatures, referenceAmps, binsOf } from './offsets.js';
import { ONSET_NET, OFFSET_NET, REFINE_NET, PRE_NET } from './models.js';

const logit = (p) => Math.log(p / (1 - p));
const END_LATENCY = 0.035;

/** Slider position (0 = strict, 1 = catch everything) -> probability threshold. */
export function thresholdFor(sensitivity, base) {
  const z = logit(base) + (0.5 - sensitivity) * 4.4;
  return sigmoid(z);
}

/**
 * @param {Float32Array} x mono audio at SR (22050)
 * @param {{sensitivity?:number, length?:'natural'|'tight', tuning?:'auto'|'440'}} options
 * @param {(p:number, stage:string)=>void} progress
 */
export function convertAudio(x, options = {}, progress = () => {}) {
  const sens = options.sensitivity ?? 0.5;
  const onsetSpec = options.nets?.onset ?? ONSET_NET;
  const net = new MLP(onsetSpec);

  progress(0.01, 'tune');
  const cents = options.tuning === '440' ? 0 : estimateTuning(x, SR);
  const a4 = 440 * Math.pow(2, cents / 1200);
  const groups = makeGroups(a4);

  progress(0.04, 'spectrum');
  const { V, T } = spectrogram(x, groups, (f) => progress(0.04 + 0.26 * f, 'spectrum'));

  progress(0.3, 'notes');
  let P, ref;
  { // the short-window spectrogram is only needed here; let it go before the note-end stage
    const { V: V2 } = spectrogram(x, makeGroups(a4, SHORT_PERIODS));
    const preSpec = options.nets?.pre ?? PRE_NET;
    const pre = preSpec ? new MLP(preSpec) : null;
    ({ P, ref } = classifyFrames(V, V2, T, net, a4, 1, (f) => progress(0.3 + 0.55 * f, 'notes'), pre, preSpec ? preSpec.threshold : 0));
  }
  const refineSpec = options.nets?.refine ?? REFINE_NET;
  const th = options.threshold ?? thresholdFor(sens, (refineSpec || onsetSpec).threshold);
  let picked, scored = null;
  if (refineSpec) {
    // second stage: re-score every plausible candidate using its neighbours' first-stage scores
    const net2 = new MLP(refineSpec);
    const feat = new Float32Array(N_REFINE);
    scored = pickNotes(P, T, FIRST_PASS_MIN);
    for (const c of scored) { refineFeatures(P, T, c.n, c.t, feat); c.p = sigmoid(net2.forward(feat)); }
    picked = scored.filter((c) => c.p >= th);
  } else {
    picked = pickNotes(P, T, th);
  }

  if (options.candidatesOnly) return { candidates: refineSpec ? scored : picked, meta: { cents, a4 } };

  progress(0.86, 'lengths');
  const table = partialTable(a4, 1);
  const notes = finishNotes(picked, V, T, table, ref, options, options.nets?.offset ?? OFFSET_NET, (f) => progress(0.86 + 0.1 * f, 'lengths'));

  return { notes, meta: { cents, a4, threshold: th, frames: T } };
}

function finishNotes(picked, V, T, table, ref, options, offSpec, progress) {
  const offNet = offSpec ? new MLP(offSpec) : null;
  const tight = options.length === 'tight';
  const byPitch = new Map();
  for (const p of picked) { if (!byPitch.has(p.n)) byPitch.set(p.n, []); byPitch.get(p.n).push(p); }
  const bins = new Int32Array(N_PARTIALS), refA = new Float32Array(N_PARTIALS), f = new Float32Array(N_OFF_FEATURES);
  const alive = (n, t0, start, d, limit) => {
    const t = Math.min(T - 3, Math.round((start + d) * FPS));
    offsetFeatures(V, T, t, bins, refA, ref, d, n, f);
    return sigmoid(offNet.forward(f)) > (tight ? 0.62 : 0.5);
  };
  const ampOf = (n, t) => {
    // mean partial amplitude (h1..h6) shortly after the onset, relative to the reference level
    let s = 0, c = 0;
    for (let h = 0; h < 6; h++) {
      const b = Math.round(table[n * N_PARTIALS + h]);
      if (table[n * N_PARTIALS + h] < 0) continue;
      let m = 0;
      for (let u = 2; u <= 5; u++) for (let d = -1; d <= 1; d++) { const v = V[Math.min(T - 1, t + u) * NB + Math.max(0, Math.min(NB - 1, b + d))]; if (v > m) m = v; }
      s += m * (h === 0 ? 0.6 : 1); c++;
    }
    return c ? s / c : 0;
  };
  const out = [];
  let done = 0;
  for (const list of byPitch.values()) {
    list.sort((a, b) => a.time - b.time);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const next = i + 1 < list.length ? list[i + 1].time - 0.006 : Infinity;
      let end = p.time + 0.25;
      if (offNet) {
        binsOf(table, p.n, bins);
        referenceAmps(V, T, p.t, bins, refA);
        const limit = Math.min(next - p.time, 30, (T - 4) / FPS - p.time);
        let prev = 0, found = -1;
        for (const d of OFF_DELTAS) {
          if (d > limit) break;
          if (!alive(p.n, p.t, p.time, d)) { found = d; break; }
          prev = d;
        }
        if (found < 0) end = p.time + Math.min(limit, OFF_DELTAS[OFF_DELTAS.length - 1] + 2);
        else {
          let lo = prev, hi = found;
          for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (alive(p.n, p.t, p.time, mid)) lo = mid; else hi = mid; }
          end = p.time + (lo + hi) / 2;
        }
      }
      // the analysis windows see a damper fall a little late; measured on held-out pieces
      end -= END_LATENCY;
      end = Math.min(end, next);
      if (end < p.time + 0.04) end = p.time + 0.04;
      out.push({ pitch: p.pitch, start: p.time, end, amp: ampOf(p.n, p.t), p: p.p });
    }
    progress(++done / byPitch.size);
  }
  // velocity from loudness: v ~ amplitude^0.55, anchored on the 95th percentile
  const amps = out.map((n) => n.amp).filter((a) => a > 0).sort((a, b) => a - b);
  const a95 = amps.length ? amps[Math.floor(amps.length * 0.95)] : 1;
  for (const n of out) {
    const r = n.amp > 0 ? Math.pow(n.amp / a95, 0.55) : 0.2;
    n.velocity = Math.max(12, Math.min(127, Math.round(108 * r)));
    delete n.amp;
  }
  out.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return out;
}
