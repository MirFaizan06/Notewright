# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

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
