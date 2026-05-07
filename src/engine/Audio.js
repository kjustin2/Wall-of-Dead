// Audio: Web Audio API synth SFX (no asset pipeline) + optional MP3 BGM
// pool. Modeled after roguehero2/src/audio.js's shuffle-bag pattern but
// trimmed to what M2 actually needs.
//
// SFX are tiny pulse/noise blips synthesized on the fly — gunshots,
// reload click, zombie groan, hit thud, explosion. Each takes ~5-30ms
// of audio context time and shares one master gain node.
//
// BGM via HTMLAudioElement (separate from Web Audio) so users can mute
// music independently if we add a slider later. M2 leaves BGM hooks but
// loads no actual track until M3 (when MetaProgress holds the volume).

import { events } from './EventBus.js';

const SFX_COOLDOWN_MS = 18;  // de-dupe identical SFX within this window

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterVolume = 0.6;
    this.muted = false;
    this._lastFire = {};       // sfxId → ms timestamp
    this._initFailed = false;
  }

  // Must be called after a user gesture (click). BootScene's "click to begin"
  // gesture is what unlocks this. Calling earlier will silently noop.
  init() {
    if (this.ctx || this._initFailed) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this._initFailed = true; return; }
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[Audio] init failed:', e);
      this._initFailed = true;
    }
  }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
  }

  setMuted(b) {
    this.muted = !!b;
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
  }

  // ── SFX dispatcher ──
  playSfx(id) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (this._lastFire[id] && now - this._lastFire[id] < SFX_COOLDOWN_MS) return;
    this._lastFire[id] = now;
    const fn = SFX[id];
    if (fn) fn(this.ctx, this.masterGain);
  }
}

// ── SFX synthesis library ──
//
// Each takes (ctx, output) and schedules a short envelope. Designed to be
// tiny and recognizable rather than realistic — distinct silhouette per
// weapon so the player knows what's firing without looking at the HUD.

function noiseBuffer(ctx, secs) {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function noiseBurst(ctx, output, dur, attack, release, lp, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = lp;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.linearRampToValueAtTime(0, t + attack + release);
  src.connect(filt).connect(g).connect(output);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function tonePop(ctx, output, freqStart, freqEnd, dur, gain, type) {
  const o = ctx.createOscillator();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freqStart, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), ctx.currentTime + dur);
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(output);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SFX = {
  pistol(ctx, out) {
    tonePop(ctx, out, 700, 80, 0.08, 0.32, 'square');
    noiseBurst(ctx, out, 0.07, 0.001, 0.06, 4500, 0.18);
  },
  smg(ctx, out) {
    tonePop(ctx, out, 540, 110, 0.05, 0.22, 'square');
    noiseBurst(ctx, out, 0.05, 0.001, 0.04, 5000, 0.14);
  },
  shotgun(ctx, out) {
    tonePop(ctx, out, 220, 40, 0.18, 0.35, 'sawtooth');
    noiseBurst(ctx, out, 0.18, 0.001, 0.16, 2200, 0.42);
  },
  reload_click(ctx, out) {
    tonePop(ctx, out, 1800, 1100, 0.04, 0.18, 'square');
  },
  reload_done(ctx, out) {
    tonePop(ctx, out, 900, 1500, 0.07, 0.22, 'triangle');
  },
  zombie_groan(ctx, out) {
    tonePop(ctx, out, 140, 80, 0.45, 0.18, 'sawtooth');
    noiseBurst(ctx, out, 0.5, 0.05, 0.4, 700, 0.08);
  },
  zombie_die(ctx, out) {
    tonePop(ctx, out, 220, 60, 0.35, 0.22, 'sawtooth');
    noiseBurst(ctx, out, 0.4, 0.005, 0.35, 1200, 0.18);
  },
  hit(ctx, out) {
    noiseBurst(ctx, out, 0.05, 0.002, 0.04, 3500, 0.22);
  },
  explosion(ctx, out) {
    tonePop(ctx, out, 90, 30, 0.5, 0.4, 'sawtooth');
    noiseBurst(ctx, out, 0.6, 0.005, 0.55, 1800, 0.5);
  },
  spitter(ctx, out) {
    tonePop(ctx, out, 380, 180, 0.18, 0.18, 'triangle');
    noiseBurst(ctx, out, 0.18, 0.01, 0.16, 2200, 0.1);
  },
  player_hurt(ctx, out) {
    tonePop(ctx, out, 320, 90, 0.18, 0.28, 'sawtooth');
  },
  click(ctx, out) {
    tonePop(ctx, out, 1100, 700, 0.04, 0.16, 'square');
  },
};

// Listen for game events and play matching SFX. Centralizing this here keeps
// scenes/weapons from importing the audio module directly.
export function bindAudioEvents(audio) {
  events.on('WEAPON_FIRED', ({ weaponId }) => audio.playSfx(weaponId));
  events.on('WEAPON_RELOAD_START', () => audio.playSfx('reload_click'));
  events.on('WEAPON_RELOAD_END',   () => audio.playSfx('reload_done'));
  events.on('ZOMBIE_KILLED',  () => audio.playSfx('zombie_die'));
  events.on('ZOMBIE_SPAWN',   () => audio.playSfx('zombie_groan'));
  events.on('PLAYER_DAMAGED', () => audio.playSfx('player_hurt'));
  events.on('AOE_EXPLOSION',  () => audio.playSfx('explosion'));
  events.on('SPITTER_FIRE',   () => audio.playSfx('spitter'));
}
