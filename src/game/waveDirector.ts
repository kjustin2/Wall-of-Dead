import type { Ctx } from "./ctx";
import { FIELD, RUN } from "../config";
import { clamp, lerp } from "../core/math";
import { levelInfo, type CampaignLevel } from "./acts";

interface NightPlan {
  length: number;
  maxAlive: number;
  startInterval: number;
  endInterval: number;
  /** Type weights as the night progresses (early → late). */
  early: { type: string; w: number }[];
  late: { type: string; w: number }[];
}

// One escalating night for the slice. Mix shifts from shamblers toward
// runners/brutes/spitters; spawns tighten; a final pre-dawn surge.
const PLAN: NightPlan = {
  length: RUN.nightLength + 18, // longer nights so the climax has room to breathe
  maxAlive: 26,
  startInterval: 2.1,
  endInterval: 0.5,
  early: [
    { type: "shambler", w: 10 },
    { type: "runner", w: 2 },
  ],
  late: [
    { type: "shambler", w: 5 },
    { type: "runner", w: 6 },
    { type: "crawler", w: 4 },
    { type: "brute", w: 3 },
    { type: "spitter", w: 4 },
    { type: "armored", w: 3 },
    { type: "screamer", w: 2 },
    { type: "leaper", w: 3 },
    { type: "shielded", w: 2 },
    { type: "exploder", w: 2 },
  ],
};

// Per-act spawn identities — each leg of the road fights DIFFERENTLY, so the
// campaign escalates in kind, not just in numbers (and the night mix matches the
// act's environment + signature threat). Falls back to PLAN for any unknown act.
type Mix = { type: string; w: number }[];
const ACT_MIXES: Record<number, { early: Mix; late: Mix }> = {
  // Act I — THE OUTER ROAD: a raw, swelling horde. Shamblers and runners, the
  // first brutes leaning on the barricade.
  1: {
    early: [
      { type: "shambler", w: 10 },
      { type: "runner", w: 3 },
      { type: "crawler", w: 2 },
    ],
    late: [
      { type: "shambler", w: 6 },
      { type: "runner", w: 7 },
      { type: "crawler", w: 3 },
      { type: "brute", w: 3 },
      { type: "leaper", w: 2 },
      { type: "spitter", w: 2 },
    ],
  },
  // Act II — THE FLOODLINE: low and fast out of the black water. Crawlers and
  // leapers vault the wall; spitters and exploders strike it from range.
  2: {
    early: [
      { type: "crawler", w: 8 },
      { type: "shambler", w: 5 },
      { type: "runner", w: 3 },
    ],
    late: [
      { type: "crawler", w: 7 },
      { type: "leaper", w: 5 },
      { type: "spitter", w: 5 },
      { type: "runner", w: 4 },
      { type: "exploder", w: 3 },
      { type: "shambler", w: 3 },
      { type: "brute", w: 2 },
    ],
  },
  // Act III — HAVEN APPROACH: the iron tide. Armor and shields at the screening
  // line, screamers whipping them on, heavies grinding behind.
  3: {
    early: [
      { type: "shambler", w: 6 },
      { type: "runner", w: 4 },
      { type: "armored", w: 3 },
      { type: "screamer", w: 1 },
    ],
    late: [
      { type: "armored", w: 5 },
      { type: "shielded", w: 4 },
      { type: "brute", w: 4 },
      { type: "screamer", w: 3 },
      { type: "runner", w: 4 },
      { type: "exploder", w: 3 },
      { type: "spitter", w: 2 },
      { type: "leaper", w: 2 },
    ],
  },
};

// Headline threats rotate through the campaign so ordinary levels still have
// memorable spikes between act bosses.
interface Signature {
  at: number; // progress to fire
  name: string;
  sub: string;
  run: (ctx: Ctx) => void;
}
// Keyed by global level (1..9). Ordinary (non-boss) levels each get one themed
// headline spike; the act-finale boss levels (3, 6, 9) are intentionally absent
// so the boss itself is the mid-night event rather than stacking on top of one.
const SIGNATURES: Record<number, Signature> = {
  // Act I — The Outer Road
  1: {
    at: 0.5,
    name: "FIRST WAVE",
    sub: "They've found the barricade — runners on the road",
    run: (ctx) => {
      for (let k = 0; k < 3; k++) ctx.enemies.spawn("runner", ctx.rng.range(-14, 14));
    },
  },
  2: {
    at: 0.46,
    name: "BRUTE CHARGE",
    sub: "Heavies in the underpass — make room",
    run: (ctx) => {
      for (let k = 0; k < 2; k++) ctx.enemies.spawn("brute", ctx.rng.range(-10, 10));
    },
  },
  // Act II — The Floodline
  4: {
    at: 0.44,
    name: "THINGS IN THE WATER",
    sub: "Crawlers low in the black water — mind the gaps",
    run: (ctx) => {
      for (let k = 0; k < 5; k++) ctx.enemies.spawn("crawler", ctx.rng.range(-18, 18));
    },
  },
  5: {
    at: 0.42,
    name: "SPITTER BATTERY",
    sub: "Acid from range — watch the wall",
    run: (ctx) => {
      for (const sx of [-16, 0, 16]) ctx.enemies.spawn("spitter", sx + ctx.rng.range(-3, 3));
    },
  },
  // Act III — Haven Approach
  7: {
    at: 0.45,
    name: "HOWLING PACK",
    sub: "A screamer's whipping them into a sprint — drop it fast",
    run: (ctx) => {
      ctx.enemies.spawn("screamer", ctx.rng.range(-6, 6));
      for (let k = 0; k < 5; k++) ctx.enemies.spawn("runner", ctx.rng.range(-18, 18));
    },
  },
  8: {
    at: 0.44,
    name: "IRON TIDE",
    sub: "Armor and shields at the screening line — flank or break them",
    run: (ctx) => {
      for (let k = 0; k < 3; k++) ctx.enemies.spawn("armored", ctx.rng.range(-14, 14));
      for (const sx of [-8, 8]) ctx.enemies.spawn("shielded", sx + ctx.rng.range(-2, 2));
    },
  },
};

/** The pacing plan for a given night (1-based global level), used by the director
 *  and exposed for balance verification. Escalation is monotonic across the
 *  campaign; the alive-cap is CLAMPED so even nightmare's finale can't become an
 *  unwinnable solid wall (or a frame-rate cliff). */
export interface NightStats {
  night: number;
  act: number;
  maxAlive: number;
  len: number;
  startI: number;
  endI: number;
  lateTypes: string[];
}
export const MAX_ALIVE_CAP = 46;
export function nightStats(night: number, spawnRate: number): NightStats {
  const level = levelInfo(night);
  // Smooth, globally-monotonic escalation across all 9 levels — difficulty never
  // steps BACKWARD at an act boundary (the old per-act/per-level steps dipped the
  // alive-cap when a new act began). Per-act IDENTITY comes from the enemy mix,
  // not from the curve.
  const g = level.level - 1; // 0..8 global progress
  const sr = spawnRate;
  const maxAlive = Math.min(MAX_ALIVE_CAP, Math.round((PLAN.maxAlive + g * 2.6) * sr));
  const len = Math.round(PLAN.length + g * 3.8);
  const startI = (PLAN.startInterval * Math.pow(0.965, g)) / sr;
  const endI = (PLAN.endInterval * Math.pow(0.95, g)) / sr;
  const am = ACT_MIXES[level.act] ?? { early: PLAN.early, late: PLAN.late };
  return { night, act: level.act, maxAlive, len, startI, endI, lateTypes: am.late.map((m) => m.type) };
}

/**
 * Drives one night: a dusk→dawn clock plus an escalating spawn stream. Reports
 * progress (for the dawn ramp + HUD) and raises DAWN once the clock runs out
 * and the field clears.
 */
export class WaveDirector {
  elapsed = 0;
  done = false; // dawn reached
  private spawnTimer = 1.5;
  private clockDone = false;
  private fleeing = false;
  private bossSpawned = false;
  private signatureFired = false;
  private surgeFired = false;
  private preSurgeWarned = false;
  private preBossWarned = false;
  // Per-night escalation (night 1 = base; later nights are longer + thicker).
  private maxAlive: number;
  private len: number;
  private startI: number;
  private endI: number;
  private level: CampaignLevel;
  private early: Mix;
  private late: Mix;

  constructor(private ctx: Ctx) {
    const n = ctx.run.night;
    this.level = levelInfo(n);
    const am = ACT_MIXES[this.level.act] ?? { early: PLAN.early, late: PLAN.late };
    this.early = am.early;
    this.late = am.late;
    const s = nightStats(n, ctx.tuning.spawnRate);
    this.maxAlive = s.maxAlive;
    this.len = s.len;
    this.startI = s.startI;
    this.endI = s.endI;
  }

  get progress(): number {
    return clamp(this.elapsed / this.len, 0, 1);
  }

  get length(): number {
    return this.len;
  }

  update(dt: number): void {
    if (this.done) return;

    // Per-level signature threat (brute charge / spitter battery / etc.), themed
    // to the act. Boss levels have no entry — the boss is their mid-night event.
    // Only while the clock is still running — never as the night is ending.
    const sig = SIGNATURES[this.ctx.run.night];
    if (sig && !this.signatureFired && !this.clockDone && this.elapsed < this.len && this.progress > sig.at) {
      this.signatureFired = true;
      sig.run(this.ctx);
      this.ctx.events.emit("NOTICE", { text: sig.name, sub: sig.sub });
    }

    // Act finales: warn that something huge is coming, then spawn the boss with
    // enough time to reach the wall and be fought down.
    const boss = this.level.boss;
    if (boss && !this.preBossWarned && !this.bossSpawned && this.progress > boss.warnAt) {
      this.preBossWarned = true;
      this.ctx.events.emit("NOTICE", { text: "BOSS INBOUND", sub: boss.warning });
    }
    if (boss && !this.bossSpawned && this.progress > boss.at && this.elapsed < this.len - 24) {
      this.bossSpawned = true;
      this.ctx.enemies.spawn(boss.type, 0, boss.z);
      this.ctx.events.emit("MINIBOSS", { name: boss.name, sub: boss.intro });
    }

    // A clear lead-in before the dawn surge so the player can brace.
    if (!this.preSurgeWarned && !this.clockDone && this.elapsed < this.len && this.progress > 0.7) {
      this.preSurgeWarned = true;
      this.ctx.events.emit("NOTICE", { text: "⚠ THE HORDE IS MASSING", sub: "Everything left is throwing itself at the wall — hold!" });
    }
    // Dawn surge: a desperate wall of bodies in the final stretch (kicks earlier
    // and runs longer so you really feel the last stand).
    if (!this.surgeFired && !this.clockDone && this.elapsed < this.len && this.progress > 0.78) {
      this.surgeFired = true;
      this.ctx.events.emit("NOTICE", { text: "DAWN SURGE", sub: "Hold — first light is close!" });
      for (let k = 0; k < 6; k++) {
        const type = this.ctx.rng.weighted(["runner", "shambler", "crawler"], [3, 2, 2]);
        this.ctx.enemies.spawn(type, this.ctx.rng.range(-FIELD.wallHalf + 2, FIELD.wallHalf - 2));
      }
    }

    if (!this.clockDone) {
      this.elapsed += dt;
      if (this.elapsed >= this.len) {
        this.clockDone = true;
        this.fleeing = true;
        this.ctx.enemies.forceFlee();
        this.ctx.events.emit("SFX", { id: "dawn_chime" });
      } else {
        this.spawnTick(dt);
      }
    }

    // After the clock, dawn breaks once the field empties.
    if (this.fleeing && this.ctx.enemies.count === 0) {
      this.done = true;
      this.ctx.events.emit("DAWN", {});
    }
  }

  private spawnTick(dt: number): void {
    const p = this.progress;
    // The dawn surge lifts the alive cap and floods spawns.
    const cap = p > 0.78 ? this.maxAlive + 12 : this.maxAlive;
    if (this.ctx.enemies.count >= cap) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    // Interval tightens; the last stretch is a surge.
    let interval = lerp(this.startI, this.endI, p);
    if (p > 0.78) interval *= 0.4;
    this.spawnTimer = interval * this.ctx.rng.range(0.75, 1.25);

    const mix = p < 0.4 ? this.early : this.late;
    const type = this.ctx.rng.weighted(
      mix.map((m) => m.type),
      mix.map((m) => m.w)
    );
    const x = this.ctx.rng.range(-FIELD.wallHalf + 2, FIELD.wallHalf - 2);
    this.ctx.enemies.spawn(type, x);

    // Brutes/surge can arrive in small clusters late.
    if (p > 0.7 && this.ctx.rng.chance(0.3)) {
      const x2 = clamp(x + this.ctx.rng.range(-5, 5), -FIELD.wallHalf + 2, FIELD.wallHalf - 2);
      this.ctx.enemies.spawn(type === "brute" ? "shambler" : type, x2);
    }
  }
}
