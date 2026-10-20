// Renders the spectrogram of a time range with detected notes overlaid (PNG).
// usage: node tools/viewnotes.mjs <audio.f32> <t0> <t1> <out.png> [--onset net.json] [--offset net.json] [--gt gt.json]
import fs from 'node:fs';
import { convertAudio } from '../core/notewright.js';
import { makeGroups, analyze } from '../core/tfr.js';
import { writePNG } from './png.mjs';
import { NB, FPS, SR, NN, PIANO_LO } from '../core/grid.js';

const [file, a, b, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const nets = {};
if (arg('onset')) nets.onset = JSON.parse(fs.readFileSync(arg('onset'), 'utf8'));
if (arg('offset')) nets.offset = JSON.parse(fs.readFileSync(arg('offset'), 'utf8'));
if (arg('refine')) nets.refine = JSON.parse(fs.readFileSync(arg('refine'), 'utf8'));
const buf = fs.readFileSync(file);
const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const pad = 3 * SR;
const s0 = Math.max(0, Math.floor((a - 3) * SR)), s1 = Math.min(x.length, Math.floor((b + 3) * SR));
const seg = x.subarray(s0, s1);
const res = convertAudio(seg, { nets });
const off = s0 / SR;
const notes = res.notes.map((n) => ({ ...n, start: n.start + off, end: n.end + off }));
const groups = makeGroups(res.meta.a4);
const f0 = Math.round(a * FPS), cnt = Math.round((b - a) * FPS);
const V = new Float32Array(cnt * NB);
for (let k = 0; k < cnt; k += 512) V.set(analyze(x, f0 + k, Math.min(512, cnt - k), groups), k * NB);
const PX = Math.max(2, Math.floor(1800 / cnt)), RH = 6;
const W = cnt * PX, H = NN * RH;
const img = Buffer.alloc(W * H * 3);
const set = (px, py, r, g, bl) => { if (px < 0 || px >= W || py < 0 || py >= H) return; const o = (py * W + px) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = bl; };
let vmax = 0; for (let i = 0; i < V.length; i += 7) if (V[i] > vmax) vmax = V[i];
for (let t = 0; t < cnt; t++) for (let n = 0; n < NN; n++) {
  const bin = (n + 1) * 3; let v = 0; for (let d = -1; d <= 1; d++) v = Math.max(v, V[t * NB + bin + d]);
  const c = Math.max(0, Math.min(1, Math.log10(v / vmax + 1e-4) / 3.2 + 1));
  const g = Math.round(255 * c * c);
  for (let yy = 0; yy < RH - 1; yy++) for (let xx = 0; xx < PX; xx++) set(t * PX + xx, (NN - 1 - n) * RH + yy, g * 0.55, g * 0.6, g * 0.75);
}
const X = (sec) => Math.round((sec * FPS - f0) * PX);
for (const n of notes) {
  if (n.end < a || n.start > b) continue;
  const y = (NN - 1 - (n.pitch - PIANO_LO)) * RH;
  const v = n.velocity / 127;
  for (let xx = Math.max(0, X(n.start)); xx < Math.min(W, X(n.end)); xx++) for (let yy = 1; yy < RH - 2; yy++) set(xx, y + yy, 235 * (0.5 + v / 2), 150 * (0.5 + v / 2), 40);
  for (let yy = 0; yy < RH - 1; yy++) set(X(n.start), y + yy, 255, 255, 255);
}
if (arg('gt')) {
  const gt = JSON.parse(fs.readFileSync(arg('gt'), 'utf8')).gt;
  for (const g of gt) {
    if (g.start < a || g.start > b) continue;
    const y = (NN - 1 - (g.pitch - PIANO_LO)) * RH;
    for (let yy = 0; yy < RH - 1; yy++) { set(X(g.start) - 2, y + yy, 60, 255, 90); set(X(g.start) - 1, y + yy, 60, 255, 90); }
  }
}
writePNG(out, W, H, img);
console.log(`wrote ${out} ${W}x${H}; ${notes.filter((n) => n.start >= a && n.start <= b).length} notes in range`);
