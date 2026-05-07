// Pub/sub bus. Single shared instance — all cross-system messages flow through
// this so systems don't hold direct references to each other.
//
// Ported verbatim from roguehero2/src/EventBus.js. The slice-on-emit guard
// makes mid-dispatch removal (e.g. once()) safe; swap-remove keeps off() O(1).

export class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  // Fire callback exactly once, then auto-remove it.
  once(event, callback) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      callback(payload);
    };
    this.on(event, wrapper);
  }

  off(event, callback) {
    const arr = this.listeners[event];
    if (!arr) return;
    // Swap-remove: O(1), avoids array allocation from filter().
    const idx = arr.indexOf(callback);
    if (idx !== -1) { arr[idx] = arr[arr.length - 1]; arr.pop(); }
  }

  emit(event, payload) {
    const arr = this.listeners[event];
    if (!arr || arr.length === 0) return;
    // Fast path: single listener, no copy needed (no mid-dispatch removal possible).
    if (arr.length === 1) { arr[0](payload); return; }
    // Slice to allow safe removal mid-dispatch.
    const cbs = arr.slice();
    for (let i = 0; i < cbs.length; i++) cbs[i](payload);
  }

  // Diagnostic — used by _dev.eventListenerCounts() to detect leaks.
  counts() {
    const out = {};
    for (const k of Object.keys(this.listeners)) {
      out[k] = this.listeners[k].length;
    }
    return out;
  }
}

export const events = new EventBus();
