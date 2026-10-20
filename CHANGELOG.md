# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [1.0.1] - 2026-10-21

### Fixed
- Android: the app closed when using Back or the back gesture on Android 16 (the system no longer calls the old Back handler).
- Android: the app was killed outright if the built-in browser engine ran out of memory; it now restarts the screen instead.
- Android: content was drawn under the status and navigation bars on Android 15 and newer.
- Android: an advertising SDK problem can no longer stop the app.
- Lower memory use when preparing the piano preview: the piano recordings are decoded one at a time, as mono, only when a preview is needed.

### Added
- If the app stops, the next launch shows what happened with a Copy button, so it can be reported.

## [1.0.0] - 2026-10-20

### Added
- Piano audio to MIDI conversion that runs entirely on the device.
- Input from MP3, WAV, M4A, FLAC and OGG (anything the platform can decode).
- Tuning detection, note onsets, note lengths and velocities.
- Piano-roll viewer with playback of the MIDI, the original recording, or both,
  using a sampled grand piano (Salamander Grand Piano, CC BY 3.0) packed into the app.
- Web app (single file) and Android app built from the same code.
- One rewarded ad per conversion unlocks the finished MIDI, plus a banner and a consent form. Ad networks plug in behind a provider interface (AdMob on Android, Google Ad Manager and AdSense on the web).
- In-app update check against GitHub Releases.
