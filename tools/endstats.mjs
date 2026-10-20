// Distribution of note-end errors for matched notes. usage: node tools/endstats.mjs <dir> --onset a --refine b --offset c [--only 9002,9004] [--th 0.4]
import fs from 'node:fs';
import path from 'node:path';
import { convertAudio } from '../core/notewright.js';
const dir = process.argv[2];
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const nets = {};
for (const k of ['onset', 'offset', 'refine']) if (arg(k)) nets[k] = JSON.parse(fs.readFileSync(arg(k), 'utf8'));
const only = arg('only') ? arg('only').split(',').map(Number) : null;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f.startsWith('v') && (!only || only.includes(+f.slice(1, -5)))).sort();
const rows = [];
for (const f of files) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const buf = fs.readFileSync(path.join(dir, f.replace('.json', '.f32')));
  const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const res = convertAudio(x, { nets, ...(arg('th') ? { threshold: +arg('th') } : {}) });
  const used = new Set();
  for (const g of meta.gt) {
    let best = -1, bd = 0.05;
    res.notes.forEach((e, i) => { if (used.has(i) || e.pitch !== g.pitch) return; const d = Math.abs(e.start - g.start); if (d <= bd) { bd = d; best = i; } });
    if (best < 0) continue;
    used.add(best);
    const e = res.notes[best];
    rows.push({ pitch: g.pitch, dur: g.end - g.start, keyDur: g.keyEnd - g.start, pedal: g.end > g.keyEnd + 0.01, err: e.end - g.end });
  }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const bucket = (name, f) => { const r = rows.filter(f); if (!r.length) return; const e = r.map((x) => x.err); const ok = r.filter((x) => Math.abs(x.err) <= Math.max(0.05, 0.2 * x.dur)).length; console.log(`${name.padEnd(22)} n=${String(r.length).padStart(4)}  within tol ${(100 * ok / r.length).toFixed(0).padStart(3)}%  err p10/50/90: ${[0.1, 0.5, 0.9].map((p) => (q(e, p) * 1000).toFixed(0)).join(' / ')} ms`); };
bucket('all matched', () => true);
bucket('no pedal', (r) => !r.pedal);
bucket('pedal extended', (r) => r.pedal);
bucket('dur < 0.3 s', (r) => r.dur < 0.3);
bucket('dur 0.3 - 1 s', (r) => r.dur >= 0.3 && r.dur < 1);
bucket('dur 1 - 3 s', (r) => r.dur >= 1 && r.dur < 3);
bucket('dur >= 3 s', (r) => r.dur >= 3);
bucket('no pedal, pitch < 48', (r) => !r.pedal && r.pitch < 48);
bucket('no pedal, pitch 48-71', (r) => !r.pedal && r.pitch >= 48 && r.pitch < 72);
bucket('no pedal, pitch >= 72', (r) => !r.pedal && r.pitch >= 72);
bucket('no pedal, dur >= 0.6 s', (r) => !r.pedal && r.dur >= 0.6);
