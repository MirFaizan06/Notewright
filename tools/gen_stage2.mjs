// usage: node gen_stage2.mjs <seed> <audioDir> <outDir> <stage1.json>
// Runs the first stage on a cached piece and writes candidate rows (q<seed>.x/.y) for the second stage.
import { makeGroups } from '../core/tfr.js';
import { estimateTuning } from '../core/tuning.js';
import { spectrogram, classifyFrames, pickNotes } from '../core/transcribe.js';
import { refineFeatures, N_REFINE, FIRST_PASS_MIN } from '../core/refine.js';
import { MLP } from '../core/mlp.js';
import { SHORT_PERIODS, SR, FPS, NN } from '../core/grid.js';
import fs from 'node:fs';
import path from 'node:path';

const [seed, audioDir, outDir, netFile] = [+process.argv[2], process.argv[3], process.argv[4], process.argv[5]];
fs.mkdirSync(outDir, { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(audioDir, `a${seed}.json`), 'utf8'));
const buf = fs.readFileSync(path.join(audioDir, `a${seed}.f32`));
const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const net = new MLP(JSON.parse(fs.readFileSync(netFile, 'utf8')));
const a4 = 440 * Math.pow(2, estimateTuning(x, SR) / 1200);
const { V, T } = spectrogram(x, makeGroups(a4));
const { V: V2 } = spectrogram(x, makeGroups(a4, SHORT_PERIODS));
const { P } = classifyFrames(V, V2, T, net, a4, 1);
const cands = pickNotes(P, T, FIRST_PASS_MIN);
// label: each reference note is claimed by its nearest candidate of the same pitch within 50 ms
const claimed = new Map();
for (const g of meta.gt) {
  let best = -1, bd = 0.05 + 1e-9;
  cands.forEach((c, i) => { if (c.pitch !== g.pitch) return; const d = Math.abs(c.time - g.start); if (d < bd && !claimed.has(i)) { bd = d; best = i; } });
  if (best >= 0) claimed.set(best, true);
}
const rows = new Float32Array(cands.length * N_REFINE), ys = new Uint8Array(cands.length);
cands.forEach((c, i) => { refineFeatures(P, T, c.n, c.t, rows, i * N_REFINE); ys[i] = claimed.has(i) ? 1 : 0; });
fs.writeFileSync(path.join(outDir, `q${seed}.x`), Buffer.from(rows.buffer));
fs.writeFileSync(path.join(outDir, `q${seed}.y`), Buffer.from(ys.buffer));
const pos = ys.reduce((a, b) => a + b, 0);
console.log(`seed ${seed}: candidates ${cands.length}, matched ${pos}/${meta.gt.length}`);
