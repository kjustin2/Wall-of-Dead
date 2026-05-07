// In-combat HUD. Programmatic — no sprite atlas. Designed to be unobtrusive
// in the corners so the center of the screen stays clean for action.

import { PALETTE, PLAYER, NIGHT } from '../Config.js';

export class HUD {
  constructor() {
    this.toast = null;       // { text, color, life, maxLife }
    this.waveLabel = null;   // { text, color, life, maxLife }
  }

  setToast(text, color, dur) {
    this.toast = { text, color: color || PALETTE.uiText, life: dur || 1.6, maxLife: dur || 1.6 };
  }

  setWaveLabel(text, color, dur) {
    this.waveLabel = { text, color: color || PALETTE.uiAccent, life: dur || 2.2, maxLife: dur || 2.2 };
  }

  update(dt) {
    if (this.toast)      { this.toast.life      -= dt; if (this.toast.life      <= 0) this.toast = null; }
    if (this.waveLabel)  { this.waveLabel.life  -= dt; if (this.waveLabel.life  <= 0) this.waveLabel = null; }
  }

  draw(ctx, player, director) {
    const w = ctx.canvas.width, h = ctx.canvas.height;

    // ── Bottom-left: HP bar + stamina ──
    const hpW = 220, hpH = 14;
    const hpX = 14, hpY = h - 50;
    ctx.fillStyle = PALETTE.hpBarBg;
    ctx.fillRect(hpX - 1, hpY - 1, hpW + 2, hpH + 2);
    ctx.fillStyle = PALETTE.hpBar;
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    ctx.fillRect(hpX, hpY, hpW * hpRatio, hpH);
    ctx.strokeStyle = PALETTE.uiDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hpY, hpW, hpH);
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, hpX, hpY - 4);

    // Stamina bar
    const stW = 220, stH = 5;
    ctx.fillStyle = PALETTE.hpBarBg;
    ctx.fillRect(hpX - 1, hpY + hpH + 4, stW + 2, stH + 2);
    ctx.fillStyle = '#5d9aff';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(hpX, hpY + hpH + 5, stW * (player.stamina / PLAYER.staminaMax), stH);
    ctx.globalAlpha = 1;

    // ── Bottom-right: weapon + ammo ──
    const wx = w - 14, wy = h - 50;
    ctx.textAlign = 'right';
    const wpn = player.weapon;
    const allDry = player._allDry && player._allDry();
    ctx.fillStyle = allDry ? PALETTE.uiWarn : PALETTE.uiText;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(allDry ? 'KNIFE (NO AMMO)' : wpn.name.toUpperCase(), wx, wy - 12);
    ctx.font = 'bold 22px monospace';
    if (allDry) {
      ctx.fillStyle = PALETTE.uiWarn;
      ctx.fillText('melee', wx, wy + 12);
    } else if (wpn.reloading) {
      ctx.fillStyle = PALETTE.uiWarn;
      ctx.fillText('RELOADING', wx, wy + 12);
    } else {
      ctx.fillStyle = wpn.mag === 0 ? PALETTE.uiDanger
                    : wpn.mag <= wpn.magSize / 4 ? PALETTE.uiWarn
                    : PALETTE.uiText;
      ctx.fillText(`${wpn.mag} / ${wpn.reserve}`, wx, wy + 12);
    }
    ctx.font = '10px monospace';
    ctx.fillStyle = PALETTE.uiDim;
    ctx.fillText(allDry ? '[scavenge for ammo]' : `[${wpn.ammoLabel}]`, wx, wy + 25);

    // Reload progress arc above weapon
    if (wpn.reloading) {
      const cx = wx - 60, cy = wy - 26;
      const p = 1 - wpn.reloadTimer / wpn.def.reloadTime;
      ctx.strokeStyle = PALETTE.uiDim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.uiAccent;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
    }

    // ── Top-left: night + wave ──
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`NIGHT ${director.nightNum} / ${NIGHT.totalNights}`, 14, 22);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    const waveDisp = Math.min(director.waveIdx + 1, director.waves.length);
    ctx.fillText(`wave ${waveDisp} / ${director.waves.length} · zombies ${director.zombies.length}`, 14, 38);

    // ── Top-right: kills + scrap ──
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`KILLS  ${player.kills}`, w - 14, 22);
    ctx.fillStyle = PALETTE.uiAccent;
    ctx.fillText(`SCRAP  ${player.scrap}`, w - 14, 40);

    // ── Toast (mid-bottom) ──
    if (this.toast) {
      const a = Math.min(1, this.toast.life / this.toast.maxLife * 1.4);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.toast.color;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.toast.text, w / 2, h - 80);
      ctx.globalAlpha = 1;
    }

    // ── Wave label (top-center, big) ──
    if (this.waveLabel) {
      const a = Math.min(1, this.waveLabel.life / this.waveLabel.maxLife * 1.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.waveLabel.color;
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.waveLabel.text, w / 2, 80);
      ctx.globalAlpha = 1;
    }
  }
}
