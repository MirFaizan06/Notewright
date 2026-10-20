// Piano-roll canvas: keyboard strip on the left, notes scrolling past a fixed playhead.

const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false]; // from C
const isBlack = (p) => BLACK[p % 12];

function css(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export class PianoRoll {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onSeek?: (t:number)=>void}} hooks
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.notes = [];
    this.duration = 0;
    this.time = 0;
    this.pps = 90;            // pixels per second
    this.maxDur = 1;
    this.lo = 36; this.hi = 84;
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this._dragging = null;
    this._raf = 0;
    this._pinch = null;
    this._bind();
    this._resize();
  }

  setNotes(notes, duration) {
    this.notes = notes.slice().sort((a, b) => a.start - b.start);
    this.duration = duration;
    this.maxDur = this.notes.reduce((m, n) => Math.max(m, n.end - n.start), 0.5);
    if (this.notes.length) {
      let lo = 127, hi = 0;
      for (const n of this.notes) { if (n.pitch < lo) lo = n.pitch; if (n.pitch > hi) hi = n.pitch; }
      lo = Math.max(21, lo - 2); hi = Math.min(108, hi + 2);
      // keep at least three octaves visible, centred on the music
      if (hi - lo < 35) { const c = (hi + lo) / 2; lo = Math.max(21, Math.round(c - 18)); hi = Math.min(108, lo + 36); }
      this.lo = lo; this.hi = hi;
    }
    this.draw();
  }

  setTime(t) { this.time = t; this.draw(); }

  draw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._paint(); });
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.draw();
  }

  _bind() {
    new ResizeObserver(() => this._resize()).observe(this.canvas);
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this._dragging = { x: e.clientX, t: this.time, id: e.pointerId };
      c.classList.add('drag');
    });
    c.addEventListener('pointermove', (e) => {
      if (!this._dragging || this._pinch) return;
      const dt = -(e.clientX - this._dragging.x) / this.pps;
      const t = Math.max(0, Math.min(this.duration, this._dragging.t + dt));
      this.time = t;
      this.hooks.onSeek && this.hooks.onSeek(t);
      this.draw();
    });
    const end = () => { this._dragging = null; c.classList.remove('drag'); };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      this.pps = Math.max(24, Math.min(600, this.pps * f));
      this.draw();
    }, { passive: false });
    // two-finger pinch
    const pts = new Map();
    c.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, e); if (pts.size === 2) { const [a, b] = [...pts.values()]; this._pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), pps: this.pps }; } });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (this._pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        this.pps = Math.max(24, Math.min(600, this._pinch.pps * (d / this._pinch.d)));
        this.draw();
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) this._pinch = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => this.draw());
  }

  _paint() {
    const { ctx, dpr, w, h } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = css('--roll-bg', '#13110f');
    const grid = css('--roll-grid', 'rgba(255,255,255,.05)');
    const octv = css('--roll-oct', 'rgba(255,255,255,.1)');
    const accent = css('--accent', '#eaa54f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const kw = w < 560 ? 34 : 52;
    const px = kw + (w - kw) * 0.2;           // playhead x
    const rows = this.hi - this.lo + 1;
    const laneH = h / rows;
    const yOf = (p) => (this.hi - p) * laneH;
    const t = this.time;
    const tLeft = t - (px - kw) / this.pps;
    const tRight = t + (w - px) / this.pps;

    // lanes
    for (let p = this.lo; p <= this.hi; p++) {
      if (isBlack(p)) { ctx.fillStyle = grid; ctx.fillRect(kw, yOf(p), w - kw, laneH); }
      if (p % 12 === 0) { ctx.fillStyle = octv; ctx.fillRect(kw, yOf(p) + laneH - 1, w - kw, 1); }
    }
    // time grid
    ctx.fillStyle = grid;
    const step = this.pps > 200 ? 0.5 : this.pps > 60 ? 1 : 5;
    for (let s = Math.ceil(tLeft / step) * step; s < tRight; s += step) {
      const x = px + (s - t) * this.pps;
      if (x > kw) ctx.fillRect(Math.round(x), 0, 1, h);
    }

    // notes
    const notes = this.notes;
    let i = 0;
    { let lo = 0, hi = notes.length; const target = tLeft - this.maxDur; while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].start < target) lo = m + 1; else hi = m; } i = lo; }
    const active = new Set();
    ctx.save();
    ctx.beginPath(); ctx.rect(kw, 0, w - kw, h); ctx.clip();
    for (; i < notes.length; i++) {
      const n = notes[i];
      if (n.start > tRight) break;
      if (n.end < tLeft) continue;
      const x0 = px + (n.start - t) * this.pps;
      const x1 = px + (n.end - t) * this.pps;
      const y = yOf(n.pitch) + laneH * 0.12;
      const hh = Math.max(2, laneH * 0.76);
      const on = n.start <= t && n.end > t;
      if (on) active.add(n.pitch);
      const v = n.velocity / 127;
      const light = 42 + 26 * v + (on ? 10 : 0);
      ctx.fillStyle = `hsl(${on ? 38 : 34} ${70 + 22 * v}% ${light}%)`;
      const ww = Math.max(3, x1 - x0 - 1);
      const r = Math.min(hh / 2, 5);
      ctx.beginPath(); ctx.roundRect(x0, y, ww, hh, r); ctx.fill();
      if (on) { ctx.shadowColor = accent; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0; }
    }
    ctx.restore();

    // playhead
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(Math.round(px), 0, 2, h);
    ctx.globalAlpha = 1;

    // keyboard
    ctx.fillStyle = css('--panel', '#1c1916');
    ctx.fillRect(0, 0, kw, h);
    for (let p = this.lo; p <= this.hi; p++) {
      const y = yOf(p);
      if (!isBlack(p)) {
        ctx.fillStyle = active.has(p) ? accent : '#f1ece1';
        ctx.fillRect(0, y + 0.5, kw - 1, laneH - 1);
      }
    }
    for (let p = this.lo; p <= this.hi; p++) {
      if (!isBlack(p)) continue;
      const y = yOf(p);
      ctx.fillStyle = active.has(p) ? accent : '#1a1714';
      ctx.fillRect(0, y + 0.5, kw * 0.62, laneH - 1);
    }
    if (laneH >= 7) {
      ctx.fillStyle = '#5a5246';
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      for (let p = this.lo; p <= this.hi; p++) if (p % 12 === 0) ctx.fillText(`C${Math.floor(p / 12) - 1}`, kw - 22, yOf(p) + laneH / 2);
    }
    ctx.fillStyle = octv;
    ctx.fillRect(kw - 1, 0, 1, h);
  }
}
