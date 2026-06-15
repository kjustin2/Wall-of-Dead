import { approach, clamp01 } from "../core/math";

export type MusicCue = "menu" | "night" | "surge" | "day" | "victory" | "defeat";

// Final original tracks live in public/music. One track per mood; the manager
// crossfades between them as the cue changes.
const BASE = import.meta.env.BASE_URL;
const TRACKS: Record<MusicCue, string[]> = {
  menu: ["menu.mp3"], // title / main menu
  night: ["action.mp3"], // the defense
  surge: ["boss.mp3"], // dawn push + mini-boss
  day: ["shop.mp3"], // day supply run
  victory: ["menu.mp3"], // resolved / safe
  defeat: ["boss.mp3"], // grim
};

interface Slot {
  el: HTMLAudioElement | null;
  vol: number;
  target: number;
}

/**
 * Streamed music with two crossfading slots. Track set is chosen by cue
 * (menu/night/surge/day/…) so the score follows the action. Honors a separate
 * music-volume setting and only starts after the audio unlock gesture.
 */
export class Music {
  private slots: [Slot, Slot] = [
    { el: null, vol: 0, target: 0 },
    { el: null, vol: 0, target: 0 },
  ];
  private active = 0;
  private master = 0.5;
  private unlocked = false;
  private wanted: MusicCue | null = null;
  private currentFile = "";
  private rng = 12345;
  private intensity = 1; // adaptive mix: swells with the action, ducks at lulls
  private intensitySmooth = 1;

  private rand(): number {
    this.rng = (this.rng * 1664525 + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  setVolume(v: number): void {
    // Background music — capped low so even slider-at-middle is a faint bed.
    this.master = v * 0.22;
    const a = this.slots[this.active];
    if (a.el && a.target > 0) a.target = this.master;
  }

  resume(): void {
    this.unlocked = true;
    if (this.wanted) this.play(this.wanted);
  }

  /** Begin buffering the menu track so the first play doesn't hitch. Resolves
   * when it can play through, or immediately on error (no AudioElement support). */
  preload(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const el = new Audio(`${BASE}music/${TRACKS.menu[0]}`);
        el.preload = "auto";
        const done = () => resolve();
        el.addEventListener("canplaythrough", done, { once: true });
        el.addEventListener("error", done, { once: true });
        el.load();
      } catch {
        resolve();
      }
    });
  }

  /** Crossfade to a (random) track for this cue. No-op if it's already playing. */
  play(cue: MusicCue): void {
    this.wanted = cue;
    if (!this.unlocked) return;
    const list = TRACKS[cue];
    let file = list[Math.floor(this.rand() * list.length)];
    if (list.length > 1 && file === this.currentFile) {
      file = list[(list.indexOf(file) + 1) % list.length];
    }
    if (file === this.currentFile && this.slots[this.active].el) return;
    this.currentFile = file;

    const next = 1 - this.active;
    this.stopSlot(next);
    try {
      const el = new Audio(`${BASE}music/${file}`);
      el.loop = true;
      el.volume = 0;
      void el.play().catch(() => {});
      this.slots[next] = { el, vol: 0, target: this.master };
    } catch {
      return;
    }
    this.slots[this.active].target = 0;
    this.active = next;
  }

  /** 0..1 — how thick the action is right now; the active track swells toward
   * the peak and ducks during lulls (adaptive mixing of the cue track). */
  setIntensity(x: number): void {
    this.intensity = clamp01(x);
  }

  stop(): void {
    this.wanted = null;
    this.slots[0].target = 0;
    this.slots[1].target = 0;
  }

  private stopSlot(i: number): void {
    const s = this.slots[i];
    if (s.el) {
      try {
        s.el.pause();
      } catch {
        /* noop */
      }
      s.el = null;
    }
    s.vol = 0;
    s.target = 0;
  }

  update(dt: number): void {
    const rate = dt * 0.8; // ~1.2s crossfade
    this.intensitySmooth = approach(this.intensitySmooth, this.intensity, dt * 0.6);
    // The active track is mixed by intensity (0.55 at a lull → 1.0 at the peak).
    const mod = 0.55 + 0.45 * this.intensitySmooth;
    for (let i = 0; i < 2; i++) {
      const s = this.slots[i];
      if (!s.el) continue;
      s.vol = approach(s.vol, s.target, rate);
      const m = i === this.active ? mod : 1;
      s.el.volume = Math.max(0, Math.min(1, s.vol * m));
      if (s.target === 0 && s.vol <= 0.001) this.stopSlot(i);
    }
  }
}
