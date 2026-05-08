// Base zombie. Subclasses override drawBody() and may extend updateAI() for
// special behaviors (charge, ranged spit, scream summon, etc.).
//
// State machine:
//   spawning → chasing → attacking ⇄ chasing → dying
// "spawning" gives a brief invuln + fade-in so wave spawns don't punish the
// player for standing on a spawn point.

import { Entity } from '../core/Entity.js';
import { events } from '../engine/EventBus.js';
import { PALETTE } from '../Config.js';
import { distSq, angleTo } from '../util/geom.js';

export class Zombie extends Entity {
  constructor(def, x, y) {
    super(x, y, def.radius);
    this.def = def;
    this.id = def.id;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.speed = def.speed;
    this.contactDmg = def.contactDmg;
    this.attackRange = def.attackRange;
    this.attackCooldown = 0;
    this.attackInterval = def.attackCooldown;
    this.scrapValue = def.scrapValue;
    this.spawnTimer = 0.45;        // brief fade-in / invuln window
    this.hitFlash = 0;
    this.aim = 0;
    this.state = 'spawning';
    // Knockback velocity in px/s. Applied each frame and decayed
    // multiplicatively before arena.clamp so walls still resolve.
    this.knockVx = 0;
    this.knockVy = 0;
  }

  takeDamage(amount, fromX = 0, fromY = 0, force = 0) {
    if (this.spawnTimer > 0) return;          // invuln during spawn-in
    super.takeDamage(amount);
    this.hitFlash = 0.22;
    if (force > 0) {
      const dx = this.x - fromX, dy = this.y - fromY;
      const len = Math.hypot(dx, dy) || 1;
      // Heavier zombies (Brute, Bloater, Boss) shrug more knockback off.
      const massScale = 32 / Math.max(12, this.def.hp);
      const f = force * massScale;
      this.knockVx += (dx / len) * f;
      this.knockVy += (dy / len) * f;
    }
  }

  // Default AI: chase the player; melee when in range. Subclasses override.
  updateAI(dt, player, arena, ctx) {
    this.aim = angleTo(this.x, this.y, player.x, player.y);
    const dist = Math.hypot(player.x - this.x, player.y - this.y);

    if (dist > this.attackRange) {
      this.state = 'chasing';
      this.x += Math.cos(this.aim) * this.speed * dt;
      this.y += Math.sin(this.aim) * this.speed * dt;
    } else {
      this.state = 'attacking';
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        player.takeDamage(this.contactDmg);
        this.attackCooldown = this.attackInterval;
      }
    }
  }

  update(dt, ctx) {
    if (this.spawnTimer > 0) {
      this.spawnTimer = Math.max(0, this.spawnTimer - dt);
      return; // no movement until fully spawned
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.updateAI(dt, ctx.player, ctx.arena, ctx);

    // Knockback applied AFTER AI so a hit visibly shoves them mid-chase.
    // Decay is exponential per frame; with dt≈1/60 the multiplier ~0.78
    // drains a 240 px/s shotgun shove to <10 px/s in ~0.25s.
    if (this.knockVx !== 0 || this.knockVy !== 0) {
      this.x += this.knockVx * dt;
      this.y += this.knockVy * dt;
      const decay = Math.pow(0.000012, dt);   // ~0.78 at 60fps
      this.knockVx *= decay;
      this.knockVy *= decay;
      if (Math.abs(this.knockVx) < 4) this.knockVx = 0;
      if (Math.abs(this.knockVy) < 4) this.knockVy = 0;
    }

    ctx.arena.clamp(this);
  }

  // Subclasses override this to draw body shape; outer wrapper handles the
  // hit flash and spawn fade so each subclass doesn't repeat that code.
  drawBody(ctx) {
    // Default: green circle
    ctx.fillStyle = this.def.paletteCore || PALETTE.shamblerBody;
    ctx.strokeStyle = this.def.paletteOutline || PALETTE.zombieDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);
    if (this.spawnTimer > 0) {
      ctx.globalAlpha = 1 - (this.spawnTimer / 0.45);
      // Spawn ring telegraph
      ctx.strokeStyle = PALETTE.uiDanger;
      ctx.globalAlpha = (this.spawnTimer / 0.45) * 0.6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1 - (this.spawnTimer / 0.45);
    }
    this.drawBody(ctx);
    if (this.hitFlash > 0) {
      ctx.globalAlpha = this.hitFlash / 0.22 * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
