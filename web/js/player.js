// Playback of the rendered MIDI audio, the original recording, or both in sync.

export class Player {
  /** @param {{onTick?: (t:number)=>void, onState?: (playing:boolean)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.ctx = null;
    this.buffers = { midi: null, orig: null };
    this.source = 'midi';
    this.volume = 0.8;
    this.duration = 0;
    this.offset = 0;
    this.startedAt = 0;
    this.playing = false;
    this.nodes = [];
    this._raf = 0;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  setBuffers({ midi, midiRate, orig, origRate }) {
    this.buffers.midi = midi ? { data: midi, rate: midiRate } : null;
    this.buffers.orig = orig ? { data: orig, rate: origRate } : null;
    this.duration = Math.max(midi ? midi.length / midiRate : 0, orig ? orig.length / origRate : 0);
    this._abuf = {};
  }

  _buffer(kind) {
    this._ensure();
    this._abuf = this._abuf || {};
    if (!this._abuf[kind]) {
      const b = this.buffers[kind];
      const ab = this.ctx.createBuffer(1, b.data.length, b.rate);
      ab.copyToChannel(b.data, 0);
      this._abuf[kind] = ab;
    }
    return this._abuf[kind];
  }

  setSource(s) {
    const was = this.playing;
    const t = this.time;
    if (was) this._stopNodes();
    this.source = s;
    if (was) this._startNodes(t);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  get time() {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  async play() {
    this._ensure();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.offset >= this.duration - 0.02) this.offset = 0;
    this._startNodes(this.offset);
    this.playing = true;
    this.hooks.onState && this.hooks.onState(true);
    this._loop();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.time;
    this._stopNodes();
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this.hooks.onState && this.hooks.onState(false);
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  seek(t) {
    t = Math.max(0, Math.min(this.duration, t));
    if (this.playing) { this._stopNodes(); this._startNodes(t); } else this.offset = t;
    this.hooks.onTick && this.hooks.onTick(t);
  }

  stop() { this.pause(); this.offset = 0; }

  _startNodes(from) {
    const kinds = this.source === 'both' ? ['midi', 'orig'] : [this.source];
    const gains = { midi: this.source === 'both' ? 0.85 : 1, orig: this.source === 'both' ? 0.7 : 1 };
    this.nodes = [];
    for (const k of kinds) {
      if (!this.buffers[k]) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = this._buffer(k);
      const g = this.ctx.createGain();
      g.gain.value = gains[k];
      src.connect(g).connect(this.master);
      src.start(0, from);
      this.nodes.push(src);
    }
    this.offset = from;
    this.startedAt = this.ctx.currentTime;
  }

  _stopNodes() {
    for (const n of this.nodes) { try { n.stop(); } catch { /* already stopped */ } n.disconnect(); }
    this.nodes = [];
  }

  _loop() {
    const step = () => {
      if (!this.playing) return;
      const t = this.time;
      this.hooks.onTick && this.hooks.onTick(t);
      if (t >= this.duration - 0.01) { this.pause(); this.offset = this.duration; this.hooks.onTick && this.hooks.onTick(this.duration); return; }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
}
