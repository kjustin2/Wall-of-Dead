// Title screen. Moody animated field behind the logo; a click begins a run
// (and, crucially, unlocks the AudioContext via the user gesture).

import { Scene } from './Scene.js';
import { VIEW, FIELD, PAL } from '../Config.js';
import { drawNightField, drawVignette } from '../game/Backdrop.js';
import { TAU } from '../util/math.js';

export class TitleScene extends Scene {
  enter() {
    this.t = 0;
    // Drifting pairs of eyes far out in the dark.
    this.eyes = [];
    for (let i = 0; i < 7; i++) {
      this.eyes.push({
        x: 100 + Math.random() * 1080,
        y: FIELD.HORIZON_Y + 20 + Math.random() * 220,
        phase: Math.random() * TAU,
        blink: Math.random() * 6,
      });
    }
  }

  update(dt) {
    this.t += dt;
    for (const e of this.eyes) {
      e.x += Math.sin(this.t * 0.3 + e.phase) * 6 * dt;
      e.blink -= dt;
      if (e.blink < -0.2) e.blink = 3 + Math.random() * 6;
    }
    if (this.input.consumeClick() || this.input.consumeKey(' ') || this.input.consumeKey('enter')) {
      this.audio.init();
      this.audio.resume();
      this.audio.play('ui_confirm');
      this.game.startRun();
    }
  }

  render(ctx) {
    drawNightField(ctx, this.t);

    // Eyes.
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.eyes) {
      if (e.blink < 0) continue;
      const a = 0.5 + 0.5 * Math.sin(this.t * 2 + e.phase);
      ctx.fillStyle = `rgba(180,255,120,${0.3 + a * 0.3})`;
      ctx.beginPath(); ctx.arc(e.x - 4, e.y, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + 4, e.y, 2, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    drawVignette(ctx, 0.35);

    // Title.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0c100c';
    ctx.font = 'bold 86px monospace';
    ctx.fillText('WALL OF DEAD', VIEW.W / 2 + 3, 263);
    ctx.fillStyle = PAL.accent;
    ctx.fillText('WALL OF DEAD', VIEW.W / 2, 260);

    ctx.fillStyle = PAL.hud;
    ctx.font = '16px monospace';
    ctx.fillText('Hold the wall. Survive the night. Reach the safe zone.', VIEW.W / 2, 300);

    // Pulsing prompt.
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    ctx.fillStyle = `rgba(207,232,208,${0.4 + pulse * 0.6})`;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('CLICK TO BEGIN', VIEW.W / 2, 400);

    // Controls.
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '13px monospace';
    const lines = [
      'A / D  move along the wall      MOUSE  aim      CLICK / HOLD  fire',
      'R  reload      1 2 3 / SCROLL  swap weapons',
    ];
    let y = 470;
    for (const l of lines) { ctx.fillText(l, VIEW.W / 2, y); y += 22; }
  }
}
