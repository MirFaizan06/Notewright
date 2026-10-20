# Tools

Everything here is for developing and retraining Notewright. None of it ships in
the app, and none of it needs packages beyond Node and (for training) Python with numpy.

## Synthetic training data

| Script | Purpose |
| --- | --- |
| `testsynth.mjs` | The test piano: inharmonic strings with beating, per-key partial profiles, hammer noise, pedal, reverb, echo, noise, random tuning, and composers for many textures. A different "instrument" for every seed. |
| `render_piece.mjs <seed> <dir>` | Renders one piece and caches audio (`a<seed>.f32`) and ground truth (`a<seed>.json`). The slow step, done once. |
| `feat_piece.mjs <seed> <audioDir> <outDir>` | Turns a cached piece into training rows for the key classifier (`p*`) and the note-end classifier (`o*`). Fast. |
| `gen_stage2.mjs <seed> <audioDir> <outDir> <stage1.json>` | Runs the trained first stage and writes candidate rows (`q*`) for the second stage. Use pieces the first stage was not trained on. |
| `mkjobs.mjs <parallel> -- <cmd...>` | Runs a command once per stdin line, in parallel. |

```bash
# 1. render (parallel), then features
seq 1 200 | sed "s|\$| $AUDIO_DIR|" | node tools/mkjobs.mjs 8 -- node tools/render_piece.mjs
seq 1 200 | sed "s|\$| $AUDIO_DIR $FEAT_DIR|" | node tools/mkjobs.mjs 8 -- node tools/feat_piece.mjs

# 2. train (numpy only). Arguments: dir, output, epochs, hidden sizes, feature count, file prefix
python tools/train_nn.py $FEAT_DIR onset.json 14 192,96 112 p
POSW=1 python tools/train_nn.py $FEAT_DIR offset.json 25 64,32 29 o

# 3. second stage on held-back pieces
seq 201 320 | sed "s|\$| $AUDIO_DIR $S2_DIR onset.json|" | node tools/mkjobs.mjs 8 -- node tools/gen_stage2.mjs
POSW=1 python tools/train_nn.py $S2_DIR refine.json 40 64,32 30 q

# 4. embed into core/models.js
node scripts/embed-models.mjs onset.json offset.json refine.json
```

`experiment.sh <name> <periods> <pieces> <epochs> <hidden>` runs steps 1 and 2 for a
changed analysis setting and scores the result on held-out pieces, which is how
window lengths and feature sets were compared.

## Evaluation

`evalnet.mjs <dir> [--onset n.json] [--offset n.json] [--refine n.json] [--threshold p]`
converts held-out pieces and prints note-level precision, recall, F1 (50 ms onset
tolerance, same pitch), F1 with note ends, and median onset error.
`--prefix a --only 361,362` selects cached training-style pieces instead of the
`v*` validation set made by `mkval.mjs`.

## Looking at results

- `viewnotes.mjs <audio.f32> <t0> <t1> <out.png>` overlays detected notes (and
  optionally ground truth with `--gt`) on the spectrogram. Handy for real
  recordings, which have no ground truth.
- `decode-server.mjs <audio> <out.f32>` decodes any audio file through a browser
  (open `http://localhost:8765`) and saves 22.05 kHz mono PCM for the Node tools.
- `f32towav.mjs` writes a WAV from raw PCM, `check-bundle.mjs` syntax-checks the
  built single-file app.
