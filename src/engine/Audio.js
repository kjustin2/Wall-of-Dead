// Audio: Web Audio API synth SFX (no asset pipeline) + horror ambient
// scheduler. BGM is neutered until new music is authored — see BGM_DISABLED.
//
// SFX are tiny pulse/noise blips synthesized on the fly — gunshots,
// reload click, zombie groan, hit thud, explosion, plus the horror layer
// (heartbeat, whispers, creaks, drips, music box, breath, slams). Each
// takes ~5-30ms of audio context time and shares one master gain node.
//
// BGM hooks are preserved but disabled. When new tracks are ready, flip
// BGM_DISABLED to false and the existing pool/shuffle/lock logic resumes
// without further changes.

import { events } from './EventBus.js';

// Master kill-switch for MP3 background music. Flip to false once new
// horror-tone music is dropped into music/. Keeps the entire pool +
// shuffle + lock implementation in place so re-enabling is a one-liner.
const BGM_DISABLED = true;

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
    this.ambient = new Ambient(this);
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
    if (BGM_DISABLED) return;
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
    if (BGM_DISABLED) return;
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

// Bandpass-filtered noise — the workhorse for whispers, creaks, breath.
function bandNoise(ctx, output, dur, freq, q, attack, release, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.linearRampToValueAtTime(0, t + attack + release);
  src.connect(filt).connect(g).connect(output);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// Simple bell-like pluck — used by the music_box scare cue. Decay shape
// resembles a struck metallic resonator without needing a real sample.
function pluck(ctx, output, freq, dur, gain) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
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

  // ── Horror layer ───────────────────────────────────────────────────
  // These are scheduled by the Ambient controller (whispers/creaks/etc.)
  // or fired directly by ScareEvents/Interactables (door slam, drops).
  // Tuned quiet-but-recognizable — atmosphere, not foreground.

  heartbeat_slow(ctx, out) {
    // Two-thud pattern: lub-dub. Cheap and biological.
    tonePop(ctx, out, 78, 42, 0.13, 0.36, 'sine');
    const o = ctx.createOscillator();
    o.type = 'sine';
    const t = ctx.currentTime + 0.18;
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.10);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.13);
  },
  heartbeat_fast(ctx, out) {
    // Same pattern, tighter and louder — fires when dread is high.
    tonePop(ctx, out, 92, 48, 0.10, 0.42, 'sine');
    const o = ctx.createOscillator();
    o.type = 'sine';
    const t = ctx.currentTime + 0.13;
    o.frequency.setValueAtTime(88, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.10);
  },
  whisper_short(ctx, out) {
    // Sibilant noise burst, vaguely formant-shaped — never intelligible.
    bandNoise(ctx, out, 0.32, 1300, 6, 0.08, 0.22, 0.14);
    bandNoise(ctx, out, 0.32, 2400, 8, 0.10, 0.20, 0.07);
  },
  whisper_long(ctx, out) {
    bandNoise(ctx, out, 0.85, 1100, 7, 0.18, 0.65, 0.11);
    bandNoise(ctx, out, 0.85, 2100, 9, 0.22, 0.60, 0.05);
  },
  distant_scream(ctx, out) {
    // Filtered down so it really sounds like it's behind a wall.
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(280, t + 0.7);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.08);
    g.gain.linearRampToValueAtTime(0.18, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(filt).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.75);
    bandNoise(ctx, out, 0.7, 800, 5, 0.1, 0.55, 0.06);
  },
  floor_creak(ctx, out) {
    // Wood under weight — slow downward saw with tight bandpass.
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.45);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 220;
    filt.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(filt).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.55);
  },
  pipe_drip(ctx, out) {
    // Water drop — high tone with a brief resonant tail.
    tonePop(ctx, out, 2200, 1400, 0.05, 0.22, 'sine');
    tonePop(ctx, out, 900, 600, 0.05, 0.10, 'sine');
  },
  music_box(ctx, out) {
    // Two notes from a minor scale — A4 + C5 → A4 + Eb5 alternating bias
    // gives that wrong-lullaby vibe. One call = one phrase fragment.
    const notes = [440, 523.25, 587.33, 415.30];
    const a = notes[Math.floor(Math.random() * notes.length)];
    const b = notes[Math.floor(Math.random() * notes.length)];
    pluck(ctx, out, a, 0.6, 0.18);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const t = ctx.currentTime + 0.32;
    o.frequency.setValueAtTime(b, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.6);
  },
  breath_held(ctx, out) {
    // Just-audible inhale — used for "you are not alone" beats.
    bandNoise(ctx, out, 0.6, 700, 2.5, 0.18, 0.4, 0.08);
  },
  breath_panic(ctx, out) {
    // Three short bandpass bursts.
    for (let i = 0; i < 3; i++) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.12);
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 850;
      filt.Q.value = 3;
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.02);
      g.gain.linearRampToValueAtTime(0, t + 0.10);
      src.connect(filt).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.13);
    }
  },
  radio_static(ctx, out) {
    noiseBurst(ctx, out, 0.5, 0.05, 0.4, 3500, 0.10);
  },
  door_slam(ctx, out) {
    tonePop(ctx, out, 140, 38, 0.12, 0.5, 'sawtooth');
    noiseBurst(ctx, out, 0.16, 0.001, 0.14, 700, 0.32);
  },
  glass_shatter(ctx, out) {
    noiseBurst(ctx, out, 0.32, 0.001, 0.30, 6800, 0.36);
    bandNoise(ctx, out, 0.32, 5200, 4, 0.005, 0.28, 0.18);
  },
  rat_skitter(ctx, out) {
    // Rapid micro-bursts — claws on tile.
    for (let i = 0; i < 4; i++) {
      const t0 = ctx.currentTime + i * 0.045 + Math.random() * 0.02;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.04);
      const filt = ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 4000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.14, t0 + 0.003);
      g.gain.linearRampToValueAtTime(0, t0 + 0.035);
      src.connect(filt).connect(g).connect(out);
      src.start(t0);
      src.stop(t0 + 0.05);
    }
  },
  body_drop(ctx, out) {
    tonePop(ctx, out, 90, 32, 0.18, 0.55, 'sawtooth');
    noiseBurst(ctx, out, 0.24, 0.005, 0.22, 600, 0.30);
  },
  flicker_buzz(ctx, out) {
    // 60Hz mains hum — fluorescent tube struggling.
    const o = ctx.createOscillator();
    o.type = 'square';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(120, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.02);
    g.gain.linearRampToValueAtTime(0.06, t + 0.18);
    g.gain.linearRampToValueAtTime(0, t + 0.22);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.25);
  },
  chain_drag(ctx, out) {
    // Metallic rasps via highpass-filtered noise envelope.
    bandNoise(ctx, out, 0.55, 3800, 12, 0.04, 0.45, 0.08);
    bandNoise(ctx, out, 0.55, 5400, 14, 0.05, 0.48, 0.05);
  },
  kill_thump_sub(ctx, out) {
    // Sub-bass thump on heavy-weapon kills. 70Hz sine sweep down to 50Hz
    // with a 90ms exponential tail — felt more than heard, the audio
    // analogue of "this kill mattered."
    const o = ctx.createOscillator();
    o.type = 'sine';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.11);
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
  events.on('KILL_THUMP',     () => audio.playSfx('kill_thump_sub'));

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

// ── Ambient horror scheduler ──
//
// Stochastic background layer. Scenes call `audio.ambient.start(sceneKey)`
// on enter, `.stop()` on exit, and `.tick(dt, dread01)` per frame. The
// scheduler picks cues from a per-scene pool and fires them at intervals
// that tighten as the dread value (0–1, supplied by the scene) climbs.
//
// A separate heartbeat layer rides on top — silent below dread 0.4, then
// fades in and accelerates toward heartbeat_fast as dread approaches 1.
// Both layers share the master gain so muting/volume affect them too.

const AMBIENT_POOLS = {
  combat: ['floor_creak', 'pipe_drip', 'whisper_short', 'rat_skitter', 'distant_scream', 'flicker_buzz', 'chain_drag'],
  basement: ['music_box', 'whisper_long', 'pipe_drip', 'chain_drag', 'breath_held', 'distant_scream'],
  outdoor: ['floor_creak', 'distant_scream', 'whisper_short', 'rat_skitter'],
  map: ['floor_creak', 'distant_scream', 'whisper_long'],
};

class Ambient {
  constructor(audio) {
    this.audio = audio;
    this.sceneKey = null;
    this.pool = [];
    this.cueTimer = 0;       // counts up; fires when >= cueAt
    this.cueAt = 0;
    this.heartbeatTimer = 0; // counts up; fires when >= 1/heartbeatRate
    this.heartbeatRate = 0;  // beats per second; smoothed toward target
    this._lastIdx = -1;
  }

  // sceneKey is one of AMBIENT_POOLS keys, OR a custom array of sfxIds.
  start(sceneKey, opts = {}) {
    this.sceneKey = sceneKey;
    this.pool = Array.isArray(sceneKey) ? sceneKey
      : (opts.pool || AMBIENT_POOLS[sceneKey] || AMBIENT_POOLS.combat);
    this.cueTimer = 0;
    this.cueAt = 4 + Math.random() * 6;  // first cue in 4–10s
    this.heartbeatTimer = 0;
    this.heartbeatRate = 0;
    this._lastIdx = -1;
  }

  stop() {
    this.sceneKey = null;
    this.pool = [];
    this.heartbeatRate = 0;
  }

  // dread01 is the calling scene's tension value, 0=calm 1=peak.
  tick(dt, dread01) {
    if (!this.sceneKey || !this.pool.length) return;
    const d = Math.max(0, Math.min(1, dread01 || 0));

    // ── Heartbeat layer ──
    // Below 0.4: silent. Above: ramps from ~0.6/s up to ~2.0/s as dread climbs.
    const targetRate = d > 0.4 ? (0.6 + (d - 0.4) * 2.4) : 0;
    this.heartbeatRate += (targetRate - this.heartbeatRate) * Math.min(1, dt * 1.5);
    if (this.heartbeatRate > 0.15) {
      this.heartbeatTimer += dt;
      const period = 1 / this.heartbeatRate;
      if (this.heartbeatTimer >= period) {
        this.heartbeatTimer -= period;
        this.audio.playSfx(d > 0.75 ? 'heartbeat_fast' : 'heartbeat_slow');
      }
    } else {
      this.heartbeatTimer = 0;
    }

    // ── Stochastic cue layer ──
    this.cueTimer += dt;
    if (this.cueTimer >= this.cueAt) {
      this.cueTimer = 0;
      // Avoid back-to-back duplicate cues — picks again if same as last.
      let idx = Math.floor(Math.random() * this.pool.length);
      if (idx === this._lastIdx && this.pool.length > 1) {
        idx = (idx + 1) % this.pool.length;
      }
      this._lastIdx = idx;
      this.audio.playSfx(this.pool[idx]);
      // Reschedule. Calm: 8–14s. Peak dread: 3–5s.
      const minBase = 8 + (3 - 8) * d;     // 8 → 3
      const maxBase = 14 + (5 - 14) * d;   // 14 → 5
      this.cueAt = minBase + Math.random() * (maxBase - minBase);
    }
  }

  // Allow scenes to override the cue pool mid-flight (e.g., per-floor pools).
  setPool(pool) {
    if (Array.isArray(pool)) this.pool = pool;
  }
}
