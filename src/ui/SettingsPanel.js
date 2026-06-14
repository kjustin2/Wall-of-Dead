// Settings UI shared by the main menu and the pause menu. Rows: master volume
// (slider), mute (toggle), screen shake (slider), and Back. Mutates the shared
// `settings`, applies to Audio immediately, and persists. Keyboard (up/down to
// move, left/right to adjust, Enter to toggle/back) and mouse.

import { settings, saveSettings } from '../engine/Settings.js';
import { events } from '../engine/EventBus.js';
import { VIEW, PAL } from '../Config.js';
import { clamp } from '../util/math.js';

export class SettingsPanel {
  constructor(audio, onBack) {
    this.audio = audio;
    this.onBack = onBack;
    this.sel = 0;
    this.rows = ['volume', 'muted', 'shake', 'back'];
    this._sliderRects = {};
  }

  _apply() {
    if (this.audio) { this.audio.setVolume(settings.volume); this.audio.setMuted(settings.muted); }
    saveSettings();
  }

  _adjust(dir) {
    const row = this.rows[this.sel];
    if (row === 'volume') { settings.volume = clamp(+(settings.volume + dir * 0.1).toFixed(2), 0, 1); this._apply(); events.emit('SFX', 'ui_click'); }
    else if (row === 'shake') { settings.shake = clamp(+(settings.shake + dir * 0.25).toFixed(2), 0, 1.5); saveSettings(); events.emit('SFX', 'ui_click'); }
    else if (row === 'muted') { settings.muted = !settings.muted; this._apply(); events.emit('SFX', 'ui_click'); }
  }

  update(input) {
    if (input.consumeKey('arrowup') || input.consumeKey('w')) { this.sel = (this.sel + this.rows.length - 1) % this.rows.length; events.emit('SFX', 'ui_click'); }
    if (input.consumeKey('arrowdown') || input.consumeKey('s')) { this.sel = (this.sel + 1) % this.rows.length; events.emit('SFX', 'ui_click'); }
    if (input.consumeKey('arrowleft') || input.consumeKey('a')) this._adjust(-1);
    if (input.consumeKey('arrowright') || input.consumeKey('d')) this._adjust(1);

    // Mouse hover to select rows.
    for (let i = 0; i < this.rows.length; i++) {
      const r = this._rowRect(i);
      if (input.mouse.x >= r.x && input.mouse.x <= r.x + r.w && input.mouse.y >= r.y && input.mouse.y <= r.y + r.h && this.sel !== i) this.sel = i;
    }

    const activate = input.consumeKey('enter') || input.consumeKey(' ');
    const row = this.rows[this.sel];
    if (input.mouse.clicked) {
      // Click a slider track to set its value directly.
      input.mouse.clicked = false;
      if (row === 'volume' || row === 'shake') {
        const tr = this._sliderRects[row];
        if (tr && input.mouse.x >= tr.x && input.mouse.x <= tr.x + tr.w && Math.abs(input.mouse.y - tr.cy) < 18) {
          const f = clamp((input.mouse.x - tr.x) / tr.w, 0, 1);
          if (row === 'volume') settings.volume = +f.toFixed(2);
          else settings.shake = +(f * 1.5).toFixed(2);
          this._apply(); events.emit('SFX', 'ui_click');
          return;
        }
      }
      if (row === 'muted') { this._adjust(0); settings.muted = !settings.muted; this._apply(); return; }
      if (row === 'back') { events.emit('SFX', 'ui_confirm'); this.onBack(); return; }
    }
    if (activate) {
      if (row === 'back') { events.emit('SFX', 'ui_confirm'); this.onBack(); }
      else if (row === 'muted') { settings.muted = !settings.muted; this._apply(); events.emit('SFX', 'ui_click'); }
    }
    if (input.consumeKey('escape')) { events.emit('SFX', 'ui_confirm'); this.onBack(); }
  }

  _rowRect(i) { return { x: VIEW.W / 2 - 230, y: 250 + i * 56 - 22, w: 460, h: 40 }; }

  render(ctx) {
    ctx.fillStyle = 'rgba(6,9,9,0.92)';
    ctx.fillRect(VIEW.W / 2 - 280, 170, 560, 360);
    ctx.strokeStyle = 'rgba(127,255,138,0.3)';
    ctx.strokeRect(VIEW.W / 2 - 280 + 0.5, 170.5, 560, 360);

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.accent;
    ctx.font = 'bold 24px monospace';
    ctx.fillText('SETTINGS', VIEW.W / 2, 212);

    this._row(ctx, 0, 'Master Volume', () => this._slider(ctx, 0, 'volume', settings.volume, 1, `${Math.round(settings.volume * 100)}%`));
    this._row(ctx, 1, 'Mute', () => this._value(ctx, 1, settings.muted ? 'ON' : 'OFF', settings.muted ? '#d8662e' : '#5fbf6a'));
    this._row(ctx, 2, 'Screen Shake', () => this._slider(ctx, 2, 'shake', settings.shake / 1.5, 1, `${Math.round(settings.shake * 100)}%`));
    this._row(ctx, 3, 'Back', () => {});

    ctx.fillStyle = PAL.hudDim;
    ctx.font = '11px monospace';
    ctx.fillText('↑↓ select   ←→ adjust   Enter / Esc back', VIEW.W / 2, 512);
  }

  _row(ctx, i, label, drawValue) {
    const r = this._rowRect(i);
    const sel = this.sel === i;
    if (sel) {
      ctx.fillStyle = 'rgba(127,255,138,0.10)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = sel ? '#eafff0' : '#80968a';
    ctx.font = sel ? 'bold 17px monospace' : '16px monospace';
    ctx.fillText(label, r.x + 16, r.y + 26);
    drawValue();
  }

  _slider(ctx, i, key, frac01, max, text) {
    const r = this._rowRect(i);
    const x = r.x + 230, w = 170, cy = r.y + 20;
    this._sliderRects[key] = { x, w, cy };
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, cy - 4, w, 8);
    ctx.fillStyle = this.sel === i ? '#7fff8a' : '#5a8a64';
    ctx.fillRect(x, cy - 4, w * clamp(frac01, 0, 1), 8);
    ctx.fillStyle = '#cfe8d0';
    ctx.beginPath(); ctx.arc(x + w * clamp(frac01, 0, 1), cy, 6, 0, 6.2832); ctx.fill();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fb8a6';
    ctx.font = '13px monospace';
    ctx.fillText(text, r.x + r.w - 12, cy + 5);
  }

  _value(ctx, i, text, color) {
    const r = this._rowRect(i);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = 'bold 15px monospace';
    ctx.fillText(text, r.x + r.w - 12, r.y + 26);
  }
}
