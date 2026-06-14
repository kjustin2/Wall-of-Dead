// ESC pause overlay. Freezes the scene beneath it (Game skips scene.update
// while an overlay is active) and offers Resume / Restart / Settings / Main
// Menu. Settings is an in-place sub-view sharing SettingsPanel.

import { MenuList } from './MenuList.js';
import { SettingsPanel } from './SettingsPanel.js';
import { VIEW, PAL } from '../Config.js';

export class PauseMenu {
  constructor(game) {
    this.game = game;
    this.view = 'menu';
    this.t = 0;
    this.menu = new MenuList([
      { label: 'Resume', action: () => game.resume() },
      { label: 'Restart Run', action: () => game.restartRun() },
      { label: 'Settings', action: () => { this.view = 'settings'; } },
      { label: 'Main Menu', action: () => game.quitToMenu() },
    ]);
    this.settings = new SettingsPanel(game.audio, () => { this.view = 'menu'; });
  }

  update(input, dt) {
    this.t += dt;
    if (this.view === 'menu') {
      if (input.consumeKey('escape')) { this.game.resume(); return; }
      this.menu.update(input);
    } else {
      this.settings.update(input);
    }
  }

  render(ctx) {
    ctx.fillStyle = 'rgba(4,6,8,0.74)';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    if (this.view === 'menu') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0c100c';
      ctx.font = 'bold 46px monospace';
      ctx.fillText('PAUSED', VIEW.W / 2 + 2, 222);
      ctx.fillStyle = PAL.accent;
      ctx.fillText('PAUSED', VIEW.W / 2, 220);
      this.menu.render(ctx, VIEW.W / 2, 300);
      ctx.fillStyle = PAL.hudDim;
      ctx.font = '12px monospace';
      ctx.fillText('ESC to resume', VIEW.W / 2, 560);
    } else {
      this.settings.render(ctx);
    }
  }
}
