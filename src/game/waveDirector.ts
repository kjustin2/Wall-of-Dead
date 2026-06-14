import type { Ctx } from "./ctx";
import { FIELD, RUN } from "../config";
import { clamp, lerp } from "../core/math";

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
  length: RUN.nightLength,
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
  ],
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
  private tankSpawned = false;
  // Per-night escalation (night 1 = base; later nights are longer + thicker).
  private maxAlive: number;
  private len: number;
  private startI: number;
  private endI: number;

  constructor(private ctx: Ctx) {
    const n = ctx.run.night;
    this.maxAlive = PLAN.maxAlive + (n - 1) * 6;
    this.len = PLAN.length + (n - 1) * 8;
    this.startI = PLAN.startInterval * Math.pow(0.92, n - 1);
    this.endI = PLAN.endInterval * Math.pow(0.9, n - 1);
  }

  get progress(): number {
    return clamp(this.elapsed / this.len, 0, 1);
  }

  get length(): number {
    return this.len;
  }

  update(dt: number): void {
    if (this.done) return;

    // Mini-boss: one Tank crashes the surge (but not in the final moments).
    if (!this.tankSpawned && this.progress > 0.85 && this.elapsed < this.len - 4) {
      this.tankSpawned = true;
      this.ctx.enemies.spawn("tank", this.ctx.rng.range(-6, 6));
      this.ctx.events.emit("MINIBOSS", { name: "TANK" });
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
    if (this.ctx.enemies.count >= this.maxAlive) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const p = this.progress;
    // Interval tightens; the last 12% is a surge.
    let interval = lerp(this.startI, this.endI, p);
    if (p > 0.88) interval *= 0.5;
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
