import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, render } from '../tools/testsynth.mjs';
import { evaluate } from '../tools/evalnotes.mjs';
import { convertAudio } from '../core/notewright.js';
import { writeMidi, readMidi } from '../core/midi.js';

// A short, fixed piece: melody, chords and runs on a made-up piano with reverb.
// The thresholds are deliberately loose; they catch breakage, not small drifts.
test('transcribes a synthetic piano piece', { timeout: 240000 }, () => {
  const piece = compose(4242, 14, 'mixed');
  const r = render(piece, { seed: 4242, reverb: 0.25, rt60: 1.3 });
  const gt = r.notes.map((n) => ({ pitch: n.pitch, start: n.start, end: n.end }));
  const out = convertAudio(r.audio, { sensitivity: 0.5 });
  const est = out.notes.map((n) => ({ pitch: n.pitch, start: n.start, end: n.end }));
  const ev = evaluate(gt, est, 0.05);
  assert.ok(ev.f1 > 0.55, `note F1 ${ev.f1.toFixed(3)} (P ${ev.precision.toFixed(2)}, R ${ev.recall.toFixed(2)})`);
  assert.ok(Math.abs(ev.medianOnsetErr) < 0.02, `median onset error ${(ev.medianOnsetErr * 1000).toFixed(1)} ms`);
  for (const n of out.notes) {
    assert.ok(n.velocity >= 1 && n.velocity <= 127);
    assert.ok(n.end > n.start);
  }
  // and the result survives a trip through a MIDI file
  const back = readMidi(writeMidi(out.notes));
  assert.equal(back.length, out.notes.length);
});

test('silence produces no notes', () => {
  const out = convertAudio(new Float32Array(22050 * 3), {});
  assert.equal(out.notes.length, 0);
});
