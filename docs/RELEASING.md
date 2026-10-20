# Releasing

Versions come from one place: `version` in `package.json`. The web build, the
Android `versionName` and `versionCode`, and the in-app update check all read it.

1. Update `CHANGELOG.md` (add a `## [x.y.z]` section).
2. Bump `version` in `package.json`.
3. Commit, then tag and push:
   ```
   git tag v1.2.0
   git push origin main v1.2.0
   ```
4. The **Release** workflow builds the web app and the Android APK, and creates
   a GitHub Release with both files attached and the changelog section as notes.

The in-app update check reads the latest GitHub Release. Set `repo` in
`web/js/config.js` to `owner/name` once the repository exists.

## Android signing

Without secrets the release APK is signed with the debug key, which installs but
cannot be updated by a differently signed build. For real releases, create a
keystore once and keep it safe:

```
keytool -genkeypair -v -keystore notewright-release.jks -alias notewright \
        -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 notewright-release.jks      # value for ANDROID_KEYSTORE_BASE64
```

Add these repository secrets: `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Losing the keystore means users can never receive an in-place update again.
Google Play needs a properly signed bundle too (`./gradlew bundleRelease`); with
Play App Signing this key becomes your *upload* key.

## Ads in releases

Tagged releases include ads when these repository **secrets** exist: `ADMOB_APP_ID`,
`ADMOB_REWARDED_UNIT`, `ADMOB_BANNER_UNIT`. Without them the APK is built with no
ad code. The website and the single-file web release are built with ads off until the
repository **variable** `WEB_ADS` is `true`. The full sequence is in
[docs/ADS.md](ADS.md).

## Local builds

```
npm run build                 # dist/web/index.html (single file, opens from disk)
cd android && ./gradlew assembleDebug
```

Android builds need JDK 17, the Android SDK (API 36) and Node 18 or newer on
`PATH` (Gradle runs the web build first).
