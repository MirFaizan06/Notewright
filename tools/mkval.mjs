// usage: node mkval.mjs <seed> <outDir> [secs] [style]  -> renders a held-out piece (audio + ground truth)
import { compose, render, rng } from './testsynth.mjs';
import fs from 'node:fs';
import path from 'node:path';
const seed = +process.argv[2], dir = process.argv[3], secs = +(process.argv[4] || 40), style = process.argv[5] || 'mixed';
fs.mkdirSync(dir, { recursive: true });
const R = rng(seed * 31 + 5);
const piece = compose(seed, secs, style);
const opts = { seed };
if (R.range(0, 1) < 0.75) { opts.reverb = R.range(0.1, 0.6); opts.rt60 = R.range(0.5, 2.8); }
if (R.range(0, 1) < 0.15) opts.echo = { delay: R.range(0.15, 0.4), gain: R.range(0.2, 0.5) };
if (R.range(0, 1) < 0.35) opts.noiseDb = R.range(-52, -36);
if (process.argv[6]) Object.assign(opts, JSON.parse(process.argv[6]));
const r = render(piece, opts);
const gt = r.notes.map(n => { let aud = n.end; for (const [d, u] of piece.pedal) if (n.end >= d && n.end < u) aud = u; return { pitch: n.pitch, start: n.start, end: aud, keyEnd: n.end, vel: n.vel }; });
fs.writeFileSync(path.join(dir, `v${seed}.f32`), Buffer.from(r.audio.buffer));
fs.writeFileSync(path.join(dir, `v${seed}.json`), JSON.stringify({ seed, secs, opts, gt }));
console.log(`val ${seed}: ${gt.length} notes, opts ${JSON.stringify(opts)}`);
