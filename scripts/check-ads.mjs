// Reports what is still missing before ads can earn. Never fails the build unless --strict.
//   node scripts/check-ads.mjs            (or: npm run check:ads)
// Items marked "optional" belong to website ads, which need a real domain and are off by default.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { CONFIG } = await import(pathToFileURL(path.join(root, 'web', 'js', 'config.js')).href);
const read = (p) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), 'utf8') : null);
const placeholder = (v) => !v || /0{10,}/.test(String(v));
const A = CONFIG.ads;
const rows = [];
const check = (area, label, ok, fix, optional = false) => rows.push({ area, label, ok, fix, optional });

// ---- both
check('both', 'privacy page filled in', !!read('web/privacy.html') && !/\{\{[A-Z]+\}\}/.test(read('web/privacy.html')), 'replace {{DATE}} and {{EMAIL}} in web/privacy.html');
check('both', 'GitHub repository set (updates, hosting)', !!CONFIG.repo, "set repo: 'owner/name' in web/js/config.js");

// ---- android
const props = read('android/ads.properties');
const get = (k) => { const m = props && props.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm')); return m ? m[1].trim() : ''; };
check('android', 'android/ads.properties exists', !!props, 'copy android/ads.properties.example to android/ads.properties');
for (const [k, what] of [['admobAppId', 'AdMob app id'], ['admobRewardedUnit', 'rewarded ad unit id'], ['admobBannerUnit', 'banner ad unit id']]) {
  const v = get(k);
  check('android', what, !!v && !placeholder(v) && !v.startsWith('ca-app-pub-3940256099942544'), `set ${k} in android/ads.properties`);
}
const appAds = read('web/public/app-ads.txt');
check('android', 'app-ads.txt has your publisher id', !!appAds && !/pub-0{16}/.test(appAds), 'edit web/public/app-ads.txt');

// ---- website (optional)
check('website', 'AdSense publisher id', !placeholder(A.banner.adsenseClient), 'set ads.banner.adsenseClient', true);
check('website', 'AdSense banner slot id', !placeholder(A.banner.adsenseSlot), 'set ads.banner.adsenseSlot', true);
check('website', 'Ad Manager rewarded ad unit path', A.provider === 'gpt' && !placeholder(A.gpt.adUnitPath), "set provider: 'gpt' and ads.gpt.adUnitPath", true);

const w = Math.max(...rows.map((r) => r.label.length));
let missing = 0;
console.log('');
for (const r of rows) {
  const mark = r.ok ? '  ok      ' : r.optional ? '  optional' : '  TODO    ';
  if (!r.ok && !r.optional) missing++;
  console.log(`${mark} [${r.area.padEnd(7)}] ${r.label.padEnd(w)}${r.ok ? '' : `   -> ${r.fix}`}`);
}
console.log(`\n${missing ? `${missing} required item(s) left before ads earn. See docs/ADS.md.` : 'Everything required is configured.'}`);
if (process.argv.includes('--strict') && missing) process.exit(1);
