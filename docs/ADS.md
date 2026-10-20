# Ads: the complete setup

This is the single source of truth for turning on ads and earning from them.
Follow it top to bottom. Everything in the code is already built; what is left is
accounts, IDs, a few dashboard settings and testing.

## Where things stand (2026-10-21)

Done:

- Your AdMob app ID and the rewarded and banner unit IDs are in `android/ads.properties`
  (local, git-ignored) and in the GitHub repository secrets that tagged releases use.
- `web/public/app-ads.txt` has your publisher line.
- The repository is `MirFaizan06/Notewright`; releases are signed with your own key.
- The privacy page is written and deploys to GitHub Pages at
  `https://mirfaizan06.github.io/Notewright/privacy.html`.

Left for you, in this order:

1. **Phase B4:** create and publish the GDPR message in AdMob (it asks for the privacy
   URL above).
2. **Phase B3, steps 2 to 4:** register your phone as a test device before you run the
   release build with the real IDs.
3. **Phase D** when you publish on Google Play (a one-time registration fee applies);
   until then the APK on GitHub Releases works for anyone who installs it.
4. **Phase E:** check AdMob's reports after real users have converted files.

The website stays ad-free: AdSense effectively needs a domain you own, so only the
Android app earns. Nothing in this guide requires buying a domain.

**Your progress meter** (run it any time):

```
npm run check:ads
```

It lists every value that is still a placeholder. When it says
*Everything is configured*, the code side is done.

Menu names and numbers in Google's dashboards change. Where this guide names a
menu path or a threshold, treat it as a pointer and trust what the dashboard shows.

---

## 1. What the app does

| Where | What the user sees | Network |
| --- | --- | --- |
| Every conversion | **Rewarded ad.** The finished MIDI unlocks after the user watches one ad to the end. They can start it while the analysis is still running. | AdMob (Android); Google Ad Manager (web, optional) |
| Home and result screens | **Small banner** | AdMob (Android); AdSense (web) |
| First launch in the EU, UK and similar regions | **Consent form** | Google's User Messaging Platform (Android); Funding Choices (web) |

Behaviour you can rely on:

- The ad is **preloaded** when a file is chosen, so it starts instantly.
- If no ad can be loaded (no fill, offline, blocked), the user is **let through
  after 8 seconds**. A missing ad never breaks the app.
- Rewarded ads only run after the user taps *Watch ad to unlock*.
- Ads are requested only after consent where consent is required.
- **Builds are ad-free unless you opt in.** An Android build without
  `-Pads=admob` contains no ad code and shows no ads and no placeholders. The
  public website shows no ads until you set the repository variable `WEB_ADS`
  (phase C). Placeholders ("Your ad appears here", "Banner ad space") appear only
  when you run the app locally with `npm start`, so you can see the flow.

Why rewarded and not a forced interstitial: both AdMob and AdSense forbid ads
that trap the user or hide the close control, and they disable accounts that do
it. A rewarded ad is opt-in, so it is allowed, usually pays several times more
per view than a banner, and the user must watch to the end to get the MIDI. It
does the job of an "unskippable ad" without risking the account.

## 2. The plan in one table

| Phase | What | Where | Time |
| --- | --- | --- | --- |
| A | Accounts, privacy policy, domain | Google, GitHub, domain registrar | Start now; approvals take days |
| B | Android: test ads, your IDs, consent message | AdMob, `android/ads.properties` | An afternoon |
| C | Website: AdSense banner, optional rewarded ad | AdSense, `web/js/config.js`, GitHub | Days (approval) |
| D | Play Store declarations | Play Console | An hour |
| E | Go live and verify | Phone, dashboards | A day |
| F | Earn more | AdMob, Play | Ongoing |

**Recommended order:** A, then B (Android is the main earner), then D and E. Do C
(web) in parallel while you wait for approvals. The web rewarded ad is the
fiddliest part and is optional; see C3.

---

## Phase A: accounts and legal (do first)

- [ ] **A1. A Google account for the business side.** Use one account for AdMob,
  AdSense, Ad Manager and Play Console so everything is in one place.
- [x] **A2. Domain: not needed, but pick the "developer website".** `app-ads.txt` must
  be served at the **root** of the developer website you give Google (Play listing and
  AdMob). A GitHub Pages *project* site (`mirfaizan06.github.io/Notewright/`) is not a
  root, so use one of these free options:
  - **Netlify:** `https://<name>.netlify.app` serves the web build from its root, and
    `netlify.toml` is already in the repo. Connect the repo in Netlify, no settings
    needed. This also hosts `privacy.html` at `https://<name>.netlify.app/privacy.html`.
  - **GitHub user site:** a repository named `MirFaizan06.github.io` containing
    `app-ads.txt` (and a page linking to the app). Tell me and I will create it.

  Either is fine; Netlify keeps everything in one place. This matters only once the
  app is on a store listing, because that is what AdMob checks.
- [x] **A3. Privacy policy.** Written in `web/privacy.html`. It deploys with the site:
  `https://mirfaizan06.github.io/Notewright/privacy.html` on GitHub Pages, or
  `https://<name>.netlify.app/privacy.html` on Netlify. The contact is the GitHub
  issues page, so no personal email is public; change it in that file if you prefer.
  Google requires a privacy policy URL for AdMob and Play. Read it once and make sure
  it matches what you actually enable.
- [x] **A4. GitHub repository and Pages.** `MirFaizan06/Notewright`, Pages source:
  GitHub Actions (the `Deploy web app` workflow).
- [x] **A5. `repo` in `web/js/config.js`** is `MirFaizan06/Notewright`, so the in-app
  update check works.

## Phase B: Android with AdMob

### B1. Create the AdMob app and ad units

1. Sign up at admob.google.com. Complete the profile, payments profile and tax
   information early; payouts are blocked until they are done.
2. **Apps > Add app > Android.** Choose *No* for "is the app listed on a supported
   app store" if it is not on Play yet. You can link the store listing later and
   the **App ID stays the same**.
3. Note the **App ID**. It looks like `ca-app-pub-1234567890123456~1234567890`
   (a tilde).
4. In the app, **Ad units > Add ad unit > Rewarded.**
   - Name it `notewright_rewarded`.
   - Reward: amount `1`, item `unlock`. (The app does not use the value, but AdMob
     requires one.) Leave server-side verification off.
   - Note the **Ad unit ID**: `ca-app-pub-1234567890123456/1234567890` (a slash).
5. **Add ad unit > Banner.** Name it `notewright_banner`. Note its ID.

### B2. Test with Google's test ads first

With no `android/ads.properties` file, the AdMob build uses Google's public **test
IDs**: real ad formats, but test creatives that earn nothing. Do this before
anything else.

```
cd android
./gradlew assembleDebug -Pads=admob
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

1. Open the app. A **banner labelled "Test Ad"** should appear at the bottom.
2. Convert a file. The progress screen shows **Watch ad to unlock**. Tap it, watch
   the test video to the end, and the result opens.
3. Close the ad early on purpose: the button should change to "Watch the full ad
   to unlock" and the result must stay locked.
4. Turn off the network and convert: after about 8 seconds the app unlocks and
   says no ad is available.

### B3. Put your IDs in

```
Copy-Item android\ads.properties.example android\ads.properties
```

Edit `android/ads.properties` (git-ignored, never commit it):

```
admobAppId=ca-app-pub-1234567890123456~1234567890
admobRewardedUnit=ca-app-pub-1234567890123456/1111111111
admobBannerUnit=ca-app-pub-1234567890123456/2222222222
```

**Register your phone as a test device before you run it with real IDs.** Clicking
your own live ads can get the account suspended for invalid traffic.

1. Build and install once, but **do not tap any ad**.
2. Run `adb logcat | findstr /i "test device"`, start the app, and copy the hashed
   ID from the line "Use RequestConfiguration.Builder().setTestDeviceIds(...)".
3. Add it to `android/ads.properties`:
   ```
   admobTestDevices=PASTE_THE_HASHED_ID_HERE
   ```
4. Rebuild. That phone now always gets test ads, even with real IDs, so you can
   test safely. Keep it registered; it costs you nothing.

Then run `npm run check:ads`; the Android rows should turn to `ok`.

The Android build with `-Pads=admob` switches the web layer to AdMob by itself, so
there is nothing to change in `config.js` for Android.

### B4. The consent message (required for EU/UK; do it even if you are elsewhere)

1. AdMob **Privacy & messaging > GDPR > Create message.** Select your app, choose
   the standard consent options, add your privacy policy URL, and **publish** the
   message. An unpublished message means users in the EEA and UK can get no ads.
2. Optional: create the **US states regulations** message the same way.
3. To preview the form on your test device, add to `android/ads.properties`:
   ```
   admobConsentDebug=true
   ```
   (it needs `admobTestDevices` too). The app then behaves as if the device were in
   the EEA. Turn it off afterwards.
4. In the app, **About > Ad privacy choices** appears automatically for users who
   must be able to change their answer.

### B5. Build the release

```
cd android
./gradlew assembleRelease -Pads=admob      # APK for sideloading and GitHub releases
./gradlew bundleRelease  -Pads=admob       # AAB for Google Play
```

Play will not accept a debug-signed bundle. Create your upload keystore first
(see `docs/RELEASING.md`, "Android signing") and keep it safe.

## Phase C: the website

The website earns only if people visit it.

### C1. Host it

GitHub Pages with your domain. The `Deploy web app` workflow publishes
`dist/web/`, which includes `privacy.html`, `ads.txt` and `app-ads.txt` at the
site root.

**The public site starts with no ads.** The workflow builds with ads switched off
unless the repository variable `WEB_ADS` is `true` (GitHub: *Settings > Secrets and
variables > Actions > Variables*). That keeps placeholders off the live site until
you are ready. You flip it in step C2.6.

### C2. AdSense banner (do this)

1. Sign up at adsense.google.com with the domain and verify ownership.
2. Approval is by review. Sites that are a single tool with little text are often
   rejected as "low value content". Help your case: keep the explanatory text on
   the home screen, link the privacy page, and consider adding a short
   "How it works" and "FAQ" page before applying.
3. When approved: **Ads > By ad unit > Display ads**, create a unit named
   `notewright_banner`, responsive. Note the publisher ID (`ca-pub-...`) and the
   slot ID (10 digits).
4. Edit `web/js/config.js`:
   ```js
   banner: { enabled: true, adsenseClient: 'ca-pub-1234567890123456', adsenseSlot: '1234567890' },
   ```
5. Edit `web/public/ads.txt`: replace the zeros with your publisher number
   (AdSense shows the exact line under *Sites > ads.txt*).
6. In AdSense **Privacy & messaging**, create and publish the GDPR message
   (Funding Choices). It is injected automatically; no code change.
7. Set the repository variable `WEB_ADS` to `true` and redeploy. Now the site shows
   the banner (and the rewarded ad if you did C3).

### C3. Web rewarded ad (optional, do later)

Web rewarded ads come from **Google Ad Manager**, not AdSense, and need real setup.
Google's documented requirements:

1. A **Rewarded** ad unit and matching line items (for Ad Exchange demand:
   *Display (Standard)* type, size *1x1 (Custom)*).
2. The protection **"Block non-instream video ads" turned off** for that unit.
3. A mobile-friendly page (the viewport tag is already in `index.html`).
4. User consent before showing it (Funding Choices, from C2.6).

Then in `web/js/config.js`:

```js
provider: 'gpt',
gpt: { adUnitPath: '/12345678/notewright_rewarded' },
```

If the unit is wrong or has no demand, the app simply unlocks the user after 8
seconds, so nothing breaks. It also unlocks if GPT reports that the page cannot
show rewarded ads.

If you skip C3, set `provider: 'none'` in `config.js`. The website then runs the
banner only; Android keeps its rewarded ad automatically (the AdMob build selects
its own provider).

## Phase D: Google Play declarations

In Play Console, for the app:

- [ ] **Store listing:** privacy policy URL (`https://<your-domain>/privacy.html`)
  and your website (the domain that hosts `app-ads.txt`).
- [ ] **App content > Ads:** *Yes, my app contains ads.*
- [ ] **App content > Advertising ID:** *Yes*, used for advertising. (The SDK adds
  the `AD_ID` permission; this was checked in the built manifest.)
- [ ] **App content > Data safety:** follow Google's "Data safety guidance for
  AdMob". In short, declare that ad SDKs collect device or other IDs (the
  advertising ID) and approximate location and IP for advertising, and that the
  data is shared with Google. Your own code collects nothing else.
- [ ] **Target audience:** adults and teens, not children. (Targeting children
  changes the ad rules.)
- [ ] After the first upload, in AdMob **Apps > your app > App settings > Link to
  store**, link the listing. Then **Apps > app-ads.txt**: AdMob shows the line to
  use and the crawl status.

## Phase E: go live and verify

- [ ] Real IDs in `android/ads.properties`. Your own phone stays registered in
  `admobTestDevices`. You do not need to see real ads on your own phone: AdMob's
  reports are the proof.
- [ ] `web/public/app-ads.txt` has your AdMob publisher number (the 16 digits in
  your App ID, after `ca-app-pub-`) and is reachable at
  `https://<your-domain>/app-ads.txt`.
- [ ] `npm run check:ads` reports no TODO rows.
- [ ] **Wait.** New ad units can take up to a few hours to start filling, and new
  apps may need AdMob review. "No fill" in the first day is normal.
- [ ] AdMob **Reports** show requests, then impressions. Rewarded impressions
  should appear after real users convert files. Check again after 24 hours.
- [ ] Payments: AdMob mails a PIN once your earnings pass a small threshold and
  pays out when the balance reaches the payment threshold (check the amounts in
  *Payments*). Enter the PIN promptly.

## Phase F: earning more

1. **Publish on Google Play.** Most Android revenue comes from there.
2. **Mediation.** In AdMob, **Mediation > Create mediation group** and add networks
   (AppLovin, Meta, Unity Ads, ironSource, Mintegral). More bidders per request raise
   revenue per view. It is dashboard configuration plus network adapters; the app
   code stays as it is, but adapters are extra SDKs and need adding to
   `android/app/build.gradle`.
3. **Search traffic for the website.** Give it a clear title, keep the explanatory
   text, and make the privacy and how-it-works pages easy to find. People search for
   "mp3 to midi" and "piano to midi".
4. **Check eCPM by country** in AdMob reports before changing anything.
5. **Do not add** app-open ads, ads on every tap, ads that look like buttons or
   fake close controls. They raise impressions briefly and get accounts disabled.

---

## 3. Settings reference

`web/js/config.js`

| Key | Meaning |
| --- | --- |
| `ads.enabled` | Master switch for the web layer. `false` removes every ad. |
| `ads.provider` | `placeholder` (labelled stand-in, local demo), `gpt` (Ad Manager rewarded), `native` (AdMob; set automatically in `-Pads=admob` builds), `none` (no rewarded ad). |
| `ads.gate` | `true`: the MIDI unlocks after a rewarded ad. `false`: no gate. |
| `ads.failOpenAfterSeconds` | How long to wait for a missing ad before letting the user through. |
| `ads.banner.*` | `enabled`, AdSense `adsenseClient` and `adsenseSlot` (web). |
| `repo` | `owner/name` for the update check. |

`android/ads.properties` (git-ignored)

| Key | Meaning |
| --- | --- |
| `admobAppId`, `admobRewardedUnit`, `admobBannerUnit` | Your AdMob IDs. Missing keys fall back to Google's test IDs. |
| `admobTestDevices` | Comma-separated hashed device IDs that always get test ads. |
| `admobConsentDebug` | `true` to preview the EEA consent form on test devices. |

Build behaviour

| Build | Ads |
| --- | --- |
| `./gradlew assembleRelease` | None. No ad code, no placeholders. |
| `./gradlew assembleRelease -Pads=admob` | AdMob rewarded ad, banner and consent form. |
| `npm start` (local) | Placeholders, so you can see the flow. |
| Website deploy (GitHub Pages) | None until the repository variable `WEB_ADS` is `true`. |
| `npm run build` (local) | Uses `config.js` as is (placeholders by default). |

Build-time overrides (environment variables read by `scripts/build-web.mjs`):
`NW_ADS_ENABLED`, `NW_AD_PROVIDER`, `NW_AD_GATE`, `NW_AD_BANNER`. For example, in
PowerShell: `$env:NW_AD_PROVIDER = 'gpt'; npm run build`.

GitHub release secrets (optional; with them tagged releases include ads)

`ADMOB_APP_ID`, `ADMOB_REWARDED_UNIT`, `ADMOB_BANNER_UNIT`.

## 4. Files

```
web/js/config.js            provider, gate, banner, web IDs
web/js/ads.js               reward gate (house slot, Google Publisher Tag, AdMob bridge) and banner
web/privacy.html            privacy policy page (fill in the two {{...}} values)
web/public/ads.txt          web publisher line, served at the site root
web/public/app-ads.txt      Android publisher line, served at the site root
android/ads.properties      your AdMob IDs (git-ignored; see ads.properties.example)
android/app/src/admob/      AdMob, banner and consent code (built only with -Pads=admob)
scripts/check-ads.mjs       the progress meter
```

## 5. Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| App crashes on start in the AdMob build | `admobAppId` is malformed. It must contain a `~`. Unit IDs contain `/`. |
| Banner area empty, log shows error code 3 | No fill. Normal for new units and small countries. Test IDs always fill. |
| Error code 1 | Invalid request: wrong ad unit ID format or an ID from the wrong app. |
| Error code 2 | Network problem on the device. |
| Rewarded button works but never shows an ad | Not initialised: consent may be required and not yet given, or the message is unpublished (B4). Look at `adb logcat` for "Ads". |
| Users in the EU see no ads | The GDPR message is not published (B4). |
| Real ads on your own phone | Add it to `admobTestDevices` (B3). |
| Local build shows "Banner ad space" or a countdown ad | Expected locally. The deployed site is ad-free until `WEB_ADS=true`. |
| AdSense rejects the site | Add real text content and the privacy page; use a custom domain; reapply. |
| `check:ads` says `app-ads.txt` TODO | Edit `web/public/app-ads.txt`, redeploy the site, then check AdMob's app-ads.txt status. |

Handy logs: `adb logcat | findstr /i "Ads"`.

## 6. Rules that protect the account

- Never click your own live ads, and never ask others to.
- Never place ads where they cause accidental taps; the banner sits in its own
  strip below the content.
- Rewarded ads must be the user's choice and must give the real reward.
- Do not tell users to "support us by clicking".
- Keep the privacy policy accurate if you add anything that collects data.

## 7. Sources worth bookmarking

AdMob help (policies, Data safety guidance), the AdMob SDK docs for Android
(rewarded ads, adaptive banners, User Messaging Platform), Google Ad Manager help
"Rewarded ads for web", and the Google Publisher Tag reference.

## 8. When you have done it

Send me, when you are ready to build the release: the three AdMob IDs (they are
not secret inside the app, but keep them out of git), the AdSense publisher and
slot IDs if you have them, and the repository name. I will put them in the right
places, run `npm run check:ads` until it is clean, build, create the GitHub
repository, tag `v1.0.0`, and publish the release with the updater on.
