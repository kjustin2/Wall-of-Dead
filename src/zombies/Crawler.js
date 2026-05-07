// Crawler: tiny + fast + low-HP. The hard-to-click swarm filler. Often
// summoned by Screamers or boss phases.

import { Zombie } from './Zombie.js';
import { PALETTE } from '../Config.js';

export const CRAWLER_DEF = {
  id: 'crawler',
  className: 'Crawler',
  radius: 8,
  hp: 7,
  speed: 195,
  contactDmg: 3,
  attackRange: 16,
  attackCooldown: 0.6,
  scrapValue: 1,
  threatBudget: 1,
  paletteCore: PALETTE.crawlerBody,
  paletteOutline: PALETTE.zombieDark,
};

export class Crawler extends Zombie {
  constructor(x, y) {
    super(CRAWLER_DEF, x, y);
    this.scuttleT = Math.random() * Math.PI * 2;
  }

  updateAI(dt, player, arena, ctx) {
    super.updateAI(dt, player, arena, ctx);
    this.scuttleT += dt * 18;
  }

  drawBody(ctx) {
    const wig = Math.sin(this.scuttleT) * 1.4;
    ctx.fillStyle = CRAWLER_DEF.paletteCore;
    ctx.strokeStyle = CRAWLER_DEF.paletteOutline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, wig, this.r, this.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Limbs
    ctx.strokeStyle = '#1a1a14';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const a = (i + 1) * 0.7 + Math.sin(this.scuttleT + i) * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a + Math.PI / 2) * this.r * 1.3, Math.sin(a + Math.PI / 2) * this.r * 1.3);
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(-a + Math.PI / 2) * this.r * 1.3, Math.sin(-a + Math.PI / 2) * this.r * 1.3);
      ctx.stroke();
    }
    // Glowing eye
    ctx.fillStyle = PALETTE.uiDanger;
    ctx.beginPath();
    ctx.arc(this.r * 0.5, wig, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
