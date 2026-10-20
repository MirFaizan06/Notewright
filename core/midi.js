// Standard MIDI File (format 1) writer and a small reader (used by tests).

const PPQ = 960;      // ticks per quarter note
const BPM = 120;      // fixed tempo: 1 tick = 1.0417 ms, so timing in seconds is preserved

const secToTick = (s) => Math.round(s * (PPQ * BPM) / 60);

function varLen(n, out) {
  let buf = n & 0x7f;
  while ((n >>= 7)) { buf <<= 8; buf |= (n & 0x7f) | 0x80; }
  for (;;) { out.push(buf & 0xff); if (buf & 0x80) buf >>= 8; else break; }
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0) & 127);

function trackChunk(bytes) { return [...ascii('MTrk'), ...u32(bytes.length), ...bytes]; }

/**
 * @param {{pitch:number,start:number,end:number,velocity:number}[]} notes seconds
 * @param {{name?:string}} opts
 * @returns {Uint8Array}
 */
export function writeMidi(notes, opts = {}) {
  const name = opts.name || 'Piano';
  // tempo track
  const t0 = [];
  varLen(0, t0); t0.push(0xff, 0x03, name.length, ...ascii(name));
  varLen(0, t0); t0.push(0xff, 0x58, 0x04, 4, 2, 24, 8);          // 4/4
  const mpq = Math.round(60000000 / BPM);
  varLen(0, t0); t0.push(0xff, 0x51, 0x03, (mpq >> 16) & 255, (mpq >> 8) & 255, mpq & 255);
  varLen(0, t0); t0.push(0xff, 0x2f, 0x00);

  // note events
  const ev = [];
  for (const n of notes) {
    const on = secToTick(n.start);
    let off = secToTick(n.end);
    if (off <= on) off = on + 1;
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity)));
    ev.push({ t: on, order: 1, bytes: [0x90, n.pitch & 127, vel] });
    ev.push({ t: off, order: 0, bytes: [0x80, n.pitch & 127, 0] });
  }
  ev.sort((a, b) => a.t - b.t || a.order - b.order);
  const t1 = [];
  varLen(0, t1); t1.push(0xff, 0x03, name.length, ...ascii(name));
  varLen(0, t1); t1.push(0xc0, 0x00); // program 0: acoustic grand piano
  let last = 0;
  for (const e of ev) { varLen(e.t - last, t1); t1.push(...e.bytes); last = e.t; }
  varLen(0, t1); t1.push(0xff, 0x2f, 0x00);

  return Uint8Array.from([
    ...ascii('MThd'), ...u32(6), ...u16(1), ...u16(2), ...u16(PPQ),
    ...trackChunk(t0), ...trackChunk(t1),
  ]);
}

/** Minimal reader for the files this module writes (and most simple SMFs). */
export function readMidi(bytes) {
  let p = 0;
  const rd32 = () => (bytes[p++] * 16777216) + (bytes[p++] << 16) + (bytes[p++] << 8) + bytes[p++];
  const rd16 = () => (bytes[p++] << 8) | bytes[p++];
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') throw new Error('not a MIDI file');
  p = 4; rd32(); rd16(); const nTracks = rd16(); const ppq = rd16();
  let tempo = 500000;
  const notes = [];
  for (let tr = 0; tr < nTracks; tr++) {
    p += 4; const len = rd32(); const end = p + len;
    let tick = 0, status = 0;
    const open = new Map();
    while (p < end) {
      let d = 0, b;
      do { b = bytes[p++]; d = (d << 7) | (b & 127); } while (b & 128);
      tick += d;
      let s = bytes[p];
      if (s & 128) { status = s; p++; } else s = status;
      if (s === 0xff) {
        const type = bytes[p++]; let l = 0; do { b = bytes[p++]; l = (l << 7) | (b & 127); } while (b & 128);
        if (type === 0x51) tempo = (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2];
        p += l;
      } else if ((s & 0xf0) === 0x90 || (s & 0xf0) === 0x80) {
        const key = bytes[p++], vel = bytes[p++];
        const sec = (tick * tempo) / (ppq * 1e6);
        if ((s & 0xf0) === 0x90 && vel > 0) open.set(key, { start: sec, velocity: vel });
        else if (open.has(key)) { const o = open.get(key); notes.push({ pitch: key, start: o.start, end: sec, velocity: o.velocity }); open.delete(key); }
      } else if ((s & 0xf0) === 0xc0 || (s & 0xf0) === 0xd0) p += 1;
      else p += 2;
    }
  }
  return notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
