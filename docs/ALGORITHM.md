# How Notewright works

Notewright is a signal-processing front end plus three small neural networks.
All of it is plain JavaScript in `core/`, with no libraries. The networks'
weights ship as base64 inside `core/models.js`; the code that produced them is
in `tools/`.

```
audio ─► mono 22.05 kHz ─► tuning ─► two spectrograms (long and short windows)
                                          │
                                          ▼
              per frame, per key:  key classifier (stage 1)  ─► P(struck)
                                          │
                       local peaks over time, all plausible candidates
                                          │
                                          ▼
                 context re-scoring (stage 2): neighbours, octaves, repeats
                                          │
                                          ▼
                 note-end classifier  ─► lengths      loudness ─► velocity
                                          │
                                          ▼
                                    MIDI + preview
```

## 1. Spectrograms (`core/tfr.js`, `core/grid.js`)

A piano spans almost nine octaves, and no single window length suits all of
them: bass notes need long windows to be told apart, treble notes need short
ones to be timed well. Notewright analyses each octave with its own Hann window
and resamples the result onto one log-frequency grid, three bins per semitone,
hop 11.6 ms. Amplitudes are normalised so a unit sine reads about 1.0 in every
band.

Two such spectrograms are computed:

- a **long-window** one (24 periods of each octave's lowest note) that separates
  neighbouring semitones, and
- a **short-window** one (6 periods) that localises onsets in time, which
  matters for trills, tremolo and repeated notes.

Before that, `core/tuning.js` estimates how far the recording sits from
A4 = 440 Hz by folding spectral peaks onto a single semitone and averaging on
the circle. The grid is shifted accordingly, so a piano tuned to A = 432 or a
tape running slow is handled.

## 2. What a key looks like (`core/features.js`)

A piano string is slightly stiff, so its partials are stretched:
`f(h) = h · f0 · sqrt(1 + B·h²)`. Notewright uses a typical inharmonicity curve
to find where the first 16 partials of every key should be.

For every frame and every key the classifier is given, at those positions
(three bins wide, so small errors do not matter):

- **after**, **before** and **new** (`after − before`, clipped at zero)
  amplitudes from the long-window spectrogram,
- the same "after" and "new" amplitudes from the short-window one,
- the full 16-partial "new" profile of the keys an octave, a twelfth and two
  octaves *below*, whose partials coincide with this key's,
- the "new" level at the fundamentals of keys a few semitones away, a fifth and
  an octave above.

Amplitudes are log-compressed relative to the frame's maximum, so a quiet note
inside a loud chord is judged on the pattern of its own partials rather than on
how loud it is. A cheap gate skips keys whose partials show no new energy at
all, which removes most of the work.

The parent-key profiles are what lets the network separate *"C5 was struck"*
from *"C4's second partial rings"*: the even partials of a single C4 sit
smoothly between its odd ones, and a struck C5 makes them stick out.

## 3. Stage 1: key classifier (`core/mlp.js`)

A ReLU network (160 inputs, three hidden layers) outputs the probability that
this key was struck in this frame. Peaks over time give candidate onsets,
refined to sub-frame precision by parabolic interpolation. The threshold is
deliberately low here: stage 1 is meant to be generous.

A 32-unit pre-filter runs first and drops the key/frame pairs that are
obviously not notes (it keeps 99.5% of true ones), so the large network only
sees about a quarter of the pairs. That makes conversion about 2.5 times faster
with no measurable change in held-out accuracy.

## 4. Stage 2: context (`core/refine.js`)

Each candidate is re-scored by a small network that sees the stage-1 scores of
the same key over seven frames and of the keys an octave, a fifth, a twelfth, two
octaves and a few semitones either side. A duplicate one semitone from a
stronger note, an octave ghost, or a flicker beside a loud note looks different
once the neighbours' scores are visible. The *Sensitivity* slider moves the
decision threshold of this stage.

## 5. Training (`tools/`)

The networks are trained offline on synthetic pianos from
`tools/testsynth.mjs`: inharmonic strings with beating, per-key partial
profiles, hammer noise, sustain pedal, random reverb, echoes and noise, a random
global tuning offset, and many musical textures (runs, trills, tremolo, octaves,
wide chords, quiet inner voices). Every training piece is a different
instrument. Half of the stage-1 data additionally passes through a lossy-codec
simulation (`tools/augment.mjs`) so the networks do not rely on faint partials
that MP3 and AAC encoders remove.

Stage 2 is trained on pieces stage 1 never saw, so it learns from realistic
(not over-confident) first-stage scores.

## 6. Note length (`core/offsets.js`)

For each onset, a third small network answers "is this key still sounding?" at
a series of points after the strike. Its inputs compare the key's partial
amplitudes now with right after the strike, and with the last 150 ms. A damper
falling shows up as a sudden drop of all partials, which is different from a
slow natural decay or a reverb tail. The note ends where the answer flips,
found by bisection, minus a 35 ms correction for the analysis window's delay.

With the sustain pedal down, a note is followed for as long as it is audible,
which is what *As played* means.

## 7. Velocity

Velocity comes from the loudness of the key's lower partials just after the
strike, mapped with an exponent of 0.55 (hammer speed to amplitude is roughly a
1.7 power law) and anchored on the 95th percentile of the recording. It is a
relative measure within one recording, not an absolute one.

## 8. Output (`core/midi.js`)

A format-1 MIDI file at a fixed 120 BPM with 960 ticks per quarter note, so one
tick is about one millisecond and timing in seconds is preserved. Edit the tempo
map in your DAW afterwards if you want bars to line up.

## Playback (`core/synth.js`)

The MIDI preview is played with real piano recordings: 30 samples of a Yamaha
C5 (Salamander Grand Piano, CC BY 3.0), one every third key, shipped inside the
app (about 2 MB). Each note plays the nearest recording repitched by at most a
semitone and a half. Velocity sets both loudness and brightness (a low-pass
filter), and the damper falls more slowly in the bass. Rendering uses the
browser's own offline audio engine in 15-second passes (scheduling thousands of
notes at once makes that engine crawl), with a short warm-up so passes join
without a click. The result is peak-normalised.

If the recordings cannot be decoded, `core/synth.js` (a small additive piano
model) takes over, so there is always a preview.

## Measuring accuracy

`tools/evalnet.mjs` and `tools/sweep.mjs` score held-out synthetic pieces with
note-level precision, recall and F1 (a note counts when pitch matches and the
onset is within 50 ms), plus onset error in milliseconds, across the full range
of decision thresholds. `tools/errors.mjs` breaks the remaining mistakes down by
cause. Synthetic scores are useful for catching regressions and comparing
settings, but they are not a promise about any particular real recording.
