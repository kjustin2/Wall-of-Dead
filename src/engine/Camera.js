// Screen shake only — the view itself is fixed (no scrolling). Systems emit
// 'SHAKE' with an amount; render wraps draw calls in begin()/end() to apply
// a decaying random offset. Trauma model: shake = trauma^2 so small hits are
// subtle and big ones punch.

import { events } from './EventBus.js';

export class Camera {
  constructor() {
    this.trauma = 0;
    this.ox = 0;
    this.oy = 0;
    events.on('SHAKE', (amt) => this.add(amt));
  }

  add(amt) { this.trauma = Math.min(1, this.trauma + amt); }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * 16;
    this.ox = (Math.random() * 2 - 1) * s;
    this.oy = (Math.random() * 2 - 1) * s;
  }

  begin(ctx) { ctx.save(); ctx.translate(this.ox, this.oy); }
  end(ctx) { ctx.restore(); }
}
