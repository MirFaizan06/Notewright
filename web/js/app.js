import { CONFIG } from './config.js';
import { createRewardGate, usesGate, mountBanner } from './ads.js';
import { PianoRoll } from './roll.js';
import { Player } from './player.js';
import { checkForUpdate } from './update.js';
import { renderPlayback } from './sampler.js';

const $ = (id) => document.getElementById(id);
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (p) => `${NOTE[p % 12]}${Math.floor(p / 12) - 1}`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const SR = 22050;
const MAX_MINUTES = 25;

const state = {
  file: null, samples: null, duration: 0,
  options: { sensitivity: 0.5, length: 'natural', tuning: 'auto' },
  result: null, worker: null, running: false,
};
let roll = null;
let player = null;

/* ---------- helpers ---------- */
function show(view) {
  for (const id of ['view-home', 'view-work', 'view-result']) $(id).hidden = id !== `view-${view}`;
  window.scrollTo({ top: 0 });
}

function toast(msg, error = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast${error ? ' error' : ''}`;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, error ? 6500 : 3200);
}

function seg(el, onChange) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    for (const x of el.querySelectorAll('button')) x.setAttribute('aria-checked', String(x === b));
    onChange(b.dataset.v);
  });
}

function fillRange(r) {
  r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
}

function baseName(n) { return n.replace(/\.[^.]+$/, ''); }

/* ---------- decoding ---------- */
async function decodeFile(file) {
  const buf = await file.arrayBuffer();
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(1, 1, SR);
  const audio = await ctx.decodeAudioData(buf);
  const n = audio.length;
  const ch = audio.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
  }
  return mono;
}

async function pickFile(file) {
  if (!file) return;
  state.file = file;
  state.samples = null;
  $('drop').hidden = true;
  $('picked').hidden = false;
  $('picked-name').textContent = file.name;
  $('picked-info').textContent = 'Reading the recording…';
  $('convert').disabled = true;
  try {
    const samples = await decodeFile(file);
    if (state.file !== file) return;
    if (samples.length / SR > MAX_MINUTES * 60) {
      state.file = null;
      $('picked-info').textContent = `Too long (${mmss(samples.length / SR)}).`;
      toast(`Recordings over ${MAX_MINUTES} minutes need to be split first. The analysis keeps the whole spectrum in memory.`, true);
      return;
    }
    state.samples = samples;
    state.duration = samples.length / SR;
    const mb = (file.size / 1048576).toFixed(1);
    $('picked-info').textContent = `${mmss(state.duration)} · ${mb} MB`;
    $('convert').disabled = false;
    if (usesGate()) getGate().preload();
    if (state.duration > 8 * 60) toast('A long recording: expect the conversion to take several minutes.');
  } catch (e) {
    $('picked-info').textContent = 'This file could not be read as audio.';
    toast('That file could not be decoded. Try MP3, WAV, M4A, FLAC or OGG.', true);
  }
}

function clearFile() {
  state.file = null;
  state.samples = null;
  $('drop').hidden = false;
  $('picked').hidden = true;
  $('file').value = '';
}

/* ---------- conversion ---------- */
const STAGES = ['decode', 'tune', 'spectrum', 'notes', 'lengths', 'render'];

function setStage(id) {
  const idx = STAGES.indexOf(id);
  for (const li of $('stages').children) {
    const i = STAGES.indexOf(li.dataset.s);
    li.className = i < idx ? 'done' : i === idx ? 'active' : '';
  }
}

function setProgress(p) {
  const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
  $('ring-fg').style.strokeDashoffset = String(100 - pct);
  $('ring-pct').textContent = String(pct);
  $('ring').setAttribute('aria-valuenow', String(pct));
}

function makeWorker() {
  const inline = document.getElementById('worker-src');
  if (inline) return new Worker(URL.createObjectURL(new Blob([inline.textContent], { type: 'text/javascript' })));
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

function runWorker(samples) {
  return new Promise((resolve, reject) => {
    const w = makeWorker();
    state.worker = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') { setStage(m.stage); setProgress(m.p); }
      else if (m.type === 'result') { w.terminate(); state.worker = null; resolve(m); }
      else if (m.type === 'error') { w.terminate(); state.worker = null; reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); state.worker = null; reject(new Error(e.message || 'The analysis worker failed')); };
    const copy = samples.slice();
    w.postMessage({ type: 'run', samples: copy, options: state.options }, [copy.buffer]);
  });
}

async function convert() {
  if (!state.samples || state.running) return;
  state.running = true;
  $('work-file').textContent = state.file.name;
  setProgress(0);
  setStage('tune');
  show('work');
  const t0 = performance.now();
  keepAwake(true);
  $('work-title').textContent = 'Converting';
  // One rewarded ad per conversion. The user can start it right away (it hides the wait)
  // or when the MIDI is ready; the result opens once the analysis is done and the ad is complete.
  const gate = usesGate() ? getGate() : null;
  const unlocked = new Promise((resolve) => { state.unlock = resolve; });
  let isUnlocked = !gate;
  const box = $('unlock'), btn = $('unlock-btn'), txt = $('unlock-text');
  if (gate) {
    gate.preload();
    box.hidden = false; box.classList.remove('ready');
    btn.hidden = false; btn.disabled = false; btn.textContent = 'Watch ad to unlock';
    txt.textContent = 'Your MIDI unlocks after one short ad. Start it now and it will be ready sooner.';
    btn.onclick = async () => {
      btn.disabled = true;
      const r = await gate.show();
      if (r === 'declined') {
        btn.disabled = false; btn.textContent = 'Watch the full ad to unlock';
        txt.textContent = 'The MIDI unlocks once the ad has finished. Please watch it to the end.';
        return;
      }
      if (r === 'unavailable') toast('No ad is available right now, so your MIDI is unlocked.');
      isUnlocked = true; btn.hidden = true;
      txt.textContent = 'Unlocked. Thank you for supporting Notewright.';
      box.classList.remove('ready');
      state.unlock();
    };
  } else {
    box.hidden = true;
    state.unlock();   // no ad gate: nothing to wait for
  }
  try {
    // the piano preview is rendered right after the analysis
    const job = runWorker(state.samples).then(async (r) => {
      setStage('render');
      setProgress(0.97);
      const pb = await renderPlayback(r.notes, state.duration);
      r.audio = pb.audio;
      r.audioRate = pb.rate;
      return r;
    });
    const res = await job;
    if (!state.running) return;
    for (const li of $('stages').children) li.className = 'done';
    if (!isUnlocked) {
      setProgress(1);
      $('work-title').textContent = 'Your MIDI is ready';
      txt.textContent = 'Watch one short ad to unlock it.';
      box.classList.add('ready');
    }
    await unlocked;
    if (!state.running) return;
    box.hidden = true;
    state.result = res;
    showResult(res, (performance.now() - t0) / 1000);
  } catch (err) {
    if (!state.running) return;
    console.error(err);
    toast(`Conversion failed: ${err.message}`, true);
    show('home');
  } finally {
    state.running = false;
    keepAwake(false);
  }
}

let rewardGate = null;
function getGate() { return rewardGate || (rewardGate = createRewardGate()); }

function keepAwake(on) {
  const n = window.NotewrightNative;
  if (n && n.keepScreenOn) n.keepScreenOn(on);
}

function cancel() {
  if (state.worker) { state.worker.terminate(); state.worker = null; }
  state.running = false;
  if (state.unlock) state.unlock();
  keepAwake(false);
  show('home');
}

/* ---------- result ---------- */
function showResult(res, secs) {
  const notes = res.notes;
  $('res-name').textContent = baseName(state.file.name);
  const chips = [`<span class="chip"><b>${notes.length.toLocaleString()}</b> notes</span>`, `<span class="chip"><b>${mmss(state.duration)}</b> long</span>`];
  if (notes.length) {
    let lo = 127;
    let hi = 0;
    for (const n of notes) { if (n.pitch < lo) lo = n.pitch; if (n.pitch > hi) hi = n.pitch; }
    chips.push(`<span class="chip">range <b>${noteName(lo)} to ${noteName(hi)}</b></span>`);
  }
  const c = res.meta.cents;
  chips.push(`<span class="chip">tuning <b>${c >= 0 ? '+' : ''}${c.toFixed(0)}¢</b></span>`);
  chips.push(`<span class="chip">done in <b>${secs < 90 ? `${secs.toFixed(0)}s` : mmss(secs)}</b></span>`);
  $('res-chips').innerHTML = chips.join('');
  show('result');
  if (!roll) {
    roll = new PianoRoll($('roll'), { onSeek: (t) => player.seek(t) });
    player = new Player({
      onTick: (t) => {
        roll.setTime(t);
        $('t-now').textContent = mmss(t);
        const s = $('seek');
        s.value = String(Math.round((t / Math.max(0.001, player.duration)) * 1000));
        fillRange(s);
      },
      onState: (p) => $('play').classList.toggle('playing', p),
    });
  }
  player.stop();
  player.setBuffers({ midi: res.audio, midiRate: res.audioRate, orig: state.samples, origRate: SR });
  roll.setNotes(notes, state.duration);
  roll.setTime(0);
  $('t-total').textContent = mmss(player.duration);
  $('t-now').textContent = '0:00';
  $('seek').value = '0';
  fillRange($('seek'));
  $('roll-hint').style.opacity = '1';
  setTimeout(() => { $('roll-hint').style.opacity = '0'; }, 5000);
}

function downloadMidi() {
  const r = state.result;
  if (!r) return;
  const name = `${baseName(state.file.name)}.mid`;
  const bytes = r.midi;
  if (window.NotewrightNative && window.NotewrightNative.saveFile) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    window.NotewrightNative.saveFile(name, 'audio/midi', btoa(bin));
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- init ---------- */
function sensLabel(v) {
  return v < 20 ? 'Very clean' : v < 40 ? 'Clean' : v < 60 ? 'Balanced' : v < 80 ? 'Sensitive' : 'Catch everything';
}

function renderUpdate(r) {
  const title = $('update-title');
  const sub = $('update-sub');
  if (r.state === 'available') {
    title.textContent = `Version ${r.version} is available`;
    sub.innerHTML = `<a href="${r.url}" target="_blank" rel="noopener">View the release on GitHub</a>`;
  } else if (r.state === 'current') {
    title.textContent = 'You are up to date';
    sub.textContent = `Version ${CONFIG.version} is the latest.`;
  } else if (r.state === 'unconfigured') {
    title.textContent = 'Updates';
    sub.textContent = 'Update checks switch on once releases are published.';
  } else {
    title.textContent = 'Could not check';
    sub.textContent = 'You may be offline. Try again later.';
  }
}

async function quietUpdateCheck() {
  try {
    const last = +localStorage.getItem('nw-update-check') || 0;
    if (Date.now() - last < 864e5 || !CONFIG.repo) return;
    localStorage.setItem('nw-update-check', String(Date.now()));
    const r = await checkForUpdate();
    renderUpdate(r);
    if (r.state === 'available') toast(`Notewright ${r.version} is available. See About for the link.`);
  } catch { /* offline or storage blocked: ignore */ }
}

function init() {
  $('ver').textContent = CONFIG.version;
  $('about-ver').textContent = CONFIG.version;

  // file input and drag and drop
  $('file').addEventListener('change', (e) => pickFile(e.target.files[0]));
  const drop = $('drop');
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  for (const ev of ['dragenter', 'dragover']) {
    window.addEventListener(ev, (e) => { e.preventDefault(); if (!$('view-home').hidden) drop.classList.add('over'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    window.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  }
  window.addEventListener('drop', (e) => {
    if (!$('view-home').hidden && e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
  });
  $('picked-clear').addEventListener('click', clearFile);
  $('convert').addEventListener('click', convert);
  $('cancel').addEventListener('click', cancel);

  // options
  const sens = $('opt-sens');
  const upd = () => {
    fillRange(sens);
    state.options.sensitivity = sens.value / 100;
    $('opt-sens-val').textContent = sensLabel(+sens.value);
  };
  sens.addEventListener('input', upd);
  upd();
  seg($('opt-length'), (v) => { state.options.length = v; });
  seg($('opt-tuning'), (v) => { state.options.tuning = v; });

  // result view
  $('res-download').addEventListener('click', downloadMidi);
  $('res-new').addEventListener('click', () => { if (player) player.stop(); clearFile(); show('home'); });
  $('brand').addEventListener('click', () => { if (!state.running) { if (player) player.stop(); show('home'); } });
  $('play').addEventListener('click', () => player.toggle());
  const seek = $('seek');
  seek.addEventListener('input', () => {
    fillRange(seek);
    const t = (seek.value / 1000) * player.duration;
    player.seek(t);
    roll.setTime(t);
    $('t-now').textContent = mmss(t);
  });
  seg($('src'), (v) => player.setSource(v));
  const vol = $('vol');
  vol.addEventListener('input', () => { fillRange(vol); player.setVolume(vol.value / 100); });
  fillRange(vol);
  fillRange(seek);
  window.addEventListener('keydown', (e) => {
    if ($('view-result').hidden || e.target.closest('input, button, dialog')) return;
    if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
    else if (e.code === 'ArrowRight') player.seek(player.time + 5);
    else if (e.code === 'ArrowLeft') player.seek(player.time - 5);
  });

  // Android back button (called by the native shell); returns true when handled
  window.__nwBack = () => {
    if ($('about').open) { $('about').close(); return true; }
    if (!$('view-work').hidden) { cancel(); return true; }
    if (!$('view-result').hidden) { if (player) player.stop(); clearFile(); show('home'); return true; }
    if (!$('picked').hidden) { clearFile(); return true; }
    return false;
  };

  // about and updates
  const about = $('about');
  $('btn-about').addEventListener('click', () => {
    const n = window.NotewrightNative;
    $('privacy-options').hidden = !(n && n.privacyOptionsRequired && n.privacyOptionsRequired());
    about.showModal();
  });
  $('privacy-options').addEventListener('click', () => { const n = window.NotewrightNative; if (n && n.showPrivacyOptions) n.showPrivacyOptions(); });
  about.addEventListener('click', (e) => { if (e.target === about) about.close(); });
  $('update-check').addEventListener('click', async () => {
    $('update-sub').textContent = 'Checking…';
    renderUpdate(await checkForUpdate());
  });
  quietUpdateCheck();
}

/* ---------- boot ---------- */
init();
const splash = $('splash');
const skipMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
setTimeout(() => {
  $('app').hidden = false;
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 600);
}, skipMotion ? 150 : 2100);
// (the piano recordings are decoded when the first preview is needed, not at startup: that keeps memory low on phones)
setTimeout(() => { mountBanner(); }, 600);
