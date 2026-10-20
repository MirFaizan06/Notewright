// App-wide settings. This is the one place to edit before releasing.

export const CONFIG = {
  name: 'Notewright',
  version: '1.0.0',

  // 'owner/repository' on GitHub. Used by the in-app update check, which reads
  // the latest Release. Leave empty until the repository exists.
  repo: 'MirFaizan06/Notewright',

  // Monetisation. See docs/ADS.md for the full setup, including the Android IDs
  // (those live in android/ads.properties, not here).
  //
  //   provider   'placeholder'  labelled house slot with a countdown (default until accounts exist)
  //              'gpt'          Google Publisher Tag rewarded ad (Google Ad Manager, web)
  //              'native'       AdMob through the Android app (falls back to the house slot in a browser)
  //              'none'         no rewarded ad (the banner can still run)
  //   gate       true: the finished MIDI unlocks after the user watches one rewarded ad.
  //              This is the "one ad per conversion" and it pays best.
  //   banner     a small banner on the home and result screens (AdSense on the web, AdMob on Android)
  ads: {
    enabled: true,                 // master switch: false removes every ad
    provider: 'placeholder',
    gate: true,
    placeholderSeconds: 6,
    // If no ad can be loaded (no fill, offline, blocked), let the user through
    // after this long rather than blocking the conversion.
    failOpenAfterSeconds: 8,
    gpt: {
      adUnitPath: '/0000000/notewright_rewarded',   // your Ad Manager rewarded ad unit
    },
    banner: {
      enabled: true,
      adsenseClient: 'ca-pub-0000000000000000',     // AdSense publisher id (web)
      adsenseSlot: '0000000000',                    // AdSense display ad unit id (web)
    },
  },
};

// Build-time overrides (see scripts/build-web.mjs). The Android build without an ad SDK turns ads
// off, the AdMob build selects the native provider, and the website can be switched on later
// with the repository variable WEB_ADS.
if (typeof window !== 'undefined' && window.__NW_ADS_OVERRIDE) {
  const o = window.__NW_ADS_OVERRIDE;
  for (const k of ['enabled', 'provider', 'gate']) if (k in o) CONFIG.ads[k] = o[k];
  if ('banner' in o) CONFIG.ads.banner.enabled = o.banner;
}
