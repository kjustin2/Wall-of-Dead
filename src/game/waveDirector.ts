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

// Headline threats rotate through the campaign so ordinary levels still have
// memorable spikes between act bosses.
interface Signature {
  at: number; // progress to fire
  name: string;
  sub: string;
  run: (ctx: Ctx) => void;
}
const SIGNATURES: Record<number, Signature> = {
  1: {
    at: 0.5,
    name: "BRUTE CHARGE",
    sub: "Heavies are coming — make room",
    run: (ctx) => {
      for (let k = 0; k < 2; k++) ctx.enemies.spawn("brute", ctx.rng.range(-10, 10));
    },
  },
  2: {
    at: 0.42,
    name: "SPITTER BATTERY",
    sub: "Acid from range — watch the wall",
    run: (ctx) => {
      for (const sx of [-16, 0, 16]) ctx.enemies.spawn("spitter", sx + ctx.rng.range(-3, 3));
    },
  },
  3: {
    at: 0.45,
    name: "HOWLING PACK",
    sub: "A screamer's whipping them into a sprint — drop it fast",
    run: (ctx) => {
      ctx.enemies.spawn("screamer", ctx.rng.range(-6, 6));
      for (let k = 0; k < 5; k++) ctx.enemies.spawn("runner", ctx.rng.range(-18, 18));
    },
  },
  4: {
    at: 0.45,
    name: "IRON TIDE",
    sub: "Armor and shields — flank them or break the line",
    run: (ctx) => {
      for (let k = 0; k < 3; k++) ctx.enemies.spawn("armored", ctx.rng.range(-14, 14));
      for (const sx of [-8, 8]) ctx.enemies.spawn("shielded", sx + ctx.rng.range(-2, 2));
    },
  },
  5: {
    at: 0.34,
    name: "THE GATE WON'T HOLD",
    sub: "Haven's wall is buckling — everything is coming",
    run: (ctx) => {
      for (let k = 0; k < 4; k++) {
        const t = ctx.rng.weighted(["runner", "brute", "armored"], [3, 2, 2]);
        ctx.enemies.spawn(t, ctx.rng.range(-18, 18));
      }
    },
  },
};

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

  constructor(private ctx: Ctx) {
    const n = ctx.run.night;
    this.level = levelInfo(n);
    const actStep = this.level.act - 1;
    const levelStep = this.level.levelInAct - 1;
    const sr = ctx.tuning.spawnRate;
    this.maxAlive = Math.round((PLAN.maxAlive + actStep * 7 + levelStep * 4) * sr);
    this.len = PLAN.length + actStep * 10 + levelStep * 5;
    this.startI = (PLAN.startInterval * Math.pow(0.92, actStep + levelStep * 0.65)) / sr;
    this.endI = (PLAN.endInterval * Math.pow(0.9, actStep + levelStep * 0.7)) / sr;
  }

  get progress(): number {
    return clamp(this.elapsed / this.len, 0, 1);
  }

  get length(): number {
    return this.len;
  }

  update(dt: number): void {
    if (this.done) return;

    // Per-night signature threat (brute charge / spitter battery / etc.).
    // Only while the clock is still running — never as the night is ending.
    const sig = SIGNATURES[this.ctx.run.night] ?? SIGNATURES[((this.ctx.run.night - 1) % 5) + 1];
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

    const mix = p < 0.4 ? PLAN.early : PLAN.late;
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
