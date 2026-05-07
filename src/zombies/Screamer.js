// Screamer: slow, weak, but every N seconds emits a scream that spawns
// a couple of runners nearby. Priority target — letting one live pads
// the whole wave.

import { Zombie } from './Zombie.js';
import { events } from '../engine/EventBus.js';
import { PALETTE } from '../Config.js';

export const SCREAMER_DEF = {
  id: 'screamer',
  className: 'Screamer',
  radius: 14,
  hp: 18,
  speed: 60,
  contactDmg: 3,
  attackRange: 26,
  attackCooldown: 1.0,
  scrapValue: 5,
  threatBudget: 4,
  paletteCore: PALETTE.screamerBody,
  paletteOutline: PALETTE.zombieDark,
  screamInterval: 7.5,
  spawnsPerScream: 2,
};

export class Screamer extends Zombie {
  constructor(x, y) {
    super(SCREAMER_DEF, x, y);
    this.screamCD = 4.0;            // delay before first scream so player can hear them spawn before reinforcements arrive
    this.screamingT = 0;
  }

  updateAI(dt, player, arena, ctx) {
    super.updateAI(dt, player, arena, ctx);
    this.screamCD -= dt;
    if (this.screamingT > 0) {
      this.screamingT = Math.max(0, this.screamingT - dt);
    }
    if (this.screamCD <= 0) {
      this.screamCD = SCREAMER_DEF.screamInterval;
      this.screamingT = 0.6;
      events.emit('SCREAMER_CALL', {
        x: this.x, y: this.y,
        count: SCREAMER_DEF.spawnsPerScream,
      });
    }
  }

  drawBody(ctx) {
    const screaming = this.screamingT > 0;
    if (screaming) {
      const t = this.screamingT / 0.6;
      ctx.strokeStyle = '#ffaa33';
      ctx.globalAlpha = t * 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 12 + (1 - t) * 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = SCREAMER_DEF.paletteCore;
    ctx.strokeStyle = SCREAMER_DEF.paletteOutline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Gaping head — wider when screaming
    ctx.fillStyle = '#1a1208';
    const mouthW = screaming ? this.r * 0.55 : this.r * 0.25;
    ctx.beginPath();
    ctx.ellipse(this.r * 0.6, 0, mouthW, this.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = PALETTE.uiWarn;
    ctx.beginPath();
    ctx.arc(this.r * 0.4, -this.r * 0.4, 1.6, 0, Math.PI * 2);
    ctx.arc(this.r * 0.4,  this.r * 0.4, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
