// Ads behind one small interface, so a network can be swapped in by changing
// CONFIG.ads.provider and nothing else.
//
//   createRewardGate()  one rewarded ad per conversion: preload(), then show()
//   mountBanner()       a small banner on the home and result screens
//
// Rewarded means the user chooses to watch and receives something (the finished
// MIDI) once the ad is complete. That is what ad networks allow, and it is also
// the format that pays the most per view.

import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const ADS = () => CONFIG.ads;

export const adsEnabled = () => ADS().enabled && ADS().provider !== 'none';
export const usesGate = () => adsEnabled() && ADS().gate;

/** While an ad is up, nothing behind it can be reached (pointer, keyboard or screen reader). */
function lockUi(on) {
  const app = $('app');
  if (app) app.inert = on;
}

function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement('script');
    s.async = true; s.src = src;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

/* ------------------------------------------------------------------ */
/* house slot: a countdown overlay, used until a real network is set up */

function houseReward(seconds) {
  const root = $('ad'), body = $('ad-body'), fill = $('ad-bar-fill'), count = $('ad-count');
  body.innerHTML = '';
  const slot = document.createElement('div');
  slot.className = 'ad-house';
  slot.innerHTML = '<b>Your ad appears here</b><span>This slot is reserved for the ad network configured in <code>config.js</code>.</span>';
  body.appendChild(slot);
  root.hidden = false;
  lockUi(true);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const left = Math.max(0, seconds - (performance.now() - t0) / 1000);
      fill.style.width = `${100 * (1 - left / seconds)}%`;
      count.textContent = left > 0 ? `Reward in ${Math.ceil(left)}s` : 'Done';
      if (left > 0) setTimeout(tick, 120);
      else { root.hidden = true; lockUi(false); resolve('earned'); }
    };
    tick();
  });
}

/* ------------------------------------------------------------------ */
/* Google Publisher Tag rewarded ad (web)                              */

function gptGate() {
  let ready = null;      // event with makeRewardedVisible()
  let failed = false;
  let slot = null;
  const prepare = () => {
    window.googletag = window.googletag || { cmd: [] };
    loadScript('https://securepubads.g.doubleclick.net/tag/js/gpt.js').catch(() => { failed = true; });
    window.googletag.cmd.push(() => {
      const g = window.googletag;
      slot = g.defineOutOfPageSlot(ADS().gpt.adUnitPath, g.enums.OutOfPageFormat.REWARDED);
      if (!slot) { failed = true; return; }
      slot.addService(g.pubads());
      g.pubads().addEventListener('rewardedSlotReady', (e) => { ready = e; });
      g.enableServices();
      g.display(slot);
    });
  };
  return {
    preload() { if (!slot && !failed) prepare(); },
    show() {
      return new Promise((resolve) => {
        const g = window.googletag;
        const t0 = Date.now();
        const wait = () => {
          if (failed) { resolve('unavailable'); return; }
          if (!ready) {
            if (Date.now() - t0 > ADS().failOpenAfterSeconds * 1000) { resolve('unavailable'); return; }
            setTimeout(wait, 200); return;
          }
          let granted = false;
          const done = () => {
            g.pubads().removeEventListener('rewardedSlotClosed', done);
            try { g.destroySlots([slot]); } catch { /* already gone */ }
            lockUi(false); ready = null; slot = null;
            resolve(granted ? 'earned' : 'declined');
          };
          g.pubads().addEventListener('rewardedSlotGranted', () => { granted = true; });
          g.pubads().addEventListener('rewardedSlotClosed', done);
          lockUi(true);
          ready.makeRewardedVisible();
        };
        wait();
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* AdMob through the Android app                                       */

function nativeGate() {
  const bridge = window.NotewrightNative;
  let state = 'idle';   // idle | loading | ready | failed
  let waiting = null;
  const events = {
    ready: () => { state = 'ready'; },
    failed: () => { state = 'failed'; },
  };
  window.__nwAdEvent = (name) => { if (waiting && waiting[name]) waiting[name](); else if (events[name]) events[name](); };
  return {
    preload() { if (state === 'idle' || state === 'failed') { state = 'loading'; bridge.preloadReward(); } },
    show() {
      return new Promise((resolve) => {
        const t0 = Date.now();
        const go = () => {
          if (state === 'failed') { resolve('unavailable'); return; }
          if (state !== 'ready') {
            if (Date.now() - t0 > ADS().failOpenAfterSeconds * 1000) { resolve('unavailable'); return; }
            setTimeout(go, 200); return;
          }
          let earned = false;
          waiting = {
            earned: () => { earned = true; },
            closed: () => { waiting = null; state = 'idle'; resolve(earned ? 'earned' : 'declined'); },
            failed: () => { waiting = null; state = 'idle'; resolve('unavailable'); },
          };
          bridge.showReward();
        };
        go();
      });
    },
  };
}

/**
 * One rewarded ad per conversion.
 * show() resolves 'earned' (unlock), 'declined' (closed early) or 'unavailable' (no ad could be
 * shown; the app lets the user through so a missing ad never blocks anyone).
 */
export function createRewardGate() {
  const p = ADS().provider;
  const nativeOk = () => window.NotewrightNative && window.NotewrightNative.showReward && window.NotewrightNative.hasNativeAds && window.NotewrightNative.hasNativeAds();
  if (p === 'native' && nativeOk()) return nativeGate();
  if (p === 'gpt') return gptGate();
  return { preload() {}, show: () => houseReward(ADS().placeholderSeconds) };
}

/* ------------------------------------------------------------------ */
/* banner                                                              */

let bannerMounted = false;

/** Shows the banner slot on the web, or asks the Android app to show its own. */
export function mountBanner() {
  const cfg = ADS();
  const el = $('ad-banner');
  if (!cfg.enabled || !cfg.banner.enabled || !el) return;   // the banner does not depend on the rewarded provider
  const native = window.NotewrightNative;
  if (native && native.setBannerVisible && native.hasNativeAds && native.hasNativeAds()) { native.setBannerVisible(true); return; }
  if (bannerMounted) { el.hidden = false; return; }
  bannerMounted = true;
  el.hidden = false;
  const ok = cfg.banner.adsenseClient && !cfg.banner.adsenseClient.endsWith('0000000000000000');
  if (ok) {
    el.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${cfg.banner.adsenseClient}" data-ad-slot="${cfg.banner.adsenseSlot}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>`;
    loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.banner.adsenseClient)}`, { crossorigin: 'anonymous' })
      .then(() => { (window.adsbygoogle = window.adsbygoogle || []).push({}); })
      .catch(() => { el.hidden = true; });
  } else {
    el.innerHTML = '<div class="ad-banner-house">Banner ad space</div>';
  }
}
