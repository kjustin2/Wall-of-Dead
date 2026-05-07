// Brute: mini-boss elite. Heavy HP, slow chase punctuated by a charge
// attack with a clear telegraph ring. Charging deals double damage.

import { Zombie } from './Zombie.js';
import { events } from '../engine/EventBus.js';
import { PALETTE } from '../Config.js';
import { angleTo } from '../util/geom.js';

export const BRUTE_DEF = {
  id: 'brute',
  className: 'Brute',
  radius: 24,
  hp: 110,
  speed: 50,
  contactDmg: 14,
  attackRange: 36,
  attackCooldown: 1.4,
  scrapValue: 9,
  threatBudget: 5,
  paletteCore: PALETTE.bruteBody,
  paletteOutline: PALETTE.zombieDark,
  chargeSpeed: 360,
  chargeDuration: 0.55,
  chargeTelegraph: 0.7,
  chargeDmg: 22,
};

export class Brute extends Zombie {
  constructor(x, y) {
    super(BRUTE_DEF, x, y);
    this.chargePhase = 'idle';      // 'idle' | 'telegraph' | 'charging' | 'cooldown'
    this.phaseT = 0;
    this.chargeAngle = 0;
    this.chargeCD = 3.5;            // initial cooldown so charge doesn't fire immediately
  }

  updateAI(dt, player, arena, ctx) {
    this.aim = angleTo(this.x, this.y, player.x, player.y);

    if (this.chargePhase === 'telegraph') {
      this.phaseT += dt;
      if (this.phaseT >= BRUTE_DEF.chargeTelegraph) {
        this.chargePhase = 'charging';
        this.phaseT = 0;
        this.chargeAngle = this.aim;
      }
      // Stand still during telegraph
      return;
    }

    if (this.chargePhase === 'charging') {
      this.phaseT += dt;
      const speed = BRUTE_DEF.chargeSpeed;
      this.x += Math.cos(this.chargeAngle) * speed * dt;
      this.y += Math.sin(this.chargeAngle) * speed * dt;
      // Charge contact
      const dx = player.x - this.x, dy = player.y - this.y;
      if (dx * dx + dy * dy <= (player.r + this.r) * (player.r + this.r)) {
        player.takeDamage(BRUTE_DEF.chargeDmg);
        events.emit('SCREEN_SHAKE', { duration: 0.16, intensity: 0.5 });
        this.chargePhase = 'cooldown';
        this.phaseT = 0;
        this.chargeCD = 4.2;
        return;
      }
      if (this.phaseT >= BRUTE_DEF.chargeDuration) {
        this.chargePhase = 'cooldown';
        this.phaseT = 0;
        this.chargeCD = 4.0;
      }
      return;
    }

    if (this.chargePhase === 'cooldown') {
      this.phaseT += dt;
      if (this.phaseT >= 0.6) this.chargePhase = 'idle';
    }

    // Idle: chase + decide whether to wind up a charge.
    super.updateAI(dt, player, arena, ctx);
    this.chargeCD -= dt;
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    if (this.chargeCD <= 0 && dist > 120 && dist < 360) {
      this.chargePhase = 'telegraph';
      this.phaseT = 0;
    }
  }

  drawBody(ctx) {
    // Telegraph ring while winding up
    if (this.chargePhase === 'telegraph') {
      const t = this.phaseT / BRUTE_DEF.chargeTelegraph;
      ctx.save();
      ctx.rotate(-this.aim);            // un-rotate so we draw aligned to world
      ctx.strokeStyle = PALETTE.uiDanger;
      ctx.globalAlpha = 0.4 + t * 0.5;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 8 + t * 10, 0, Math.PI * 2);
      ctx.stroke();
      // Aim cone
      ctx.globalAlpha = 0.18 + t * 0.35;
      ctx.fillStyle = PALETTE.uiDanger;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 220, this.aim - 0.18, this.aim + 0.18);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.fillStyle = BRUTE_DEF.paletteCore;
    ctx.strokeStyle = BRUTE_DEF.paletteOutline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Big shoulders
    ctx.fillStyle = '#5a7a32';
    ctx.beginPath();
    ctx.ellipse(-this.r * 0.3, -this.r * 0.55, this.r * 0.4, this.r * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(-this.r * 0.3,  this.r * 0.55, this.r * 0.4, this.r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = '#8aaa48';
    ctx.beginPath();
    ctx.arc(this.r * 0.4, 0, this.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Eyes
    ctx.fillStyle = PALETTE.uiDanger;
    ctx.beginPath();
    ctx.arc(this.r * 0.7, -this.r * 0.18, 2, 0, Math.PI * 2);
    ctx.arc(this.r * 0.7,  this.r * 0.18, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
