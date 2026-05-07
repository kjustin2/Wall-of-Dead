// Bloater: slow, melee, but explodes on death. Punishes "kill the closest
// thing" play — if a Bloater dies in your face, the AoE will hurt.

import { Zombie } from './Zombie.js';
import { events } from '../engine/EventBus.js';
import { PALETTE } from '../Config.js';

export const BLOATER_DEF = {
  id: 'bloater',
  className: 'Bloater',
  radius: 19,
  hp: 38,
  speed: 50,
  contactDmg: 6,
  attackRange: 30,
  attackCooldown: 0.95,
  scrapValue: 4,
  threatBudget: 3,
  paletteCore: PALETTE.bloaterBody,
  paletteOutline: PALETTE.zombieDark,
};

export class Bloater extends Zombie {
  constructor(x, y) {
    super(BLOATER_DEF, x, y);
    this.bubblePhase = Math.random() * Math.PI * 2;
    this._exploded = false;
  }

  takeDamage(amount) {
    super.takeDamage(amount);
    if (!this.alive && !this._exploded) {
      this._exploded = true;
      events.emit('AOE_EXPLOSION', {
        x: this.x, y: this.y,
        radius: 90,
        damage: 18,
        falloff: 0.5,
        source: 'bloater',
      });
    }
  }

  updateAI(dt, player, arena, ctx) {
    super.updateAI(dt, player, arena, ctx);
    this.bubblePhase += dt * 4;
  }

  drawBody(ctx) {
    const pulse = 1 + Math.sin(this.bubblePhase) * 0.06;
    ctx.fillStyle = BLOATER_DEF.paletteCore;
    ctx.strokeStyle = BLOATER_DEF.paletteOutline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Bubbling lumps
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + this.bubblePhase * 0.4;
      const lr = this.r * 0.45;
      const lx = Math.cos(a) * this.r * 0.5;
      const ly = Math.sin(a) * this.r * 0.5;
      ctx.fillStyle = '#88aa44';
      ctx.beginPath();
      ctx.arc(lx, ly, lr * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.uiDanger;
    ctx.beginPath();
    ctx.arc(this.r * 0.3, -this.r * 0.2, 1.6, 0, Math.PI * 2);
    ctx.arc(this.r * 0.3,  this.r * 0.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
