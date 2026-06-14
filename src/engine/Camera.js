// Screen shake only — the view itself is fixed (no scrolling). Systems emit
// 'SHAKE' with an amount; render wraps draw calls in begin()/end() to apply
// a decaying random offset. Trauma model: shake = trauma^2 so small hits are
// subtle and big ones punch.

import { events } from './EventBus.js';
import { settings } from './Settings.js';

export class Camera {
  constructor() {
    this.trauma = 0;
    this.ox = 0;
    this.oy = 0;
    this.angle = 0;
    events.on('SHAKE', (amt) => this.add(amt));
  }

  add(amt) { this.trauma = Math.min(1, this.trauma + amt * settings.shake); }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * 18;
    this.ox = (Math.random() * 2 - 1) * s;
    this.oy = (Math.random() * 2 - 1) * s;
    this.angle = (Math.random() * 2 - 1) * this.trauma * this.trauma * 0.012;
  }

  begin(ctx) {
    ctx.save();
    if (this.angle !== 0) {
      ctx.translate(640, 360);
      ctx.rotate(this.angle);
      ctx.translate(-640, -360);
    }
    ctx.translate(this.ox, this.oy);
  }
  end(ctx) { ctx.restore(); }
}
