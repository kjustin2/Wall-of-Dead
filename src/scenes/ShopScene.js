import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { PALETTE } from '../Config.js';

// M3 placeholder. M6 replaces with a real shop (4 buy slots: ammo, upgrade,
// fresh weapon, heal). For now this auto-grants a small ammo restock and
// returns to the map so map nodes of type 'shop' don't dead-end the run.

export class ShopScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.t = 0;
  }

  enter() {
    this.t = 0;
    runState.giveAmmoByType('LIGHT', 24);
    runState.giveAmmoByType('SHELL', 8);
  }

  update(dt) {
    this.t += dt;
    if (this.t > 0.6 && (this.input.consumeClick() || this.input.consumeKey('enter') || this.input.consumeKey(' '))) {
      events.emit('SCENE_CHANGE', { name: 'map' });
    }
    if (this.input.consumeKey('escape')) {
      events.emit('SCENE_CHANGE', { name: 'map' });
    }
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 28px monospace';
    ctx.fillText('SHOP', w / 2, h * 0.32);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText('(M6 will replace this with a real trading screen)', w / 2, h * 0.38);
    ctx.fillStyle = PALETTE.uiAccent;
    ctx.font = 'bold 14px monospace';
    ctx.fillText('+24 light ammo · +8 shells', w / 2, h * 0.55);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('click / enter / space to continue', w / 2, h - 30);
  }

  engineState() { return 'menu'; }
}
