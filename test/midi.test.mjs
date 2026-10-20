import test from 'node:test';
import assert from 'node:assert/strict';
import { writeMidi, readMidi } from '../core/midi.js';

test('MIDI files round-trip with millisecond accuracy', () => {
  const notes = [
    { pitch: 60, start: 0, end: 0.5, velocity: 80 },
    { pitch: 64, start: 0.25, end: 1.3, velocity: 101 },
    { pitch: 21, start: 12.345, end: 80.0, velocity: 1 },
    { pitch: 108, start: 12.345, end: 12.4, velocity: 127 },
  ];
  const bytes = writeMidi(notes);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  const back = readMidi(bytes);
  assert.equal(back.length, notes.length);
  for (const n of notes) {
    const m = back.find((b) => b.pitch === n.pitch && Math.abs(b.start - n.start) < 0.002);
    assert.ok(m, `pitch ${n.pitch}`);
    assert.ok(Math.abs(m.end - n.end) < 0.002);
    assert.equal(m.velocity, n.velocity);
  }
});

test('repeated notes never overlap in the file', () => {
  const back = readMidi(writeMidi([
    { pitch: 60, start: 0, end: 0.1, velocity: 90 },
    { pitch: 60, start: 0.1, end: 0.2, velocity: 90 },
  ]));
  assert.equal(back.length, 2);
  assert.ok(back[0].end <= back[1].start + 1e-9);
});
