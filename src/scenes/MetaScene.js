import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { meta } from '../engine/MetaProgress.js';
import { PALETTE } from '../Config.js';

// Read-only browser of meta progress. Esc/click to return.

export class MetaScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
  }

  update() {
    if (this.input.consumeClick() || this.input.consumeKey('escape') || this.input.consumeKey('enter')) {
      events.emit('SCENE_CHANGE', { name: 'intro' });
    }
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 28px monospace';
    ctx.fillText('SURVIVOR LOG', w / 2, 60);

    const s = meta.state;
    const lines = [
      ['runs',       `${s.totalRuns}`],
      ['wins',       `${s.totalWins}`],
      ['best night', `${s.bestNight}`],
      ['total kills', `${s.totalKills}`],
      ['scrap',      `${s.scrap}`],
      ['unlocked weapons', s.unlockedWeapons.join(', ')],
      ['unlocked starters', s.unlockedStarters.join(', ')],
    ];
    ctx.font = '14px monospace';
    let y = 130;
    for (const [k, v] of lines) {
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.uiDim;
      ctx.fillText(k, w / 2 - 12, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.uiText;
      ctx.fillText(v, w / 2 + 12, y);
      y += 22;
    }

    if (s.leaderboard.length > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.uiAccent;
      ctx.font = 'bold 14px monospace';
      ctx.fillText('LEADERBOARD', w / 2, y + 24);
      ctx.font = '12px monospace';
      let ly = y + 48;
      for (const e of s.leaderboard) {
        ctx.fillStyle = e.won ? PALETTE.uiAccent : PALETTE.uiText;
        ctx.fillText(`${e.won ? '★' : ' '}  night ${e.nights}  ·  ${e.kills} kills  ·  ${e.date}`, w / 2, ly);
        ly += 16;
      }
    }

    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('click / esc / enter to return', w / 2, h - 24);
  }

  engineState() { return 'menu'; }
}
