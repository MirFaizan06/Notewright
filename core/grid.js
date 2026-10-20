// Shared constants and the log-frequency grid used by every stage.

export const SR = 22050;          // internal sample rate
export const HOP = 256;           // analysis hop (samples) -> ~11.6 ms
export const FPS = SR / HOP;

export const SEMI = 3;            // grid bins per semitone
export const MIDI_LO = 20;        // grid starts one semitone below A0
export const MIDI_HI = 124;       // ... and ends near 10.5 kHz
export const NB = (MIDI_HI - MIDI_LO) * SEMI + 1;

export const PIANO_LO = 21;       // A0
export const PIANO_HI = 108;      // C8
export const NN = PIANO_HI - PIANO_LO + 1; // 88 notes

/** Frequency (Hz) of grid bin b for a given A4 reference. */
export function binFreq(b, a4 = 440) {
  return a4 * Math.pow(2, (MIDI_LO + b / SEMI - 69) / 12);
}

/** Frequency of a (fractional) MIDI pitch. */
export function midiFreq(m, a4 = 440) {
  return a4 * Math.pow(2, (m - 69) / 12);
}

// Analysis window per octave, in periods of the octave's lowest note. The trained
// networks depend on this value; change it only together with a retrain.
export const WINDOW_PERIODS = (typeof process !== 'undefined' && process.env && process.env.NW_PERIODS) ? +process.env.NW_PERIODS : 24; // NW_PERIODS: development experiments only

/** Window length used for the octave band that contains grid bin b. */
export const SHORT_PERIODS = 6;

export function windowForBin(b, periods = WINDOW_PERIODS) {
  const octave = Math.floor(b / (SEMI * 12));
  const fLo = 440 * Math.pow(2, (MIDI_LO + octave * 12 - 69) / 12);
  let n = 512;
  while (n < periods * SR / fLo && n < 16384) n <<= 1;
  return n;
}

/** Hann main-lobe magnitude response, delta in FFT bins of the analysis window. */
export function hannLobe(delta) {
  const d = Math.abs(delta);
  if (d > 3) return 0;
  if (d < 1e-6) return 1;
  if (Math.abs(d - 1) < 1e-6) return 0.5;
  return (Math.sin(Math.PI * d) / (Math.PI * d)) / (1 - d * d);
}

/** Rough inharmonicity coefficient for a piano string at a MIDI pitch. */
export function inharmonicityB(midi, scale = 1) {
  const lg = midi >= 45 ? -4 + 0.0255 * (midi - 45) : -4 + 0.012 * (45 - midi);
  return Math.pow(10, lg) * scale;
}
