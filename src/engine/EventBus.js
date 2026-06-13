// Minimal pub/sub. Cross-system messages (sfx requests, screen shake, deaths)
// flow through here so systems stay decoupled. Singleton `events`.

class EventBus {
  constructor() {
    this._map = new Map();
  }

  on(type, fn) {
    let set = this._map.get(type);
    if (!set) { set = new Set(); this._map.set(type, set); }
    set.add(fn);
    return fn;
  }

  off(type, fn) {
    const set = this._map.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this._map.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }
}

export const events = new EventBus();
