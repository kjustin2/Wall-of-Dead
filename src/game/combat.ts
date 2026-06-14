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
    });
  }

  resetForNight(): void {
    this.playerDead = false;
  }

  damageZombie(z: Zombie, baseDmg: number, headshot: boolean, fromPlayer: boolean): void {
    const mult = fromPlayer ? this.ctx.adrenaline.damageMult() : 1;
    const dmg = baseDmg * mult * (headshot ? 1.9 : 1);
    const killed = z.hurt(dmg);
    const hy = headshot ? z.headY : 1.0;

    this.ctx.fx.burst(z.x, hy, z.z, headshot ? 16 : 8, PAL.blood, {
      speed: headshot ? 10 : 6,
      up: 5,
      life: 0.5,
      size: 6,
    });
    this.ctx.floaters.spawn(z.x, hy + 0.4, z.z, `${Math.round(dmg)}`, headshot ? "crit" : "hit");
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
      this.ctx.events.emit("ZOMBIE_KILLED", { x: z.x, z: z.z, kind: z.kind });
      this.ctx.events.emit("SFX", { id: "zombie_die", pan });
      if (fromPlayer) this.ctx.adrenaline.gain(headshot ? 15 : 10);
    } else if (fromPlayer) {
      this.ctx.adrenaline.gain(2);
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
