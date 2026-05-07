import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { PALETTE } from '../Config.js';

// M3 placeholder. M6 replaces with text-event choice trees from EventDefs.js.
// For now picks one of three flat outcomes at random and applies it.

const PLACEHOLDER_EVENTS = [
  { title: 'A SURVIVOR',     blurb: 'they limp toward the firelight. you share a med-kit.', apply: () => runState.heal(20) },
  { title: 'A BURNED HOUSE', blurb: 'no one inside. but a cache in the basement.',          apply: () => runState.giveAmmoByType('LIGHT', 30) },
  { title: 'A PIT',          blurb: 'a runner lunges from the dark. you take a hit.',      apply: () => { runState.player.hp = Math.max(1, runState.player.hp - 12); } },
];

export class EventScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.event = null;
    this.t = 0;
  }

  enter() {
    this.t = 0;
    this.event = PLACEHOLDER_EVENTS[Math.floor(Math.random() * PLACEHOLDER_EVENTS.length)];
    this.event.apply();
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
    ctx.fillText(this.event ? this.event.title : '???', w / 2, h * 0.32);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '14px monospace';
    if (this.event) ctx.fillText(this.event.blurb, w / 2, h * 0.42);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('click / enter / space to continue', w / 2, h - 30);
  }

  engineState() { return 'menu'; }
}
