import type { Ctx } from "./ctx";
import type { Zombie } from "./zombie";
import { PAL, FIELD } from "../config";
import { clamp } from "../core/math";

/**
 * The single funnel for all damage. Centralizing it keeps feedback consistent:
 * one place applies the adrenaline multiplier, spawns floaters + blood, plays
 * SFX, banks stats and feeds the meter. Systems call these — they never poke HP
 * directly.
 */
export class Combat {
  private playerDead = false;

  constructor(private ctx: Ctx) {
    // Wall damage bleeds the meter and rattles the screen a little.
    ctx.events.on("WALL_HIT", ({ dmg }) => {
      ctx.adrenaline.drain(dmg * 0.25);
      ctx.cam.addTrauma(Math.min(0.12, dmg * 0.01));
    });
    ctx.events.on("WALL_BREACH", () => {
      ctx.cam.addTrauma(0.4);
      ctx.stage.punch(0.35);
      ctx.adrenaline.drain(12);
      ctx.events.emit("SFX", { id: "wall_breach" });
      ctx.events.emit("TIME_HITSTOP", { s: 0.05 });
    });
  }

  resetForNight(): void {
    this.playerDead = false;
  }

  damageZombie(z: Zombie, baseDmg: number, headshot: boolean, fromPlayer: boolean): void {
    const mult = fromPlayer ? this.ctx.adrenaline.damageMult() : 1;
    // Crits (non-headshot) scale with the meter; weak points reward headshots on
    // the big targets (brute head, spitter sac).
    const crit = !headshot && fromPlayer && this.ctx.rng.chance(0.07 + this.ctx.adrenaline.value * 0.0011);
    const weak = headshot && (z.kind === "brute" || z.kind === "spitter") ? 1.35 : 1;
    const dmg = baseDmg * mult * (headshot ? 1.9 : 1) * (crit ? 1.6 : 1) * weak;
    const killed = z.hurt(dmg);
    const big = headshot || crit;
    const hy = headshot ? z.headY : 1.0;

    this.ctx.fx.burst(z.x, hy, z.z, headshot ? 16 : 8, PAL.blood, {
      speed: headshot ? 10 : 6,
      up: 5,
      life: 0.5,
      size: 6,
    });
    this.ctx.floaters.spawn(z.x, hy + 0.4, z.z, `${Math.round(dmg)}`, big ? "crit" : "hit");
    const pan = clamp(z.x / FIELD.wallHalf, -1, 1);
    this.ctx.events.emit("ZOMBIE_HIT", {
      x: z.x,
      y: hy,
      z: z.z,
      dmg,
      headshot,
      killed,
      heavy: z.heavy,
    });
    this.ctx.events.emit("SFX", { id: headshot ? "zombie_head" : "zombie_hit", pan });

    if (killed) {
      this.ctx.stats.kills++;
      if (headshot) this.ctx.stats.headshots++;
      this.ctx.fx.burst(z.x, 1.0, z.z, 24, PAL.blood, { speed: 12, up: 8, life: 0.7, size: 8 });
      this.ctx.decals.spawn(z.x, z.z, 0x4a0708, 1.1 + (z.heavy ? 1.4 : 0));
      // Dismemberment: a headshot/explosion pops chunks of gore upward.
      if (headshot) this.ctx.fx.burst(z.x, z.headY, z.z, 10, 0x6a1010, { speed: 9, up: 12, life: 0.9, size: 11 });
      // Gore chunks on every kill (more on big ones).
      this.ctx.fx.burst(z.x, z.headY * 0.7, z.z, big ? 12 : 6, 0x6a1010, { speed: big ? 11 : 7, up: 10, life: 0.9, size: big ? 11 : 8 });
      this.ctx.events.emit("ZOMBIE_KILLED", { x: z.x, z: z.z, kind: z.kind });
      this.ctx.events.emit("SFX", { id: "zombie_die", pan });
      // A brief crunch only on the meaty kills, so it reads as punch not lag.
      if (z.heavy || headshot) this.ctx.events.emit("TIME_HITSTOP", { s: 0.04 });
      if (fromPlayer) this.ctx.adrenaline.gain(headshot ? 15 : 10);
    } else if (fromPlayer) {
      this.ctx.adrenaline.gain(2);
      // Limb damage: a body hit can cripple (slow) a still-standing zombie.
      if (!headshot && this.ctx.rng.chance(0.12)) z.cripple();
    }
  }

  damagePlayer(dmg: number, dirX: number, dirZ: number): void {
    if (this.playerDead) return;
    this.ctx.player.hurt(dmg);
    this.ctx.adrenaline.drain(dmg * 0.6);
    this.ctx.cam.addTrauma(Math.min(0.5, 0.18 + dmg * 0.012));
    this.ctx.cam.kick(dirX, dirZ, 6);
    this.ctx.stage.punch(Math.min(0.7, 0.25 + dmg * 0.02));
    this.ctx.floaters.spawn(this.ctx.player.x, 2.2, this.ctx.player.z, `-${Math.round(dmg)}`, "warn");
    this.ctx.events.emit("PLAYER_HIT", { dmg, dirX, dirZ });
    this.ctx.events.emit("SFX", { id: "player_hurt" });
    if (this.ctx.player.hp <= 0) {
      this.playerDead = true;
      this.ctx.events.emit("PLAYER_DIED", {});
    }
  }
}
