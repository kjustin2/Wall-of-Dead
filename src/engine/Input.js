// Single-player input. Stripped down from roguehero2/src/Input.js — no P2,
// no card slots, no touch joystick (Wall of Dead is desktop-first; touch
// support can be added later if needed).
//
// Per-frame consume pattern: main loop polls keys/mouse, calls consumeKey/
// consumeClick to "eat" one-shot inputs, then clearFrame() at end of frame.

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = {
      x: 0, y: 0,
      leftDown: false, rightDown: false,
      justClicked: false, justRightClicked: false,
    };
    this._wheelAccum = 0;

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.justPressed.add(k);
      // Prevent space/arrows from scrolling the page.
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', e => {
      this.keys.delete(e.key.toLowerCase());
    });

    // Releasing inputs on tab-blur prevents "stuck key" feel after switching back.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.justPressed.clear();
      this.mouse.leftDown = false;
      this.mouse.rightDown = false;
    });

    window.addEventListener('mousemove', e => this._updateMousePos(e));

    canvas.addEventListener('mousedown', e => {
      this._updateMousePos(e);
      if (e.button === 0) { this.mouse.leftDown = true; this.mouse.justClicked = true; }
      if (e.button === 2) { this.mouse.rightDown = true; this.mouse.justRightClicked = true; }
    });

    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.leftDown = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Wheel cycles weapon slot — emits pseudo-keys consumed by Player.
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this._wheelAccum += e.deltaY;
      const step = 40;
      while (this._wheelAccum >=  step) { this.justPressed.add('weaponnext'); this._wheelAccum -= step; }
      while (this._wheelAccum <= -step) { this.justPressed.add('weaponprev'); this._wheelAccum += step; }
    }, { passive: false });
  }

  _updateMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.mouse.x = (e.clientX - rect.left) * scaleX;
    this.mouse.y = (e.clientY - rect.top) * scaleY;
  }

  isDown(key) {
    return this.keys.has(key);
  }

  // Returns true ONCE per press, then "eats" the press so the next call is false.
  consumeKey(key) {
    if (this.justPressed.has(key)) {
      this.justPressed.delete(key);
      return true;
    }
    return false;
  }

  consumeClick() {
    if (this.mouse.justClicked) { this.mouse.justClicked = false; return true; }
    return false;
  }

  consumeRightClick() {
    if (this.mouse.justRightClicked) { this.mouse.justRightClicked = false; return true; }
    return false;
  }

  // Call at end of every frame to clear one-shot flags that weren't consumed.
  clearFrame() {
    this.mouse.justClicked = false;
    this.mouse.justRightClicked = false;
    this.justPressed.clear();
  }
}
