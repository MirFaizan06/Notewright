// Update check against the latest GitHub Release. Quiet if no repo is configured.

import { CONFIG } from './config.js';

function parse(v) { return String(v).replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0); }
export function isNewer(remote, local) {
  const a = parse(remote), b = parse(local);
  for (let i = 0; i < 3; i++) { if (a[i] > b[i]) return true; if (a[i] < b[i]) return false; }
  return false;
}

/** @returns {Promise<{state:'unconfigured'|'current'|'available'|'error', version?:string, url?:string}>} */
export async function checkForUpdate() {
  if (!CONFIG.repo) return { state: 'unconfigured' };
  try {
    const r = await fetch(`https://api.github.com/repos/${CONFIG.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) return { state: 'current' };
    if (!r.ok) return { state: 'error' };
    const j = await r.json();
    if (isNewer(j.tag_name, CONFIG.version)) return { state: 'available', version: String(j.tag_name).replace(/^v/i, ''), url: j.html_url };
    return { state: 'current' };
  } catch {
    return { state: 'error' };
  }
}
