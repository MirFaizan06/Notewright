// Sampled grand piano for the MIDI preview.
//
// 30 recordings of a Yamaha C5 (Salamander Grand Piano, CC BY 3.0, see
// assets/piano/NOTICE.txt), one every third key. Each note plays the nearest
// recording, repitched by at most one and a half semitones, with velocity
// controlling both loudness and brightness. Rendering uses the browser's own
// offline audio engine, so it is fast and runs on a phone too.

import { renderPiano } from '../../core/synth.js';

const PITCH_CLASS = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
// recordings sit on A, C, D# and F# of every octave, from A0 (21) to C8 (108)
const ROOTS = [];
for (let pitch = 21; pitch <= 108; pitch += 3) ROOTS.push({ name: `${PITCH_CLASS[pitch % 12]}${Math.floor(pitch / 12) - 1}`, pitch });

export const PIANO_RATE = 44100;

let loading = null;

function inlineData() {
  const el = typeof document !== 'undefined' && document.getElementById('piano-data');
  return el ? JSON.parse(el.textContent) : null;
}

function fromBase64(s) {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

/** Averages the channels into a new mono buffer so the stereo original can be freed. */
function toMono(ctx, buf) {
  if (buf.numberOfChannels === 1) return buf;
  const mono = ctx.createBuffer(1, buf.length, buf.sampleRate);
  const dst = mono.getChannelData(0);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    for (let i = 0; i < dst.length; i++) dst[i] += src[i] / buf.numberOfChannels;
  }
  return mono;
}

/** Decodes all recordings once; later calls reuse the result. */
export function loadPiano() {
  if (loading) return loading;
  loading = (async () => {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const inline = inlineData();
    const ctx = new OAC(1, 1, PIANO_RATE);
    // One at a time and straight to mono: decoding all 30 stereo recordings at once can use
    // hundreds of megabytes, which is enough to make a phone's browser engine give up.
    const out = [];
    for (const r of ROOTS) {
      const bytes = inline ? fromBase64(inline[r.name]) : await (await fetch(new URL(`../assets/piano/${r.name}.mp3`, import.meta.url))).arrayBuffer();
      out.push({ ...r, buffer: toMono(ctx, await ctx.decodeAudioData(bytes)) });
    }
    return out;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

function nearest(samples, pitch) {
  let best = samples[0];
  for (const s of samples) if (Math.abs(s.pitch - pitch) < Math.abs(best.pitch - pitch)) best = s;
  return best;
}

/** Scales the whole render so its loudest point sits just below full scale. */
function normalise(x, target = 0.9) {
  let pk = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
  if (pk > 1e-6) { const g = target / pk; for (let i = 0; i < x.length; i++) x[i] *= g; }
  return x;
}

const SEGMENT = 15;   // seconds rendered per pass: the offline engine slows down when thousands of notes are scheduled at once
const WARMUP = 0.6;   // lead-in so the compressor is settled at every join (discarded)

function release(pitch) { return pitch < 48 ? 0.32 : pitch < 72 ? 0.2 : 0.12; } // dampers fall slower in the bass

/** How long a note keeps making sound, from its start. */
function soundLength(n, s) {
  const rate = Math.pow(2, (n.pitch - s.pitch) / 12);
  return Math.min(Math.max(n.end, n.start + 0.06) - n.start + release(n.pitch) * 2.2, s.buffer.duration / rate);
}

/**
 * Renders the notes to mono audio.
 * Falls back to the built-in additive synth if the recordings cannot be used.
 * @param {(fraction:number)=>void} [onProgress]
 * @returns {Promise<{audio: Float32Array, rate: number, sampled: boolean}>}
 */
export async function renderPlayback(notes, duration, onProgress) {
  let samples;
  try { samples = await loadPiano(); } catch (e) { samples = null; }
  if (!samples) return { audio: normalise(renderPiano(notes, 32000, duration)), rate: 32000, sampled: false };

  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  // very long pieces render at half rate to keep memory modest on phones
  const rate = duration > 600 ? PIANO_RATE / 2 : PIANO_RATE;
  const total = Math.ceil((duration + 3) * rate);
  const out = new Float32Array(total);
  const sorted = notes.slice().sort((a, b) => a.start - b.start);
  const picked = sorted.map((n) => nearest(samples, n.pitch));
  const maxRing = 14;

  for (let t0 = 0; t0 < duration + 3; t0 += SEGMENT) {
    const t1 = Math.min(duration + 3, t0 + SEGMENT);
    const pre = t0 === 0 ? 0 : WARMUP;
    const origin = t0 - pre;                                   // time of this pass's first sample
    const ctx = new OAC(1, Math.ceil((t1 - origin) * rate), rate);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = 0.8;
    comp.connect(master).connect(ctx.destination);

    // notes that start before the end of this pass and are still sounding after its start
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m].start < origin - maxRing) lo = m + 1; else hi = m; }
    for (let i = lo; i < sorted.length && sorted[i].start < t1; i++) {
      const n = sorted[i], s = picked[i];
      const len = soundLength(n, s);
      if (n.start + len <= origin) continue;
      const v = Math.max(0.03, Math.min(1, n.velocity / 127));
      const pr = Math.pow(2, (n.pitch - s.pitch) / 12);
      const src = ctx.createBufferSource();
      src.buffer = s.buffer;
      src.playbackRate.value = pr;
      // soft notes are darker as well as quieter
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800 + 14000 * Math.pow(v, 0.9);
      lp.Q.value = 0.3;
      const g = ctx.createGain();
      const peak = Math.pow(v, 1.35) * 0.95;
      const rel = release(n.pitch);
      const on = n.start - origin;                              // seconds into this pass (may be negative)
      const off = Math.max(n.end, n.start + 0.06) - origin;
      g.gain.setValueAtTime(peak, Math.max(0, on));
      g.gain.setValueAtTime(peak, Math.max(0, off));
      g.gain.setTargetAtTime(0, Math.max(0, off), rel / 3.5);
      src.connect(lp).connect(g).connect(comp);
      if (on >= 0) src.start(on);
      else src.start(0, -on * pr);                              // note began in an earlier pass: join it part-way through
      src.stop(Math.max(0, on) + (on >= 0 ? len : len + on));
    }
    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);
    const skip = Math.round(pre * rate), dst = Math.round(t0 * rate);
    out.set(data.subarray(skip, Math.min(data.length, skip + (total - dst))), dst);
    if (onProgress) onProgress(Math.min(1, t1 / (duration + 3)));
  }
  return { audio: normalise(out), rate, sampled: true };
}
