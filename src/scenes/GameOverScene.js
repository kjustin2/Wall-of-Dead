// Death screen. Shows how you fell and how far you got, then R restarts.

import { Scene } from './Scene.js';
import { VIEW, PAL } from '../Config.js';
import { drawVignette } from '../game/Backdrop.js';

export class GameOverScene extends Scene {
  enter() { this.t = 0; this.audio.ambient.stop(); }

  update(dt) {
    this.t += dt;
    if (this.t > 0.6 && (this.input.consumeKey('r') || this.input.consumeKey(' ') || this.input.consumeClick())) {
      this.audio.play('ui_confirm');
      this.game.toTitle();
    }
  }

  render(ctx) {
    ctx.fillStyle = '#0a0406';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    // Slow red bleed.
    const g = ctx.createRadialGradient(VIEW.W / 2, VIEW.H / 2, 60, VIEW.W / 2, VIEW.H / 2, 600);
    g.addColorStop(0, `rgba(90,8,10,${0.25 + 0.1 * Math.sin(this.t)})`);
    g.addColorStop(1, 'rgba(20,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    drawVignette(ctx, 0.7);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#b0201c';
    ctx.font = 'bold 72px monospace';
    ctx.fillText('OVERRUN', VIEW.W / 2, 280);

    ctx.fillStyle = PAL.hud;
    ctx.font = '17px monospace';
    ctx.fillText(this.run.deathReason || 'The wall did not hold.', VIEW.W / 2, 330);

    const s = this.run.stats;
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '14px monospace';
    ctx.fillText(`Nights survived: ${s.nightsSurvived}     Dead put down: ${s.kills}`, VIEW.W / 2, 372);

    if (this.t > 0.6) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      ctx.fillStyle = `rgba(207,232,208,${0.4 + pulse * 0.5})`;
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Press R to try again', VIEW.W / 2, 450);
    }
  }
}
