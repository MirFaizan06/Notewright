// Offline piano renderer used for playback: additive partials with inharmonicity,
// two slightly detuned strings on the lowest partials, velocity-dependent
// brightness, a hammer thump and a damper on release. Plain arithmetic with
// recursive oscillators and envelopes (no per-sample transcendental calls), so it
// is fast enough for long pieces on a phone and runs the same in a worker or Node.

const TWO_PI = 2 * Math.PI;

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * @param {{pitch:number,start:number,end:number,velocity:number}[]} notes
 * @param {number} sampleRate
 * @param {number} [duration] seconds (defaults to last note + tail)
 * @returns {Float32Array} mono
 */
export function renderPiano(notes, sampleRate = 32000, duration) {
  const last = notes.reduce((m, n) => Math.max(m, n.end), 0);
  const total = Math.ceil((duration ?? last + 3.5) * sampleRate);
  const out = new Float32Array(total);
  const rnd = lcg(12345);
  const fMax = Math.min(14000, sampleRate * 0.45);

  for (const note of notes) {
    const midi = note.pitch;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const v = Math.max(0.02, note.velocity / 127);
    const B = Math.pow(10, midi >= 45 ? -4 + 0.0255 * (midi - 45) : -4 + 0.012 * (45 - midi));
    const rolloff = 1.55 - 0.7 * v;
    const amp = 0.17 * Math.pow(v, 1.5) * (midi < 40 ? 1.25 : midi > 90 ? 0.8 : 1);
    const tau0 = 3.6 * (1.45 - ((midi - 21) / 87) * 1.2);
    const start = Math.floor(note.start * sampleRate);
    const holdEnd = Math.max(note.end, note.start + 0.05);
    const release = midi < 48 ? 0.16 : 0.09;
    const relS = Math.floor((holdEnd - note.start) * sampleRate);
    const lenS = Math.min(total - start, Math.floor(Math.min(holdEnd - note.start + release * 7, 12) * sampleRate));
    if (lenS <= 0) continue;
    const strike = 0.12 + 0.01 * ((midi * 7) % 5);
    const relDecay = Math.exp(-1 / (release * sampleRate));

    for (let h = 1; h <= 28; h++) {
      const fh = h * f0 * Math.sqrt(1 + B * h * h);
      if (fh > fMax) break;
      let ah = amp * Math.pow(h, -rolloff) * (0.3 + 0.7 * Math.abs(Math.sin(Math.PI * h * strike)));
      if (midi < 45 && h === 1) ah *= 0.45;
      if (ah < amp * 2e-4) continue;
      const tau = tau0 / (1 + 0.1 * h + 0.003 * h * h);
      const lenP = Math.min(lenS, Math.floor(Math.min(37 * tau, relS / sampleRate + 7 * release) * sampleRate));
      const d1 = Math.exp(-1 / (tau * sampleRate));
      const d2 = Math.exp(-1 / (4 * tau * sampleRate));
      const strings = h <= 4 ? 2 : 1;
      const detune = 0.12 * Math.sqrt(fh / 440);
      for (let s = 0; s < strings; s++) {
        const fs = strings === 2 ? fh + (s === 0 ? -detune : detune) : fh;
        const w = (TWO_PI * fs) / sampleRate;
        const wr = Math.cos(w), wi = Math.sin(w);
        const ph = rnd() * TWO_PI;
        let cr = Math.cos(ph), ci = Math.sin(ph);
        const a = ah / strings;
        let e1 = 0.65, e2 = 0.35, rel = 1;
        for (let i = 0; i < lenP; i++) {
          let env = e1 + e2;
          if (i > relS) { rel *= relDecay; env *= rel; }
          if (i < 96) env *= i / 96;
          out[start + i] += a * env * ci;
          e1 *= d1; e2 *= d2;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
    // hammer thump
    const nLen = Math.floor(0.016 * sampleRate);
    let l1 = 0, l2 = 0, g = 1;
    const gd = Math.exp(-1 / (0.004 * sampleRate));
    const hv = 0.035 * Math.pow(v, 1.3);
    for (let i = 0; i < nLen && start + i < total; i++) {
      const x = rnd() * 2 - 1;
      l1 += 0.35 * (x - l1);
      l2 += 0.07 * (x - l2);
      out[start + i] += hv * (l1 - l2) * g;
      g *= gd;
    }
  }
  // gentle soft-clip so dense passages never harshly clip
  for (let i = 0; i < total; i++) {
    const x = out[i] * 1.6;
    out[i] = x / (1 + 0.55 * Math.abs(x));
  }
  return out;
}
