// Keyboard + mouse, desktop-first. The mouse position is reported in *canvas
// space* (the fixed 1280x720 coordinate system) regardless of how the canvas
// is scaled to the window — see _updateMouse.
//
// One-shot inputs (a key press, a click) are consumed via consumeKey/
// consumeClick so a press fires exactly once; clearFrame() at end of frame
// drops anything left unconsumed.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 640, y: 360, down: false, clicked: false };
    this._wheel = 0;

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    // Stuck-key guard when the window loses focus.
    addEventListener('blur', () => { this.keys.clear(); this.pressed.clear(); this.mouse.down = false; });

    addEventListener('mousemove', (e) => this._updateMouse(e));
    canvas.addEventListener('mousedown', (e) => {
      this._updateMouse(e);
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this._wheel += e.deltaY; }, { passive: false });
  }

  _updateMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
    this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
  }

  isDown(k) { return this.keys.has(k); }

  consumeKey(k) {
    if (this.pressed.has(k)) { this.pressed.delete(k); return true; }
    return false;
  }

  consumeClick() {
    if (this.mouse.clicked) { this.mouse.clicked = false; return true; }
    return false;
  }

  // Returns -1 (scroll up / prev), +1 (scroll down / next), or 0.
  consumeWheel() {
    if (this._wheel <= -30) { this._wheel = 0; return -1; }
    if (this._wheel >= 30) { this._wheel = 0; return 1; }
    return 0;
  }

  clearFrame() {
    this.mouse.clicked = false;
    this.pressed.clear();
    this._wheel = 0;
  }
}
