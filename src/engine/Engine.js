// requestAnimationFrame loop with a dt cap and an optional screen-shake hook.
// The engine is intentionally thin: it owns timing, the game owns state.

import { ENGINE } from '../Config.js';
import { events } from './EventBus.js';

export class Engine {
  constructor(updateFn, renderFn) {
    this.updateFn = updateFn;
    this.renderFn = renderFn;
    this.lastTime = 0;
    this.running = false;
    this.time = 0;       // total elapsed seconds (handy for shaders/pulses)
    this.hitStop = 0;    // brief logic freeze for impact punch

    // A heavy kill / hit can request a few ms of frozen logic — renders keep
    // going so the freeze reads as a snap of weight.
    events.on('HITSTOP', (d) => { this.hitStop = Math.max(this.hitStop, d); });
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  stop() { this.running = false; }

  _loop(timestamp) {
    if (!this.running) return;
    requestAnimationFrame((t) => this._loop(t));

    // Clamp dt: a backgrounded tab produces a huge first frame otherwise.
    const dt = Math.min((timestamp - this.lastTime) / 1000, ENGINE.maxDt);
    this.lastTime = timestamp;
    this.time += dt;

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.renderFn();   // hold the frame, skip logic
      return;
    }

    this.updateFn(dt);
    this.renderFn();
  }
}
