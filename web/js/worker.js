// Runs the whole conversion off the UI thread.

import { convertAudio } from '../../core/notewright.js';
import { writeMidi } from '../../core/midi.js';

const send = (m, transfer) => self.postMessage(m, transfer || []);

self.onmessage = (e) => {
  const m = e.data;
  if (m.type !== 'run') return;
  try {
    const res = convertAudio(m.samples, m.options || {}, (p, stage) => send({ type: 'progress', p, stage }));
    const midi = writeMidi(res.notes, { name: 'Piano' });
    send({ type: 'result', notes: res.notes, meta: res.meta, midi }, [midi.buffer]);
  } catch (err) {
    send({ type: 'error', message: String((err && err.message) || err) });
  }
};
