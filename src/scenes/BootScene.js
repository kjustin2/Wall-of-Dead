import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { PALETTE } from '../Config.js';

// One-time gate so the page has had a user gesture before audio plays.
// Browsers block autoplay until the user clicks; routing through Boot keeps
// every downstream Audio.play() guaranteed-safe.

export class BootScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.t = 0;
  }

  enter() {
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.input.consumeClick() || this.input.consumeKey('enter') || this.input.consumeKey(' ')) {
      events.emit('SCENE_CHANGE', { name: 'intro' });
    }
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WALL OF DEAD', w / 2, h / 2 - 10);

    // Pulsing "click to begin" so the user knows input is needed for audio.
    const a = 0.35 + 0.4 * Math.abs(Math.sin(this.t * 2));
    ctx.fillStyle = PALETTE.uiAccent;
    ctx.globalAlpha = a;
    ctx.font = '14px monospace';
    ctx.fillText('click to begin', w / 2, h / 2 + 22);
    ctx.globalAlpha = 1;
  }

  engineState() { return 'menu'; }
}
