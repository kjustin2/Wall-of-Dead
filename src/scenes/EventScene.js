import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { EVENTS, OUTCOMES } from '../world/EventDefs.js';
import { drawWrapped } from '../util/text.js';
import { PALETTE } from '../Config.js';

// Single-layer text-event scene. Picks a random event from EventDefs.EVENTS,
// presents the player with 2-3 choices (number keys or click), applies the
// chosen outcome, and shows the result text before returning to the map.

export class EventScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.event = null;
    this.outcome = null;
    this.phase = 'choosing';   // 'choosing' → 'resolved'
    this.t = 0;
    this.hoverIdx = -1;
    this._choiceRects = [];
  }

  enter() {
    this.t = 0;
    this.event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    this.outcome = null;
    this.phase = 'choosing';
    this.hoverIdx = -1;
    this._choiceRects = [];
  }

  update(dt) {
    this.t += dt;

    if (this.phase === 'choosing') {
      // Hover hit-test for choice rows
      this.hoverIdx = -1;
      for (let i = 0; i < this._choiceRects.length; i++) {
        const r = this._choiceRects[i];
        if (this.input.mouse.x >= r.x && this.input.mouse.x <= r.x + r.w
            && this.input.mouse.y >= r.y && this.input.mouse.y <= r.y + r.h) {
          this.hoverIdx = i;
          break;
        }
      }

      // Number keys 1..N pick a choice
      for (let i = 0; i < this.event.choices.length; i++) {
        if (this.input.consumeKey(String(i + 1))) { this._pick(i); return; }
      }

      if (this.input.consumeClick() && this.hoverIdx >= 0) {
        this._pick(this.hoverIdx);
        return;
      }

      // ESC during choosing returns to map without applying anything
      if (this.input.consumeKey('escape')) {
        events.emit('SCENE_CHANGE', { name: 'map' });
      }
      return;
    }

    if (this.phase === 'resolved') {
      if (this.t > 0.4 && (this.input.consumeClick()
          || this.input.consumeKey('enter')
          || this.input.consumeKey(' ')
          || this.input.consumeKey('escape'))) {
        events.emit('SCENE_CHANGE', { name: 'map' });
      }
    }
  }

  _pick(idx) {
    const choice = this.event.choices[idx];
    if (!choice) return;
    const oc = OUTCOMES[choice.outcome];
    if (oc) {
      try { oc.apply(runState); } catch (e) { console.warn('[EventScene] outcome.apply threw', e); }
      this.outcome = oc;
    } else {
      this.outcome = { resultText: '...nothing happens.' };
    }
    runState.persist();
    this.phase = 'resolved';
    this.t = 0;
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';

    // Title
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(this.event ? this.event.title : '???', w / 2, h * 0.20);

    if (this.phase === 'choosing') {
      // Blurb (wrapped, capped to 4 lines so very long copy doesn't push the choice list down)
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '14px monospace';
      const blurbMax = Math.min(640, w * 0.78);
      drawWrapped(ctx, this.event.blurb, w / 2, h * 0.30, blurbMax, 20, 4);

      // Choice rows
      this._choiceRects = [];
      const choices = this.event.choices;
      const rowW = Math.min(560, w * 0.7);
      const rowH = 38;
      const gap = 8;
      const totalH = choices.length * rowH + (choices.length - 1) * gap;
      const startY = h * 0.58 - totalH / 2;
      ctx.textAlign = 'left';
      for (let i = 0; i < choices.length; i++) {
        const x = (w - rowW) / 2;
        const y = startY + i * (rowH + gap);
        const hovered = i === this.hoverIdx;
        ctx.fillStyle = hovered ? 'rgba(126,255,102,0.10)' : 'rgba(20,20,26,0.65)';
        ctx.fillRect(x, y, rowW, rowH);
        ctx.strokeStyle = hovered ? PALETTE.uiAccent : PALETTE.uiDim;
        ctx.lineWidth = hovered ? 2 : 1;
        ctx.strokeRect(x, y, rowW, rowH);

        // Number key hint
        ctx.fillStyle = PALETTE.uiAccent;
        ctx.font = 'bold 16px monospace';
        ctx.fillText(String(i + 1), x + 14, y + rowH * 0.65);

        // Label
        ctx.fillStyle = hovered ? PALETTE.uiAccent : PALETTE.uiText;
        ctx.font = '14px monospace';
        ctx.fillText(choices[i].label, x + 38, y + rowH * 0.65);

        this._choiceRects.push({ x, y, w: rowW, h: rowH });
      }
      ctx.textAlign = 'center';

      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '11px monospace';
      ctx.fillText('press 1 / 2 / 3 or click · esc to leave (no choice)', w / 2, h - 24);
      return;
    }

    // ── Resolved phase ──
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = '15px monospace';
    const text = this.outcome && this.outcome.resultText ? this.outcome.resultText : '';
    const blurbMax = Math.min(640, w * 0.78);
    drawWrapped(ctx, text, w / 2, h * 0.40, blurbMax, 22, 6);

    if (this.t > 0.4) {
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '11px monospace';
      ctx.fillText('click / enter / space to continue', w / 2, h - 24);
    }
  }

  engineState() { return 'menu'; }
}
