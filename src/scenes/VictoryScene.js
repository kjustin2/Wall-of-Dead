import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { meta } from '../engine/MetaProgress.js';
import { PALETTE } from '../Config.js';

// Reached the freedom zone. Records the run, awards meta scrap,
// unlocks the next starter weapon if any are still locked.

const STARTER_UNLOCK_ORDER = ['smg', 'shotgun']; // pistol always unlocked

export class VictoryScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.t = 0;
    this.recap = null;
    this.unlockedThisRun = null;
  }

  enter() {
    this.t = 0;
    const kills = runState.player.kills | 0;
    const scrap = runState.player.scrap | 0;
    meta.recordRun({ won: true, nightReached: runState.nightNum, kills, scrapEarned: scrap });
    this.unlockedThisRun = null;
    for (const id of STARTER_UNLOCK_ORDER) {
      if (meta.unlockStarter(id)) { this.unlockedThisRun = id; break; }
    }
    this.recap = { kills, scrap, nights: runState.nightNum };
    runState.end('won');
  }

  update(dt) {
    this.t += dt;
    if (this.t > 0.6 && (this.input.consumeClick() || this.input.consumeKey('enter') || this.input.consumeKey(' '))) {
      events.emit('SCENE_CHANGE', { name: 'intro' });
    }
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Sunrise gradient — dark to gold
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgba(255,140,40,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.uiAccent;
    ctx.font = 'bold 56px monospace';
    ctx.fillText('FREEDOM ZONE', w / 2, h * 0.30);
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = '14px monospace';
    ctx.fillText('the wall holds. you make it through.', w / 2, h * 0.36);

    if (this.recap) {
      ctx.fillStyle = PALETTE.uiText;
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`${this.recap.nights} nights survived`, w / 2, h * 0.52);
      ctx.fillText(`${this.recap.kills} kills`,            w / 2, h * 0.56);
      ctx.fillText(`${this.recap.scrap} scrap recovered`,  w / 2, h * 0.60);
    }

    if (this.unlockedThisRun) {
      ctx.fillStyle = PALETTE.uiAccent;
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`UNLOCKED: ${this.unlockedThisRun.toUpperCase()}`, w / 2, h * 0.72);
    }

    if (this.t > 0.5) {
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '11px monospace';
      ctx.fillText('click / enter / space to continue', w / 2, h - 30);
    }
  }

  engineState() { return 'menu'; }
}
