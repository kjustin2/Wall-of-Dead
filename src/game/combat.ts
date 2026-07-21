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
    ctx.events.on("WALL_BREACH", ({ x }) => {
      ctx.cam.addTrauma(0.4);
      ctx.stage.punch(0.35);
      ctx.adrenaline.drain(12);
      ctx.events.emit("SFX", { id: "wall_breach" });
      ctx.events.emit("TIME_HITSTOP", { s: 0.05 });
      // Give the breach a LOCATION: a hot white→orange burst at the rupture plus a
      // persistent dark stain blooming from it (paired with the breach sting). The
      // segment itself also flashes hot (wall.update) before settling to rubble.
      ctx.fx.burst(x, 1.2, FIELD.wallZ, 30, 0xfff1d0, { speed: 12, up: 9, life: 0.5, size: 9 });
      ctx.fx.burst(x, 0.8, FIELD.wallZ, 18, 0xff7a2a, { speed: 9, up: 5, life: 0.8, size: 11 });
      ctx.decals.spawn(x, FIELD.wallZ, 0x1a0d0a, 2.4);
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
    let dmg = baseDmg * mult * (headshot ? 1.9 : 1) * (crit ? 1.6 : 1) * weak;
    // Riot shield soaks frontal body shots — headshots bypass it (aim high).
    if (z.shielded && !headshot) {
      const before = z.shield;
      dmg = z.chipShield(dmg);
      this.ctx.fx.burst(z.x, 1.1, z.z, 5, 0x9fb4c8, { speed: 6, up: 3, life: 0.3, size: 5 });
      // A loud clang on the BREAK; a light metallic clink as rounds chip the plate
      // (throttled so a shotgun's 9 pellets don't stack into a rattle).
      if (before > 0 && z.shield <= 0) {
        this.ctx.events.emit("SFX", { id: "shield_break", pan: clamp(z.x / FIELD.wallHalf, -1, 1) });
      } else if (z.shield > 0 && this.ctx.rng.chance(0.5)) {
        this.ctx.events.emit("SFX", { id: "shield_chip", pan: clamp(z.x / FIELD.wallHalf, -1, 1) });
      }
    }
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
      // Overkill scaling: a round that vastly exceeds the target's HP erupts; a
      // chip that just finishes it spatters lightly. So a rifle slug into a
      // shambler bursts and a pistol tap doesn't — the kill reads its own lethality.
      const overkill = clamp(dmg / Math.max(8, z.maxHp), 0.25, 2.2);
      const goreN = Math.round((13 + 13 * overkill) * (z.heavy ? 1.3 : 1));
      this.ctx.fx.burst(z.x, 1.0, z.z, goreN, PAL.blood, { speed: 9 + 6 * overkill, up: 8, life: 0.7, size: 7 + 3 * overkill });
      this.ctx.decals.spawn(z.x, z.z, 0x4a0708, 1.0 + 0.5 * overkill + (z.heavy ? 1.4 : 0));
      // Dismemberment: a headshot/explosion pops chunks of gore upward (more on overkill).
      if (headshot) this.ctx.fx.burst(z.x, z.headY, z.z, Math.round(8 + 6 * overkill), 0x6a1010, { speed: 9, up: 12, life: 0.9, size: 11 });
      // Gore chunks on every kill (more on big ones).
      this.ctx.fx.burst(z.x, z.headY * 0.7, z.z, big ? 12 : 6, 0x6a1010, { speed: big ? 11 : 7, up: 10, life: 0.9, size: big ? 11 : 8 });
      this.ctx.events.emit("ZOMBIE_KILLED", { x: z.x, z: z.z, kind: z.kind });
      // A short, dry bone-crack just before the wet collapse on a headshot kill.
      if (headshot) this.ctx.events.emit("SFX", { id: "headcrack", pan });
      this.ctx.events.emit("SFX", { id: "zombie_die", pan });
      // A brief crunch only on the meaty kills, so it reads as punch not lag.
      if (z.heavy || headshot) this.ctx.events.emit("TIME_HITSTOP", { s: 0.04 });
      if (fromPlayer) this.ctx.adrenaline.gain(headshot ? 15 : 10);
      if (z.kind === "exploder") this.explode(z.x, z.z);
    } else if (fromPlayer) {
      this.ctx.adrenaline.gain(2);
      // Limb damage: a body hit can cripple (slow) a still-standing zombie.
      if (!headshot && this.ctx.rng.chance(0.12)) z.cripple();
    }
  }

  /** Exploder death: a gas burst that chips the wall, hurts the player if close,
   * and chain-damages nearby zombies. */
  private explode(x: number, z: number): void {
    const GAS = 0x9bd83a;
    this.ctx.fx.burst(x, 1.0, z, 28, GAS, { speed: 12, up: 7, life: 0.7, size: 10 });
    this.ctx.fx.burst(x, 0.6, z, 16, 0x4a5a1a, { speed: 8, up: 4, life: 1.1, size: 13 });
    this.ctx.cam.addTrauma(0.22);
    this.ctx.stage.punch(0.3);
    this.ctx.events.emit("SFX", { id: "acid_hit", pan: clamp(x / FIELD.wallHalf, -1, 1) });
    // Chip the wall under the blast.
    if (!this.ctx.wall.isBrokenAt(x)) this.ctx.wall.damageAt(x, 26);
    // Splash nearby standing zombies (direct hurt to avoid recursive gore spam,
    // but still credit chain kills so wave/kill counts stay correct).
    const R2 = 3.6 * 3.6;
    for (const o of this.ctx.enemies.alive) {
      if (o.kind === "exploder" || !o.killable) continue;
      const dx = o.x - x;
      const dz = o.z - z;
      if (dx * dx + dz * dz < R2 && o.hurt(22)) {
        this.ctx.stats.kills++;
        this.ctx.fx.burst(o.x, 1.0, o.z, 14, PAL.blood, { speed: 9, up: 6, life: 0.6, size: 7 });
        this.ctx.decals.spawn(o.x, o.z, 0x4a0708, 1.1);
        this.ctx.events.emit("ZOMBIE_KILLED", { x: o.x, z: o.z, kind: o.kind });
      }
    }
    // Splash the player if they're in range.
    const p = this.ctx.player;
    const pdx = p.x - x;
    const pdz = p.z - z;
    if (p.alive && pdx * pdx + pdz * pdz < 5 * 5) {
      const d = Math.hypot(pdx, pdz) || 1;
      this.damagePlayer(14, pdx / d, pdz / d);
    }
  }

  damagePlayer(dmgIn: number, dirX: number, dirZ: number): void {
    if (this.playerDead) return;
    const dmg = dmgIn * this.ctx.tuning.enemyDmg;
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
