// usage: node tools/f32towav.mjs in.f32 out.wav [sampleRate]   (mono float32 -> 16-bit PCM WAV)
import fs from 'node:fs';
const [inp, out, sr = 22050] = [process.argv[2], process.argv[3], +(process.argv[4] || 22050)];
const buf = fs.readFileSync(inp);
const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const data = Buffer.alloc(x.length * 2);
for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(data.length, 40);
fs.writeFileSync(out, Buffer.concat([h, data]));
console.log('wrote', out, (x.length / sr).toFixed(1) + 's');
