import { events } from './EventBus.js';

// Replaces the gameState string-switch in roguehero2/src/main.js. Each Scene
// owns its own update/render and registers/un-registers its own EventBus
// listeners via enter()/exit(). This is the #1 leak surface — Scene.exit()
// MUST events.off() everything Scene.enter() events.on()'d, or listener
// counts grow per transition (caught by _dev.eventListenerCounts() smoke).

export class SceneManager {
  constructor() {
    this.scenes = {};      // name → Scene instance
    this.current = null;
    this.currentName = null;

    // External callers don't construct scenes; they emit SCENE_CHANGE.
    events.on('SCENE_CHANGE', ({ name, params }) => this.go(name, params));
  }

  register(name, scene) {
    this.scenes[name] = scene;
  }

  go(name, params) {
    const next = this.scenes[name];
    if (!next) {
      console.error(`[SceneManager] Unknown scene: ${name}`);
      return;
    }
    if (this.current && typeof this.current.exit === 'function') {
      this.current.exit();
    }
    this.current = next;
    this.currentName = name;
    if (typeof next.enter === 'function') next.enter(params || {});
    events.emit('SCENE_ENTERED', { name });
  }

  update(dt, realDt) {
    if (this.current && typeof this.current.update === 'function') {
      this.current.update(dt, realDt);
    }
  }

  render(ctx) {
    if (this.current && typeof this.current.render === 'function') {
      this.current.render(ctx);
    }
  }

  // Engine asks "should I run at full 60fps?" — yes when the current scene
  // is action (combat/minigame), no in menus/map (saves CPU/battery).
  getState() {
    if (this.current && typeof this.current.engineState === 'function') {
      return this.current.engineState();
    }
    return 'menu';
  }
}
