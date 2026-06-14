// Main menu. Moody animated field behind a logo and a navigable menu
// (Play / How to Play / Settings). The first interaction unlocks the
// AudioContext. Settings + How-to-Play are in-place sub-views.

import { Scene } from './Scene.js';
import { VIEW, FIELD, PAL } from '../Config.js';
import { drawNightField, drawVignette } from '../game/Backdrop.js';
import { MenuList } from '../ui/MenuList.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { TAU } from '../util/math.js';

export class TitleScene extends Scene {
  enter() {
    this.t = 0;
    this.view = 'menu';
    this._audioReady = false;
    this.eyes = [];
    for (let i = 0; i < 8; i++) {
      this.eyes.push({
        x: 100 + Math.random() * 1080,
        y: FIELD.HORIZON_Y + 20 + Math.random() * 220,
        phase: Math.random() * TAU,
        blink: Math.random() * 6,
      });
    }
    this.menu = new MenuList([
      { label: 'PLAY', action: () => this.game.startRun() },
      { label: 'HOW TO PLAY', action: () => { this.view = 'howto'; } },
      { label: 'SETTINGS', action: () => { this.view = 'settings'; } },
    ]);
    this.settings = new SettingsPanel(this.audio, () => { this.view = 'menu'; });
  }

  _unlockAudio() {
    if (this._audioReady) return;
    if (this.input.mouse.down || this.input.mouse.clicked || this.input.pressed.size) {
      this.audio.init(); this.audio.resume();
      this._audioReady = true;
    }
  }

  update(dt) {
    this.t += dt;
    this._unlockAudio();
    for (const e of this.eyes) {
      e.x += Math.sin(this.t * 0.3 + e.phase) * 6 * dt;
      e.blink -= dt;
      if (e.blink < -0.2) e.blink = 3 + Math.random() * 6;
    }
    if (this.view === 'menu') this.menu.update(this.input);
    else if (this.view === 'settings') this.settings.update(this.input);
    else if (this.view === 'howto') {
      if (this.input.consumeKey('escape') || this.input.consumeKey('enter') || this.input.consumeKey(' ') || this.input.consumeClick()) this.view = 'menu';
    }
  }

  render(ctx) {
    drawNightField(ctx, this.t);

    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.eyes) {
      if (e.blink < 0) continue;
      const a = 0.5 + 0.5 * Math.sin(this.t * 2 + e.phase);
      ctx.fillStyle = `rgba(180,255,120,${0.25 + a * 0.3})`;
      ctx.beginPath(); ctx.arc(e.x - 4, e.y, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + 4, e.y, 2, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    drawVignette(ctx, 0.4);

    // Logo.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0a0e0a';
    ctx.font = 'bold 84px monospace';
    ctx.fillText('WALL OF DEAD', VIEW.W / 2 + 3, 183);
    ctx.fillStyle = PAL.accent;
    ctx.fillText('WALL OF DEAD', VIEW.W / 2, 180);
    ctx.fillStyle = PAL.hud;
    ctx.font = '15px monospace';
    ctx.fillText('Hold the wall. Survive the night. Reach the safe zone.', VIEW.W / 2, 216);

    if (this.view === 'menu') {
      this.menu.render(ctx, VIEW.W / 2, 320);
      ctx.fillStyle = PAL.hudDim;
      ctx.font = '11px monospace';
      ctx.fillText('↑↓ / mouse to choose   ·   Enter to select', VIEW.W / 2, 560);
    } else if (this.view === 'settings') {
      this.settings.render(ctx);
    } else if (this.view === 'howto') {
      this._renderHowto(ctx);
    }
  }

  _renderHowto(ctx) {
    ctx.fillStyle = 'rgba(6,9,9,0.92)';
    ctx.fillRect(VIEW.W / 2 - 320, 250, 640, 320);
    ctx.strokeStyle = 'rgba(127,255,138,0.3)';
    ctx.strokeRect(VIEW.W / 2 - 320 + 0.5, 250.5, 640, 320);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.accent;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('HOW TO PLAY', VIEW.W / 2, 290);

    ctx.textAlign = 'left';
    ctx.font = '13px monospace';
    const lines = [
      ['NIGHT', 'Hold the wall until dawn. The dead cross the field toward you.'],
      ['', 'A / D move · MOUSE aim · CLICK/HOLD fire · R reload · 1/2/3 swap'],
      ['DAY', 'Choose a scavenging run for ammo, repairs, weapons, survivors.'],
      ['', 'Risky runs are unarmed: WASD to move, dodge or shove the dead.'],
      ['GOAL', 'Survive 4 nights and reach the safe zone. Rescue who you can.'],
      ['PAUSE', 'Press ESC any time during a night or day.'],
    ];
    let y = 330;
    for (const [k, v] of lines) {
      ctx.fillStyle = PAL.accent;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(k, VIEW.W / 2 - 290, y);
      ctx.fillStyle = PAL.hud;
      ctx.font = '13px monospace';
      ctx.fillText(v, VIEW.W / 2 - 230, y);
      y += k ? 30 : 26;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '12px monospace';
    ctx.fillText('Esc / Enter to go back', VIEW.W / 2, 548);
  }
}
