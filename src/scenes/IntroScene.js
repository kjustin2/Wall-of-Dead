import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { PALETTE, INTRO } from '../Config.js';

// Title screen. CONTINUE only enables when sessionStorage holds a resumable
// run. SANDBOX still routes straight to a CombatScene (skipping RunState)
// for testing weapon/zombie balance without a full run.

export class IntroScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.t = 0;
    this.hoverIdx = -1;
  }

  enter() {
    this.t = 0;
    this.hoverIdx = -1;
    // Build the button list each enter so CONTINUE reflects current session state.
    const canResume = runState.hasResumable();
    this.buttons = [
      { id: 'newrun',   label: 'NEW RUN',  action: 'newrun',   enabled: true },
      { id: 'continue', label: 'CONTINUE', action: 'continue', enabled: canResume },
      { id: 'sandbox',  label: 'SANDBOX',  action: 'sandbox',  enabled: true },
      { id: 'meta',     label: 'META',     action: 'meta',     enabled: true },
    ];
  }

  update(dt) {
    this.t += dt;

    const w = this.input.canvas.width, h = this.input.canvas.height;
    const bx = w / 2, byStart = h * 0.52, gap = 38;
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    this.hoverIdx = -1;
    for (let i = 0; i < this.buttons.length; i++) {
      const cy = byStart + i * gap;
      if (my >= cy - 16 && my <= cy + 16 && mx >= bx - 130 && mx <= bx + 130) {
        this.hoverIdx = i;
        break;
      }
    }

    if (this.input.consumeClick() && this.hoverIdx >= 0) {
      const btn = this.buttons[this.hoverIdx];
      if (!btn.enabled) return;
      switch (btn.action) {
        case 'newrun':
          // Clear any stale session run before starting a new one.
          runState.end('aborted');
          events.emit('SCENE_CHANGE', { name: 'baseCamp' });
          break;
        case 'continue':
          if (runState.resume()) {
            events.emit('SCENE_CHANGE', { name: 'map' });
          }
          break;
        case 'sandbox':
          // Sandbox: no RunState — straight into a one-shot combat scene.
          runState.end('aborted');
          events.emit('SCENE_CHANGE', { name: 'combat', params: { nightNum: 1 } });
          break;
        case 'meta':
          events.emit('SCENE_CHANGE', { name: 'meta' });
          break;
      }
    }
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;

    // Background
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);

    // Subtle radial floor glow so the title doesn't float in pure black.
    const grad = ctx.createRadialGradient(w / 2, h * 0.4, 60, w / 2, h * 0.4, h * 0.7);
    grad.addColorStop(0, 'rgba(126, 255, 102, 0.04)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Title with pulsing alpha and a red drip underline (programmatic art).
    const pulse = 0.78 + 0.22 * Math.sin(this.t * INTRO.titlePulseSpeed);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = INTRO.titleColor;
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WALL OF DEAD', w / 2, h * 0.32);
    ctx.restore();

    // Drip (thin red line + dots) under the title
    ctx.fillStyle = INTRO.titleDripColor;
    ctx.fillRect(w / 2 - 220, h * 0.34 + 6, 440, 2);
    for (let i = 0; i < 7; i++) {
      const dx = w / 2 - 200 + i * 67;
      const dy = h * 0.34 + 8 + Math.sin(this.t * 1.4 + i) * 2 + i;
      ctx.beginPath();
      ctx.arc(dx, dy + (i % 3) * 3, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtitle
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '14px monospace';
    ctx.fillText('survive the night. reach the freedom zone.', w / 2, h * 0.4);

    // Buttons
    const bx = w / 2, byStart = h * 0.52, gap = 38;
    for (let i = 0; i < this.buttons.length; i++) {
      const btn = this.buttons[i];
      const cy = byStart + i * gap;
      const hovered = i === this.hoverIdx && btn.enabled;
      ctx.fillStyle = btn.enabled
        ? (hovered ? PALETTE.uiAccent : PALETTE.uiText)
        : PALETTE.uiDim;
      ctx.font = (hovered ? 'bold ' : '') + '20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(btn.label + (btn.enabled ? '' : '  —  no save'), bx, cy);
    }

    // Footer
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('v0.3 — M3 map', w - 12, h - 10);
    ctx.textAlign = 'left';
    ctx.fillText('WASD move · mouse aim · click shoot · R reload', 12, h - 10);
  }

  engineState() { return 'menu'; }
}
