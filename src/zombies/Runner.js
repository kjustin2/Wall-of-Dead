// Runner: fast, fragile. Dies in one pistol shot, but covers ground
// quickly and forces the player to retreat or shotgun-clear.

import { Zombie } from './Zombie.js';
import { PALETTE } from '../Config.js';

export const RUNNER_DEF = {
  id: 'runner',
  className: 'Runner',
  radius: 12,
  hp: 14,
  speed: 165,
  contactDmg: 6,
  attackRange: 22,
  attackCooldown: 0.7,
  scrapValue: 1,
  threatBudget: 1,
  paletteCore: PALETTE.runnerBody,
  paletteOutline: PALETTE.zombieDark,
};

export class Runner extends Zombie {
  constructor(x, y) {
    super(RUNNER_DEF, x, y);
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  updateAI(dt, player, arena, ctx) {
    super.updateAI(dt, player, arena, ctx);
    this.bobPhase += dt * 12;
  }

  drawBody(ctx) {
    const bob = Math.sin(this.bobPhase) * 1.5;
    ctx.fillStyle = RUNNER_DEF.paletteCore;
    ctx.strokeStyle = RUNNER_DEF.paletteOutline;
    ctx.lineWidth = 1.5;
    // Slim body
    ctx.beginPath();
    ctx.ellipse(0, bob, this.r * 0.8, this.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Head — bigger relative to body
    ctx.fillStyle = '#9cd048';
    ctx.beginPath();
    ctx.arc(this.r * 0.5, bob * 0.5, this.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Glowing eyes
    ctx.fillStyle = PALETTE.uiDanger;
    ctx.beginPath();
    ctx.arc(this.r * 0.85, bob * 0.5 - this.r * 0.16, 1.4, 0, Math.PI * 2);
    ctx.arc(this.r * 0.85, bob * 0.5 + this.r * 0.16, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
