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
const BGM_VOL = 0.32;        // music sits below SFX

// Track pools — fall back gracefully if the user hasn't synced the
// roguehero2/music/ folder. We try the local music/ folder first, then
// the sibling roguehero2/music/ folder, then give up silently.
const MUSIC_PATHS = ['music/', '../roguehero2/music/'];
const POOLS = {
  intro: ['Main_Menu.mp3','Main_Menu2.mp3','Main_Menu3.mp3','Main_Menu4.mp3','Main_Menu5.mp3','Main_Menu6.mp3','Main_Menu7.mp3','Main_Menu8.mp3'],
  map:   ['Selection_Map.mp3','Selection_Map2.mp3','Selection_Map3.mp3','Selection_Map4.mp3','Selection_Map5.mp3','Selection_Map6.mp3','Selection_Map7.mp3','Selection_Map8.mp3'],
  night: ['Normal_Battle.mp3','Normal_Battle2.mp3','Normal_Battle3.mp3','Normal_Battle4.mp3','Normal_Battle5.mp3','Normal_Battle6.mp3','Normal_Battle7.mp3','Normal_Battle8.mp3','Normal_Battle9.mp3','Normal_Battle10.mp3','Normal_Battle11.mp3','Normal_Battle12.mp3','Normal_Battle13.mp3'],
  boss:  ['Boss_Battle.mp3','Boss_Battle2.mp3','Boss_Battle3.mp3','Boss_Battle4.mp3','Boss_Battle5.mp3','Boss_Battle6.mp3','Boss_Battle7.mp3','Boss_Battle8.mp3'],
};

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterVolume = 0.6;
    this.muted = false;
    this._lastFire = {};
    this._initFailed = false;
    this._bgm = null;             // HTMLAudioElement
    this._bgmPool = null;          // currently selected pool key
    this._bgmShuffle = [];         // remaining tracks before reshuffle
    this._musicBase = MUSIC_PATHS[0];
    this._musicBaseTried = 0;
    this._lockedTrack = null;      // pinned during boss / continued combat
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

  // ── BGM ──
  // Pool keys: 'intro' | 'map' | 'night' | 'boss'. Locking pins the
  // current track until silenceBgm() (used during boss fights so the
  // boss theme doesn't randomly reroll mid-fight).
  playBgm(poolKey, opts) {
    if (typeof Audio === 'undefined' || this.muted) return;
    const pool = POOLS[poolKey];
    if (!pool || pool.length === 0) return;
    if (this._lockedTrack && this._bgmPool === poolKey) return;
    if (poolKey === this._bgmPool && this._bgm && !this._bgm.paused) return;

    if (!this._bgmShuffle.length || this._bgmPool !== poolKey) {
      this._bgmShuffle = [...pool].sort(() => Math.random() - 0.5);
      this._bgmPool = poolKey;
    }
    const track = this._bgmShuffle.pop();
    this._lockedTrack = (opts && opts.lock) ? track : null;
    this._loadAndPlay(track, poolKey);
  }

  silenceBgm() {
    this._lockedTrack = null;
    if (this._bgm) {
      try { this._bgm.pause(); } catch {}
    }
  }

  _loadAndPlay(track, poolKey) {
    const src = this._musicBase + track;
    if (!this._bgm) {
      this._bgm = new Audio();
      this._bgm.loop = false;
      this._bgm.volume = BGM_VOL * this.masterVolume;
      this._bgm.addEventListener('ended', () => {
        // Move to next track in shuffle for variety
        if (this._lockedTrack === track) {
          // Locked: replay same track
          this._loadAndPlay(track, poolKey);
        } else if (this._bgmPool) {
          this.playBgm(this._bgmPool);
        }
      });
      this._bgm.addEventListener('error', () => {
        // Fall through to next path candidate.
        this._musicBaseTried++;
        if (this._musicBaseTried < MUSIC_PATHS.length) {
          this._musicBase = MUSIC_PATHS[this._musicBaseTried];
          this._loadAndPlay(track, poolKey);
        }
      });
    }
    try {
      this._bgm.src = src;
      this._bgm.volume = BGM_VOL * this.masterVolume;
      const p = this._bgm.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      // Browsers without autoplay yet — quietly drop until next gesture.
    }
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

// Listen for game events and play matching SFX + BGM. Centralizing this
// here keeps scenes/weapons from importing the audio module directly.
export function bindAudioEvents(audio) {
  events.on('WEAPON_FIRED', ({ weaponId }) => audio.playSfx(weaponId));
  events.on('WEAPON_RELOAD_START', () => audio.playSfx('reload_click'));
  events.on('WEAPON_RELOAD_END',   () => audio.playSfx('reload_done'));
  events.on('ZOMBIE_KILLED',  () => audio.playSfx('zombie_die'));
  events.on('ZOMBIE_SPAWN',   () => audio.playSfx('zombie_groan'));
  events.on('PLAYER_DAMAGED', () => audio.playSfx('player_hurt'));
  events.on('AOE_EXPLOSION',  () => audio.playSfx('explosion'));
  events.on('SPITTER_FIRE',   () => audio.playSfx('spitter'));

  // BGM: route per-scene-entry to the right pool. Boss entry locks the
  // track so it plays uninterrupted to a phase transition.
  events.on('SCENE_ENTERED', ({ name }) => {
    if (name === 'intro' || name === 'baseCamp') audio.playBgm('intro');
    else if (name === 'map' || name === 'scavenge' || name === 'shop' || name === 'event') audio.playBgm('map');
    else if (name === 'gameOver' || name === 'victory' || name === 'meta' || name === 'boot') audio.silenceBgm();
    // 'combat' BGM picks based on boss flag — handled when the scene tells us.
  });
  events.on('NIGHT_START', ({ nightNum, waveCount: _w }) => {
    // Any night >= the boss-night flag uses the boss pool, locked.
    // Combat scenes set window._wod-style state; we keep this loose here.
  });
  events.on('BOSS_FIGHT_BEGIN', () => audio.playBgm('boss', { lock: true }));
  events.on('NIGHT_FIGHT_BEGIN', () => audio.playBgm('night'));
}
