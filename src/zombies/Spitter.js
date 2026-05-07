// Spitter: ranged. Maintains a stand-off distance and lobs slow acid
// projectiles. Forces the player to circle-strafe or close-and-kill.

import { Zombie } from './Zombie.js';
import { events } from '../engine/EventBus.js';
import { PALETTE } from '../Config.js';
import { angleTo } from '../util/geom.js';

export const SPITTER_DEF = {
  id: 'spitter',
  className: 'Spitter',
  radius: 14,
  hp: 22,
  speed: 55,
  contactDmg: 4,
  attackRange: 290,         // preferred stand-off distance
  attackCooldown: 1.6,
  scrapValue: 3,
  threatBudget: 2,
  paletteCore: PALETTE.spitterBody,
  paletteOutline: PALETTE.zombieDark,
  spitDamage: 9,
  spitSpeed: 360,
  spitLife: 1.4,
  spitColor: '#aaff66',
};

export class Spitter extends Zombie {
  constructor(x, y) {
    super(SPITTER_DEF, x, y);
    this.windup = 0;             // counts up while preparing to spit
    this.windupMax = 0.7;
  }

  updateAI(dt, player, arena, ctx) {
    this.aim = angleTo(this.x, this.y, player.x, player.y);
    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const desired = SPITTER_DEF.attackRange;

    // Maintain stand-off — too close → back away, too far → close
    if (dist < desired - 30) {
      this.x -= Math.cos(this.aim) * this.speed * dt;
      this.y -= Math.sin(this.aim) * this.speed * dt;
      this.state = 'retreating';
    } else if (dist > desired + 30) {
      this.x += Math.cos(this.aim) * this.speed * dt;
      this.y += Math.sin(this.aim) * this.speed * dt;
      this.state = 'closing';
    } else {
      this.state = 'aiming';
    }

    // Attack cooldown / windup
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0) {
      this.windup += dt;
      if (this.windup >= this.windupMax) {
        this._spit(ctx, player);
        this.windup = 0;
        this.attackCooldown = SPITTER_DEF.attackCooldown;
      }
    }
  }

  _spit(ctx, player) {
    const speed = SPITTER_DEF.spitSpeed;
    // Lead the player slightly so a moving target isn't free
    const lead = 0.18;
    const tx = player.x + player.vx * lead;
    const ty = player.y + player.vy * lead;
    const a = angleTo(this.x, this.y, tx, ty);
    ctx.projectiles.spawn({
      x: this.x + Math.cos(a) * (this.r + 2),
      y: this.y + Math.sin(a) * (this.r + 2),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: 5,
      life: SPITTER_DEF.spitLife,
      damage: SPITTER_DEF.spitDamage,
      color: SPITTER_DEF.spitColor,
      source: 'zombie',
    });
    events.emit('SPITTER_FIRE', { x: this.x, y: this.y });
  }

  drawBody(ctx) {
    ctx.fillStyle = SPITTER_DEF.paletteCore;
    ctx.strokeStyle = SPITTER_DEF.paletteOutline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Bulbous head with glowing acid sac
    ctx.fillStyle = '#9cba50';
    ctx.beginPath();
    ctx.arc(this.r * 0.55, 0, this.r * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Acid glow when winding up (telegraph)
    if (this.windup > 0) {
      const t = Math.min(1, this.windup / this.windupMax);
      ctx.fillStyle = '#aaff66';
      ctx.globalAlpha = 0.25 + t * 0.6;
      ctx.beginPath();
      ctx.arc(this.r * 1.0, 0, 3 + t * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Eye
    ctx.fillStyle = PALETTE.uiDanger;
    ctx.beginPath();
    ctx.arc(this.r * 0.95, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
