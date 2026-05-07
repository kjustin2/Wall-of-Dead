import { events } from './EventBus.js';
import { FULL_FPS_STATES, ENGINE } from '../Config.js';

// rAF loop with dt cap, hit-stop, slow-mo. Ported from roguehero2/src/Engine.js
// with tweaks: FULL_FPS_STATES lives in Config so all tunables are centralized.

export class Engine {
  constructor(updateFn, renderFn, getState) {
    this.updateFn = updateFn;
    this.renderFn = renderFn;
    this.getState = getState || (() => 'combat');
    this.lastTime = performance.now();
    this.hitStop = 0;
    this.slowMoTimer = 0;
    this.slowMoScale = 1.0;
    this.running = false;

    events.on('HIT_STOP', dur => { this.hitStop = Math.max(this.hitStop, dur); });
    events.on('SLOW_MO', ({ dur, scale }) => {
      this.slowMoTimer = Math.max(this.slowMoTimer, dur);
      this.slowMoScale = scale;
    });
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  stop() {
    this.running = false;
  }

  loop(timestamp) {
    if (!this.running) return;
    requestAnimationFrame(t => this.loop(t));

    // Throttle to 30fps in non-action states to save CPU/battery.
    const needFullFps = FULL_FPS_STATES.has(this.getState());
    if (!needFullFps && timestamp - this.lastTime < 1000 / 30) return;

    // Cap dt so a tab-blur doesn't teleport entities.
    let realDt = Math.min((timestamp - this.lastTime) / 1000, ENGINE.maxDt);
    this.lastTime = timestamp;

    // Hit-stop: freeze logic but keep rendering so the hit punch reads.
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      this.renderFn();
      return;
    }

    // Slow-mo: scale logicDt for dramatic moments (wave-end killing blow, etc.).
    let logicDt = realDt;
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= realDt;
      logicDt *= this.slowMoScale;
    } else {
      this.slowMoScale = 1.0;
    }

    const _t0 = performance.now();
    this.updateFn(logicDt, realDt);
    const _t1 = performance.now();
    this.renderFn();
    const _t2 = performance.now();
    if (typeof window !== 'undefined') {
      const s = window._profileSample = window._profileSample || { upd: 0, ren: 0, frame: 0, n: 0 };
      s.upd   = s.upd   * 0.9 + (_t1 - _t0) * 0.1;
      s.ren   = s.ren   * 0.9 + (_t2 - _t1) * 0.1;
      s.frame = s.frame * 0.9 + (_t2 - _t0) * 0.1;
      s.n++;
    }
  }
}
