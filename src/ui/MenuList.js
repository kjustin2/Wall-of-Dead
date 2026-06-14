// A keyboard + mouse menu list used by the main menu and the pause menu.
// Items: [{ label, action }]. Up/down (W/S/arrows) move, Enter/Space/click
// activate, mouse hover selects. render() lays the items out and records hit
// rects for the mouse.

import { events } from '../engine/EventBus.js';

export class MenuList {
  constructor(items) {
    this.items = items;
    this.sel = 0;
    this._rects = [];
  }

  setItems(items) { this.items = items; if (this.sel >= items.length) this.sel = 0; }

  _move(d) {
    this.sel = (this.sel + d + this.items.length) % this.items.length;
    events.emit('SFX', 'ui_click');
  }

  update(input) {
    if (input.consumeKey('arrowup') || input.consumeKey('w')) this._move(-1);
    if (input.consumeKey('arrowdown') || input.consumeKey('s')) this._move(1);

    // Mouse hover selection.
    for (let i = 0; i < this._rects.length; i++) {
      const r = this._rects[i];
      if (input.mouse.x >= r.x && input.mouse.x <= r.x + r.w && input.mouse.y >= r.y && input.mouse.y <= r.y + r.h) {
        if (this.sel !== i) { this.sel = i; events.emit('SFX', 'ui_click'); }
      }
    }

    let activate = input.consumeKey('enter') || input.consumeKey(' ');
    if (input.mouse.clicked) {
      for (let i = 0; i < this._rects.length; i++) {
        const r = this._rects[i];
        if (input.mouse.x >= r.x && input.mouse.x <= r.x + r.w && input.mouse.y >= r.y && input.mouse.y <= r.y + r.h) {
          this.sel = i; activate = true; input.mouse.clicked = false;
        }
      }
    }
    if (activate) {
      events.emit('SFX', 'ui_confirm');
      const it = this.items[this.sel];
      if (it && it.action) it.action();
    }
  }

  render(ctx, cx, topY, { gap = 50, w = 360 } = {}) {
    this._rects = [];
    ctx.textAlign = 'center';
    for (let i = 0; i < this.items.length; i++) {
      const y = topY + i * gap;
      const sel = i === this.sel;
      const rect = { x: cx - w / 2, y: y - 22, w, h: 38 };
      this._rects.push(rect);

      if (sel) {
        ctx.fillStyle = 'rgba(127,255,138,0.10)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = '#7fff8a';
        ctx.fillRect(rect.x, rect.y, 3, rect.h);
        ctx.fillRect(rect.x + rect.w - 3, rect.y, 3, rect.h);
      }
      ctx.fillStyle = sel ? '#eafff0' : '#80968a';
      ctx.font = sel ? 'bold 22px monospace' : '20px monospace';
      ctx.fillText(this.items[i].label, cx, y + 4);
    }
  }
}
