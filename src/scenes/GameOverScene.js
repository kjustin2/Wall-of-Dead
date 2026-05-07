import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { meta } from '../engine/MetaProgress.js';
import { PALETTE } from '../Config.js';

// End-of-run summary on death. Records the run to MetaProgress and resets
// the in-progress sessionStorage so CONTINUE doesn't offer a dead run.

export class GameOverScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.t = 0;
    this.recap = null;
  }

  enter() {
    this.t = 0;
    if (runState.active) {
      const kills = runState.player.kills | 0;
      const scrap = runState.player.scrap | 0;
      meta.recordRun({ won: false, nightReached: runState.nightNum, kills, scrapEarned: Math.floor(scrap / 4) });
      this.recap = { kills, scrap, nights: runState.nightNum };
      runState.end('died');
    } else {
      this.recap = null;
    }
  }

  update(dt) {
    this.t += dt;
    if (this.t > 0.6 && (this.input.consumeClick()
        || this.input.consumeKey('r') || this.input.consumeKey('enter') || this.input.consumeKey(' '))) {
      events.emit('SCENE_CHANGE', { name: 'intro' });
    }
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = '#000';
    ctx.globalAlpha = Math.min(0.88, this.t * 1.4);
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    if (this.t > 0.4) {
      ctx.fillStyle = PALETTE.uiDanger;
      ctx.font = 'bold 56px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('YOU DIED', w / 2, h * 0.36);

      if (this.recap) {
        ctx.fillStyle = PALETTE.uiText;
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`${this.recap.nights} nights survived`, w / 2, h * 0.50);
        ctx.fillText(`${this.recap.kills} kills`,            w / 2, h * 0.54);
        ctx.fillText(`${Math.floor(this.recap.scrap / 4)} scrap salvaged`, w / 2, h * 0.58);
      }

      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '12px monospace';
      ctx.fillText('click / R / enter to return to title', w / 2, h - 30);
    }
  }

  engineState() { return 'menu'; }
}
