// usage: node tools/runfile.mjs <audio.f32> <out.mid> [--onset ...] — converts a decoded recording and prints stats
import fs from 'node:fs';
import { convertAudio } from '../core/notewright.js';
import { writeMidi } from '../core/midi.js';
const [file, out] = [process.argv[2], process.argv[3]];
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const nets = {};
for (const k of ['onset', 'offset', 'refine']) if (arg(k)) nets[k] = JSON.parse(fs.readFileSync(arg(k), 'utf8'));
const buf = fs.readFileSync(file);
const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const t0 = Date.now();
let last = '';
const res = convertAudio(x, { nets }, (p, s) => { if (s !== last) { last = s; console.log(`  ${s} at ${((Date.now() - t0) / 1000).toFixed(0)}s`); } });
const secs = (Date.now() - t0) / 1000;
fs.writeFileSync(out, writeMidi(res.notes));
const dur = x.length / 22050;
const lens = res.notes.map((n) => n.end - n.start).sort((a, b) => a - b);
console.log(`audio ${dur.toFixed(0)}s -> ${res.notes.length} notes in ${secs.toFixed(0)}s (${(dur / secs).toFixed(1)}x real time); tuning ${res.meta.cents.toFixed(1)} cents`);
console.log(`median note length ${lens[lens.length >> 1].toFixed(2)}s, ${(res.notes.length / dur).toFixed(1)} notes/s, pitch range ${Math.min(...res.notes.map((n) => n.pitch))}-${Math.max(...res.notes.map((n) => n.pitch))}`);
