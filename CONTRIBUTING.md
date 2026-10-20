# Contributing

Thanks for helping. A few things that keep the project easy to work on:

- **No runtime dependencies.** The engine and UI use only the platform. Please do
  not add packages to the app. Tooling that only runs on a developer machine
  (training, evaluation) may use Python with numpy.
- **Plain modules.** Source files are standard ES modules that run unchanged in
  Node, a browser and a Web Worker. `scripts/build-web.mjs` bundles them.
- **Tests.** `npm test` must pass. Add a test next to the code you change when
  behaviour is observable from Node.
- **Accuracy changes need numbers.** If you change anything in `core/` that
  affects recognition, include the output of `node tools/evalnet.mjs` before and
  after on the same held-out pieces. The analysis constants in `core/grid.js`
  are baked into the trained networks, so changing them means retraining.
- **Style.** Short functions, comments that explain why, no dead code.

## Reporting accuracy problems

Use the *Transcription problem* issue template. A clip under 30 seconds, the
time range, and the notes involved make a problem reproducible.

## Releases

Maintainers: see [docs/RELEASING.md](docs/RELEASING.md).
