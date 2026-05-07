import { events } from '../engine/EventBus.js';

// Base scene class. Scenes register listeners in enter() and MUST tear them
// down in exit(). The _busSubs helper auto-tracks subscriptions so subclasses
// don't have to remember every off() call individually.

export class Scene {
  constructor() {
    this._busSubs = []; // {event, fn} pairs registered via this.bus(...)
  }

  // enter(params)  — called when SceneManager activates this scene
  // exit()          — called before swapping to another scene
  // update(dt, realDt) — per-frame logic
  // render(ctx)        — per-frame draw
  // engineState()      — 'combat' | 'minigame' | 'paused' | 'menu' (frame rate hint)

  // Auto-tracked event subscription. Use this instead of events.on() directly
  // so the base exit() implementation can clean it up.
  bus(event, fn) {
    events.on(event, fn);
    this._busSubs.push({ event, fn });
  }

  exit() {
    for (const { event, fn } of this._busSubs) events.off(event, fn);
    this._busSubs.length = 0;
  }

  engineState() { return 'menu'; }
}
