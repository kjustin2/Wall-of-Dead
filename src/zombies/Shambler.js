// Shambler: slow tank baseline. Defines the "default zombie" feel — every
// other type tunes against this baseline.

import { Zombie } from './Zombie.js';
import { PALETTE } from '../Config.js';

export const SHAMBLER_DEF = {
  id: 'shambler',
  className: 'Shambler',
  radius: 16,
  hp: 32,
  speed: 70,
  contactDmg: 8,
  attackRange: 26,
  attackCooldown: 0.85,
  scrapValue: 2,
  threatBudget: 1,
  paletteCore: PALETTE.shamblerBody,
  paletteOutline: PALETTE.zombieDark,
};

export class Shambler extends Zombie {
  constructor(x, y) {
    super(SHAMBLER_DEF, x, y);
  }

  drawBody(ctx) {
    // Hunched silhouette: main body circle + smaller "head" lobe forward
    ctx.fillStyle = SHAMBLER_DEF.paletteCore;
    ctx.strokeStyle = SHAMBLER_DEF.paletteOutline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Head
    ctx.fillStyle = '#7aa838';
    ctx.beginPath();
    ctx.arc(this.r * 0.5, 0, this.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Eyes (dim red points)
    ctx.fillStyle = PALETTE.uiDanger;
    ctx.beginPath();
    ctx.arc(this.r * 0.85, -this.r * 0.18, 1.5, 0, Math.PI * 2);
    ctx.arc(this.r * 0.85,  this.r * 0.18, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
