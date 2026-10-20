// Test-bench piano: independent of the transcriber's own model so that the
// evaluation is not circular. Generates a known piece of music (ground truth),
// renders it with a fairly realistic acoustic model, and optionally adds
// pedal, reverb, echo and noise.

import { complexFFT, nextPow2 } from '../core/fft.js';

export function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.gauss = () => {
    const u = Math.max(1e-9, next()), v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return next;
}

/** Compose a piece: returns {notes:[{pitch,start,end,vel}], pedal:[[down,up]...], dur} */
export function compose(seed, seconds = 45, style = 'mixed') {
  const R = rng(seed);
  const notes = [];
  const pedal = [];
  const beat = 0.5;
  let t = 0.5;
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const root = R.int(48, 55);
  const inScale = (p) => { const d = ((p - root) % 12 + 12) % 12; return scale.includes(d); };
  const snap = (p) => { while (!inScale(p)) p++; return p; };
  const add = (pitch, start, len, vel) => {
    if (pitch < 21 || pitch > 108) return;
    notes.push({ pitch, start, end: start + len, vel: Math.max(18, Math.min(120, Math.round(vel))) });
  };
  while (t < seconds - 3) {
    const kind = style === 'mixed' ? R.pick(['melody', 'chords', 'run', 'octaves', 'repeat', 'quietinner', 'bassline', 'arpeggio', 'tremolo', 'trill', 'bigchord', 'twohands', 'sparse']) : style;
    const bar = beat * 4;
    const loud = R.range(45, 105);
    if (kind === 'melody') {
      let p = snap(R.int(62, 80));
      const n = R.int(5, 9);
      for (let i = 0; i < n; i++) {
        const len = R.pick([0.25, 0.5, 0.5, 1, 1.5]);
        add(p, t, len * R.range(0.5, 1.0), loud + R.range(-8, 8));
        if (i % 2 === 0) add(snap(R.int(36, 52)), t, len * 0.9, loud - 12);
        p = snap(p + R.int(-4, 4));
        t += len;
      }
    } else if (kind === 'chords') {
      const n = R.int(3, 5);
      for (let i = 0; i < n; i++) {
        const base = snap(R.int(44, 62));
        const ch = [base, base + R.pick([3, 4]), base + 7, base + R.pick([10, 11, 12]), base + 12 + R.pick([0, 4])];
        const len = R.pick([0.5, 1, 1.5, 2]);
        const rollv = R.range(0, 0.03);
        ch.slice(0, R.int(3, 5)).forEach((p, j) => add(p, t + j * rollv, len * R.range(0.7, 1), loud + R.range(-6, 6)));
        t += len;
      }
    } else if (kind === 'run') {
      let p = snap(R.int(55, 70));
      const dir = R.pick([1, -1]);
      const n = R.int(10, 24);
      const step = R.pick([0.08, 0.11, 0.14]);
      for (let i = 0; i < n; i++) {
        add(p, t, step * R.range(0.9, 2.2), loud + R.range(-10, 6));
        do { p += dir; } while (!inScale(p));
        t += step;
      }
      t += 0.1;
    } else if (kind === 'octaves') {
      const n = R.int(4, 8);
      for (let i = 0; i < n; i++) {
        const p = snap(R.int(40, 64));
        const len = R.pick([0.25, 0.5, 0.75]);
        add(p, t, len * 0.9, loud + 5);
        add(p + 12, t, len * 0.9, loud);
        if (R.range(0, 1) > 0.6) add(p + 19, t, len * 0.9, loud - 6);
        t += len;
      }
    } else if (kind === 'repeat') {
      const p = snap(R.int(60, 84));
      const step = R.pick([0.12, 0.15, 0.2]);
      const n = R.int(6, 14);
      for (let i = 0; i < n; i++) { add(p, t, step * 0.8, loud + R.range(-6, 6) - i * 0.8); t += step; }
      t += 0.2;
    } else if (kind === 'quietinner') {
      // loud outer voices with very faint notes in between
      const n = R.int(4, 7);
      for (let i = 0; i < n; i++) {
        const len = 0.5;
        add(snap(R.int(36, 48)), t, len, 95);
        add(snap(R.int(72, 84)), t, len, 90);
        add(snap(R.int(58, 70)), t + 0.02, len * 0.8, R.range(20, 32));
        t += len;
      }
    } else if (kind === 'arpeggio') {
      const base = snap(R.int(36, 55));
      const shape = [0, 4, 7, 12, 16, 19, 24].map((d) => base + d);
      const step = R.pick([0.1, 0.15, 0.2, 0.25]);
      const up = R.range(0, 1) < 0.5;
      const seq = up ? shape : [...shape].reverse();
      for (let rep = 0; rep < R.int(1, 3); rep++) for (const p of seq) { add(p, t, step * R.range(1.5, 5), loud + R.range(-8, 4)); t += step; }
    } else if (kind === 'tremolo') {
      const a_ = snap(R.int(48, 70)), b_ = a_ + R.pick([3, 4, 5, 7, 12]);
      const step = R.pick([0.07, 0.09, 0.12]);
      for (let i = 0; i < R.int(10, 24); i++) { add(i % 2 ? b_ : a_, t, step * 1.2, loud + R.range(-6, 6)); t += step; }
    } else if (kind === 'trill') {
      const a_ = snap(R.int(58, 84)), b_ = a_ + R.pick([1, 2]);
      const step = R.pick([0.06, 0.08, 0.1]);
      for (let i = 0; i < R.int(8, 20); i++) { add(i % 2 ? b_ : a_, t, step * 1.1, loud - 5 + R.range(-5, 5)); t += step; }
    } else if (kind === 'bigchord') {
      const n = R.int(2, 4);
      for (let i = 0; i < n; i++) {
        const base = snap(R.int(30, 48));
        const pcs = [0, 7, 12, 16, 19, 24, 28, 31, 36].slice(0, R.int(4, 9));
        const len = R.pick([0.75, 1, 1.5, 2]);
        pcs.forEach((d, j) => add(base + d, t + j * R.range(0, 0.02), len, loud + R.range(-8, 8)));
        t += len;
      }
    } else if (kind === 'twohands') {
      const n = R.int(6, 12);
      for (let i = 0; i < n; i++) {
        const mel = snap(R.int(64, 88));
        add(mel, t, 0.5, loud + 8);
        if (i % 2 === 0) { const bs = snap(R.int(33, 50)); add(bs, t, 0.5, loud - 5); add(bs + 7, t + 0.01, 0.5, loud - 12); add(bs + 12, t + 0.02, 0.5, loud - 12); }
        t += 0.25;
      }
    } else if (kind === 'sparse') {
      for (let i = 0; i < R.int(3, 6); i++) { add(snap(R.int(30, 100)), t, R.range(0.5, 2), R.range(25, 100)); t += R.range(0.4, 1.2); }
    } else { // bassline
      const n = R.int(4, 8);
      for (let i = 0; i < n; i++) {
        const p = snap(R.int(24, 45));
        const len = R.pick([0.5, 1, 1.5]);
        add(p, t, len, loud);
        t += len;
      }
    }
    t += R.pick([0, 0, 0.25, 0.5]);
    void bar;
  }
  // pedal: random segments
  let pt = 1;
  while (pt < seconds - 4) {
    if (R.range(0, 1) < 0.5) {
      const len = R.range(0.8, 3.5);
      pedal.push([pt, pt + len]);
      pt += len + 0.1;
    } else pt += R.range(1, 3);
  }
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  // drop exact duplicates
  const seen = new Set();
  const out = notes.filter((n) => { const k = n.pitch + '@' + n.start.toFixed(3); if (seen.has(k)) return false; seen.add(k); return true; });
  return { notes: out, pedal, dur: seconds };
}

/** Same-pitch notes cannot overlap in the ground truth. */
export function trimOverlaps(notes) {
  const by = new Map();
  for (const n of notes) { if (!by.has(n.pitch)) by.set(n.pitch, []); by.get(n.pitch).push(n); }
  for (const arr of by.values()) {
    arr.sort((a, b) => a.start - b.start);
    for (let i = 0; i < arr.length - 1; i++) if (arr[i].end > arr[i + 1].start - 0.02) arr[i].end = Math.max(arr[i].start + 0.04, arr[i + 1].start - 0.02);
  }
  return notes.filter((n) => n.end > n.start + 0.03);
}

function pedalUpAfter(pedal, t) {
  for (const [d, u] of pedal) if (t >= d && t < u) return u;
  return t;
}

/**
 * Render to mono Float32Array at `sr`.
 * @param {object} opts {sr, reverb: 0..1 wet, rt60, echo:{delay,gain}, noiseDb, seed}
 */
export function render(piece, opts = {}) {
  const sr = opts.sr || 22050;
  const R = rng(opts.seed || 7);
  const total = Math.ceil((piece.dur + 4) * sr);
  const dry = new Float32Array(total);
  const notes = trimOverlaps(piece.notes.map((n) => ({ ...n })));
  const I = rng((opts.seed || 7) * 977 + 13);
  const inst = {
    bScale: I.range(0.5, 2.5),
    rolloffBase: I.range(0.7, 1.5),
    rolloffVel: I.range(0.4, 1.1),
    ampSigma: I.range(0.2, 0.55),
    tauScale: I.range(0.5, 1.6),
    hammer: I.range(0.2, 1.6),
    detuneCents: opts.detuneCents ?? I.range(-35, 35),
    eqTilt: I.range(-5, 5),
    lowFund: I.range(0.05, 0.6),
    dampMul: I.range(0.6, 1.8),
  };
  const bScale = inst.bScale;
  const keyRng = new Map(); // fixed "instrument": identical timbre every time a key is struck
  const key = (pitch) => {
    if (!keyRng.has(pitch)) {
      const K = rng((opts.seed || 7) * 131 + pitch * 7919);
      keyRng.set(pitch, {
        tune: K.gauss() * 0.0002,
        bMul: K.range(0.7, 1.4),
        strike: K.pick([1 / 7, 1 / 8, 1 / 8.5, 1 / 9]),
        amp: Array.from({ length: 90 }, () => Math.exp(K.gauss() * inst.ampSigma)),
        det: Array.from({ length: 90 }, () => K.gauss() * 0.25 + 0.3),
        tauMul: K.range(0.8, 1.25),
      });
    }
    return keyRng.get(pitch);
  };

  for (const nt of notes) {
    const kp = key(nt.pitch);
    const f0 = 440 * Math.pow(2, (nt.pitch - 69 + inst.detuneCents / 100) / 12) * Math.pow(2, kp.tune);
    const midi = nt.pitch;
    const Bl = midi >= 45 ? -4 + 0.0255 * (midi - 45) : -4 + 0.012 * (45 - midi);
    const B = Math.pow(10, Bl) * bScale * kp.bMul;
    const v = nt.vel / 127;
    const amp = 0.22 * Math.pow(v, 1.7) * (midi < 40 ? 1.2 : 1);
    const rolloff = inst.rolloffBase + 0.6 - inst.rolloffVel * v;
    const strike = kp.strike;
    const tau0 = 4.2 * (1.45 - (midi - 21) / 87 * 1.15) * kp.tauMul * inst.tauScale;
    const pedalUp = pedalUpAfter(piece.pedal, nt.end);
    const releaseAt = Math.max(nt.end, pedalUp);
    const dampTau = (midi < 48 ? 0.14 : 0.07) * inst.dampMul;
    const startS = Math.floor(nt.start * sr);
    const tail = Math.min(8, tau0 * 3) + (releaseAt - nt.start);
    const lenS = Math.min(total - startS, Math.floor(Math.min(tail, 10) * sr));
    for (let h = 1; h < 80; h++) {
      const fh = h * f0 * Math.sqrt(1 + B * h * h);
      if (fh > 10200) break;
      let ah = amp * Math.pow(h, -rolloff) * kp.amp[h] * Math.exp(R.gauss() * 0.08) * (0.25 + 0.75 * Math.abs(Math.sin(Math.PI * h * strike)));
      if (midi < 45 && h === 1) ah *= inst.lowFund;
      ah *= Math.pow(10, (inst.eqTilt * Math.log2(fh / 1000)) / 20);
      if (ah < amp * 1e-4) continue;
      const tau = tau0 / (1 + 0.1 * h + 0.002 * h * h);
      const det = kp.det[h] * (fh / 440) ** 0.5; // Hz between the strings
      // two strings as two oscillators
      for (let s = 0; s < 2; s++) {
        const fs = fh + (s === 0 ? -det / 2 : det / 2);
        const w = (2 * Math.PI * fs) / sr;
        const ph = R.range(0, 2 * Math.PI);
        let cr = Math.cos(ph), ci = Math.sin(ph);
        const wr = Math.cos(w), wi = Math.sin(w);
        const a = ah * 0.5;
        const lenP = Math.min(lenS, Math.floor(Math.min(releaseAt - nt.start + 6 * dampTau, 37 * tau) * sr));
        for (let i = 0; i < lenP; i++) {
          const tt = i / sr;
          const g = 0.65 * Math.exp(-tt / tau) + 0.35 * Math.exp(-tt / (4 * tau));
          let e = g;
          const ta = nt.start + tt;
          if (ta > releaseAt) e *= Math.exp(-(ta - releaseAt) / dampTau);
          if (tt < 0.003) e *= tt / 0.003;
          dry[startS + i] += a * e * ci;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
    // hammer noise
    const nLen = Math.floor(0.018 * sr);
    let lp1 = 0, lp2 = 0;
    const hv = 0.05 * inst.hammer * Math.pow(v, 1.3) * (midi > 60 ? 1 : 1.5);
    for (let i = 0; i < nLen && startS + i < total; i++) {
      const x = R.gauss();
      lp1 += 0.35 * (x - lp1);
      lp2 += 0.08 * (x - lp2);
      dry[startS + i] += hv * (lp1 - lp2) * Math.exp(-i / (0.005 * sr));
    }
  }

  let out = dry;
  if (opts.echo) {
    const d = Math.floor(opts.echo.delay * sr);
    const e = new Float32Array(total);
    for (let i = 0; i < total; i++) e[i] = dry[i] + (i >= d ? opts.echo.gain * e[i - d] : 0);
    out = e;
  }
  if (opts.reverb && opts.reverb > 0) {
    const rt = opts.rt60 || 1.4;
    const irLen = Math.floor(rt * 1.1 * sr);
    const ir = new Float32Array(irLen);
    let lp = 0;
    for (let i = 0; i < irLen; i++) {
      const tt = i / sr;
      const k = 0.55 * Math.exp(-tt / (rt * 0.45)) + 0.05; // darker tail
      lp += k * (R.gauss() - lp);
      ir[i] = lp * Math.pow(10, (-60 * tt) / rt / 20);
    }
    for (let j = 0; j < 8; j++) ir[Math.floor(R.range(0.004, 0.06) * sr)] += R.range(0.3, 0.7) * (R.range(0, 1) < 0.5 ? -1 : 1);
    // normalise IR energy
    let en = 0; for (let i = 0; i < irLen; i++) en += ir[i] * ir[i];
    const sc = 1 / Math.sqrt(en);
    for (let i = 0; i < irLen; i++) ir[i] *= sc;
    const wet = fftConvolve(out, ir);
    const mixed = new Float32Array(total);
    // equal-energy blend
    let ed = 0, ew = 0;
    for (let i = 0; i < total; i++) { ed += out[i] * out[i]; ew += wet[i] * wet[i]; }
    const k = Math.sqrt(ed / (ew + 1e-12));
    for (let i = 0; i < total; i++) mixed[i] = (1 - opts.reverb) * out[i] + opts.reverb * k * wet[i];
    out = mixed;
  }
  if (opts.noiseDb !== undefined) {
    const na = Math.pow(10, opts.noiseDb / 20);
    let lp = 0;
    for (let i = 0; i < total; i++) { lp += 0.2 * (R.gauss() - lp); out[i] += na * (0.7 * lp + 0.3 * R.gauss()); }
  }
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.8 / (peak || 1);
  const fin = new Float32Array(total);
  for (let i = 0; i < total; i++) fin[i] = out[i] * g;
  return { audio: fin, sr, notes };
}

export function fftConvolve(x, h) {
  const n = nextPow2(x.length + h.length);
  const ar = new Float64Array(n), ai = new Float64Array(n);
  const br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x); br.set(h);
  complexFFT(ar, ai); complexFFT(br, bi);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    const im = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r; ai[i] = im;
  }
  complexFFT(ar, ai, true);
  return Float32Array.from(ar.subarray(0, x.length));
}
