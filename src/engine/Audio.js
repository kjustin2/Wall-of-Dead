// Web Audio synthesis — no asset pipeline. Every sound is built from
// oscillators and filtered noise at play time. Two layers:
//
//   1. SFX  — one-shot blips (gunshots, impacts, groans, UI).
//   2. Ambient — a continuous wind drone + a stochastic horror scheduler
//      (distant groans/screams/creaks) + a dread-driven heartbeat that
//      ramps from slow to fast as danger rises.
//
// init() must be called from a user gesture (the title click) or the
// browser keeps the AudioContext suspended. In a headless context (no
// AudioContext) every method degrades to a silent no-op.

import { events } from './EventBus.js';
import { settings } from './Settings.js';

const SFX_DEDUPE_MS = 16;

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = settings.muted;
    this.volume = settings.volume;
    this._last = {};
    this._failed = false;
    this.ambient = new Ambient(this);

    // Systems request sound via the bus so they don't import Audio directly.
    events.on('SFX', (id) => this.play(id));
  }

  init() {
    if (this.ctx || this._failed) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this._failed = true; return; }
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this._failed = true;
    }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setMuted(b) {
    this.muted = b;
    if (this.master) this.master.gain.value = b ? 0 : this.volume;
  }

  play(id) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime * 1000;
    if (this._last[id] && now - this._last[id] < SFX_DEDUPE_MS) return;
    this._last[id] = now;
    const fn = SFX[id];
    if (fn) fn(this.ctx, this.master);
  }
}

// ── Synth primitives ──────────────────────────────────────────────────

function tone(ctx, out, { type = 'sine', f0, f1, dur, gain, attack = 0.004 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let _noiseBuf = null;
function noiseBuffer(ctx) {
  if (_noiseBuf) return _noiseBuf;
  const len = ctx.sampleRate * 1.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noiseBuf = buf;
  return buf;
}

function noise(ctx, out, { dur, gain, freq = 3000, q = 1, type = 'bandpass', attack = 0.002 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.03);
}

// ── SFX table ──────────────────────────────────────────────────────────

const SFX = {
  pistol(c, o) {
    tone(c, o, { type: 'square', f0: 680, f1: 90, dur: 0.09, gain: 0.3 });
    noise(c, o, { dur: 0.07, gain: 0.18, freq: 4200 });
  },
  smg(c, o) {
    tone(c, o, { type: 'square', f0: 520, f1: 110, dur: 0.05, gain: 0.2 });
    noise(c, o, { dur: 0.05, gain: 0.13, freq: 5200 });
  },
  shotgun(c, o) {
    tone(c, o, { type: 'sawtooth', f0: 220, f1: 40, dur: 0.2, gain: 0.34 });
    noise(c, o, { dur: 0.22, gain: 0.4, freq: 2000, q: 0.7 });
  },
  rifle(c, o) {
    tone(c, o, { type: 'square', f0: 900, f1: 70, dur: 0.13, gain: 0.34 });
    noise(c, o, { dur: 0.12, gain: 0.26, freq: 3200 });
  },
  empty(c, o) { tone(c, o, { type: 'square', f0: 1400, f1: 900, dur: 0.03, gain: 0.08 }); },
  reload_click(c, o) { tone(c, o, { type: 'square', f0: 1700, f1: 1100, dur: 0.04, gain: 0.16 }); },
  reload_done(c, o) { tone(c, o, { type: 'triangle', f0: 820, f1: 1300, dur: 0.08, gain: 0.2 }); },

  zombie_groan(c, o) {
    tone(c, o, { type: 'sawtooth', f0: 150, f1: 70, dur: 0.5, gain: 0.16 });
    noise(c, o, { dur: 0.5, gain: 0.06, freq: 600, q: 4 });
  },
  zombie_hit(c, o) { noise(c, o, { dur: 0.05, gain: 0.2, freq: 2600 }); },
  zombie_die(c, o) {
    tone(c, o, { type: 'sawtooth', f0: 240, f1: 50, dur: 0.32, gain: 0.2 });
    noise(c, o, { dur: 0.34, gain: 0.16, freq: 1100, q: 1.5 });
  },
  brute_roar(c, o) {
    tone(c, o, { type: 'sawtooth', f0: 110, f1: 60, dur: 0.7, gain: 0.26 });
    tone(c, o, { type: 'square', f0: 70, f1: 44, dur: 0.7, gain: 0.16 });
  },
  spitter_spit(c, o) {
    tone(c, o, { type: 'triangle', f0: 420, f1: 160, dur: 0.18, gain: 0.16 });
    noise(c, o, { dur: 0.18, gain: 0.1, freq: 2400 });
  },
  acid_hit(c, o) { noise(c, o, { dur: 0.3, gain: 0.18, freq: 1600, q: 2 }); },

  player_hurt(c, o) {
    tone(c, o, { type: 'sawtooth', f0: 330, f1: 90, dur: 0.2, gain: 0.28 });
    noise(c, o, { dur: 0.12, gain: 0.1, freq: 800 });
  },
  wall_hit(c, o) { noise(c, o, { dur: 0.08, gain: 0.14, freq: 900, q: 1.2 }); },
  wall_break(c, o) {
    tone(c, o, { type: 'sawtooth', f0: 160, f1: 40, dur: 0.5, gain: 0.3 });
    noise(c, o, { dur: 0.5, gain: 0.34, freq: 1400, q: 0.6 });
  },

  ui_click(c, o) { tone(c, o, { type: 'square', f0: 880, f1: 560, dur: 0.05, gain: 0.14 }); },
  ui_confirm(c, o) {
    tone(c, o, { type: 'triangle', f0: 600, dur: 0.09, gain: 0.16 });
    tone(c, o, { type: 'triangle', f0: 900, dur: 0.12, gain: 0.14, attack: 0.06 });
  },
  survivor_join(c, o) {
    tone(c, o, { type: 'triangle', f0: 520, f1: 780, dur: 0.18, gain: 0.18 });
    tone(c, o, { type: 'sine', f0: 780, f1: 1040, dur: 0.26, gain: 0.14, attack: 0.1 });
  },
  scavenge_good(c, o) { tone(c, o, { type: 'triangle', f0: 700, f1: 1100, dur: 0.12, gain: 0.16 }); },
  scavenge_bad(c, o) { tone(c, o, { type: 'sawtooth', f0: 300, f1: 150, dur: 0.18, gain: 0.16 }); },
  dawn_chime(c, o) {
    [523, 659, 784].forEach((f, i) =>
      tone(c, o, { type: 'sine', f0: f, dur: 1.2, gain: 0.1, attack: 0.05 + i * 0.12 }));
  },

  // Horror ambient one-shots (scheduled by Ambient).
  distant_groan(c, o) { tone(c, o, { type: 'sawtooth', f0: 90, f1: 55, dur: 1.1, gain: 0.07 }); },
  distant_scream(c, o) {
    tone(c, o, { type: 'sawtooth', f0: 600, f1: 240, dur: 0.9, gain: 0.06, attack: 0.15 });
    noise(c, o, { dur: 0.9, gain: 0.03, freq: 1800, q: 3 });
  },
  creak(c, o) { tone(c, o, { type: 'sawtooth', f0: 210, f1: 170, dur: 0.6, gain: 0.05 }); },
  heartbeat(c, o) {
    tone(c, o, { type: 'sine', f0: 70, f1: 40, dur: 0.12, gain: 0.34 });
    tone(c, o, { type: 'sine', f0: 66, f1: 38, dur: 0.1, gain: 0.26, attack: 0.16 });
  },
};

// Registered SFX ids — exported so the smoke test can verify every weapon
// sfx / gameplay cue resolves to a real synth entry.
export const SFX_IDS = Object.freeze(Object.keys(SFX));

// ── Ambient scheduler ──────────────────────────────────────────────────
// start(profile) on scene-enter, stop() on exit, tick(dt, dread01) per frame.
// The wind drone is a continuously looping filtered-noise source whose gain
// LFO is faked by nudging a gain node each tick. dread01 (0..1) tightens cue
// frequency and drives the heartbeat tempo.

class Ambient {
  constructor(audio) {
    this.audio = audio;
    this.active = false;
    this.wind = null;
    this.windGain = null;
    this._cueTimer = 4;
    this._beatTimer = 0;
    this._t = 0;
  }

  start(intensity = 0.5) {
    const a = this.audio;
    if (!a.ctx) return;
    this.active = true;
    this.baseIntensity = intensity;
    if (this.wind) return; // already running
    const ctx = a.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 380;
    filt.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.05 + intensity * 0.05, ctx.currentTime + 2);
    src.connect(filt).connect(g).connect(a.master);
    src.start();
    this.wind = src;
    this.windGain = g;
  }

  stop() {
    this.active = false;
    if (this.wind) {
      try {
        const t = this.audio.ctx.currentTime;
        this.windGain.gain.cancelScheduledValues(t);
        this.windGain.gain.setValueAtTime(this.windGain.gain.value, t);
        this.windGain.gain.linearRampToValueAtTime(0, t + 0.6);
        this.wind.stop(t + 0.7);
      } catch (e) { /* already stopped */ }
      this.wind = null;
      this.windGain = null;
    }
  }

  tick(dt, dread01 = 0) {
    if (!this.active || !this.audio.ctx) return;
    this._t += dt;

    // Wind swells gently with a slow sine, louder at high dread.
    if (this.windGain) {
      const swell = 0.05 + 0.03 * Math.sin(this._t * 0.4) + dread01 * 0.06;
      this.windGain.gain.value += (swell - this.windGain.gain.value) * Math.min(1, dt * 2);
    }

    // Stochastic distant cues — more frequent as dread rises.
    this._cueTimer -= dt;
    if (this._cueTimer <= 0) {
      const lo = 7 - dread01 * 4, hi = 14 - dread01 * 7;
      this._cueTimer = lo + Math.random() * (hi - lo);
      const r = Math.random();
      if (r < 0.5) this.audio.play('distant_groan');
      else if (r < 0.8) this.audio.play('creak');
      else this.audio.play('distant_scream');
    }

    // Heartbeat: silent below 0.35 dread, ramps tempo 1.4s -> 0.45s.
    if (dread01 > 0.35) {
      this._beatTimer -= dt;
      if (this._beatTimer <= 0) {
        this.audio.play('heartbeat');
        const t = 1.4 - (dread01 - 0.35) / 0.65 * 0.95;
        this._beatTimer = Math.max(0.45, t);
      }
    }
  }
}
