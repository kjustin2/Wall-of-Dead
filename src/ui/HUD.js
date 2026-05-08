// In-combat HUD. Programmatic — no sprite atlas. Designed to be unobtrusive
// in the corners so the center of the screen stays clean for action.

import { PALETTE, PLAYER, NIGHT } from '../Config.js';
import { truncateToWidth } from '../util/text.js';

export class HUD {
  constructor() {
    this.toast = null;       // { text, color, life, maxLife } — gameplay hint, top-center bottom-mid
    this.waveLabel = null;   // { text, color, life, maxLife } — wave / clear / respawn label, top-center
    this.loreToast = null;   // { lines, life, maxLife }       — narrative pickup, lower-third italic
  }

  setToast(text, color, dur) {
    this.toast = { text, color: color || PALETTE.uiText, life: dur || 1.6, maxLife: dur || 1.6 };
  }

  setWaveLabel(text, color, dur) {
    this.waveLabel = { text, color: color || PALETTE.uiAccent, life: dur || 2.2, maxLife: dur || 2.2 };
  }

  // Distinct slot from setToast so a note pickup doesn't clobber a
  // gameplay hint (or vice-versa). Multi-line text is split on '\n'.
  setLoreToast(text, dur) {
    const lines = String(text || '').split('\n').filter(s => s.length > 0);
    this.loreToast = { lines, life: dur || 5.0, maxLife: dur || 5.0 };
  }

  update(dt) {
    if (this.toast)      { this.toast.life      -= dt; if (this.toast.life      <= 0) this.toast = null; }
    if (this.waveLabel)  { this.waveLabel.life  -= dt; if (this.waveLabel.life  <= 0) this.waveLabel = null; }
    if (this.loreToast)  { this.loreToast.life  -= dt; if (this.loreToast.life  <= 0) this.loreToast = null; }
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

    // ── Bottom-right: weapon ribbon (slot per inventory entry) ──
    // Drawn first so the weapon name/ammo block below stays in the same
    // place. Active slot has a green ring + filled background; inactive
    // slots are dim. The first letter of each weapon name acts as a glyph
    // (P/S/SH/A/...) and a tiny mag-bar shows mag-fullness at a glance.
    if (player.inventory && player.inventory.length > 0) {
      const slotW = 22, slotH = 22, slotGap = 4;
      const ribbonY = h - 110;
      const totalW = player.inventory.length * slotW + (player.inventory.length - 1) * slotGap;
      const ribbonX = w - 14 - totalW;
      for (let i = 0; i < player.inventory.length; i++) {
        const sw = player.inventory[i];
        const sx = ribbonX + i * (slotW + slotGap);
        const active = i === player.currentWeaponIdx;
        const empty = sw.mag <= 0 && sw.reserve <= 0 && sw.def.ammoType.id !== 'MELEE';

        // Slot background
        ctx.fillStyle = active ? 'rgba(126,255,102,0.22)' : 'rgba(20,22,26,0.7)';
        ctx.fillRect(sx, ribbonY, slotW, slotH);
        ctx.strokeStyle = active ? PALETTE.uiAccent : (empty ? PALETTE.uiDim : PALETTE.uiText);
        ctx.lineWidth = active ? 2 : 1;
        ctx.strokeRect(sx, ribbonY, slotW, slotH);

        // Glyph: first letter (or two for 'sh', 'sn' if you want — keep
        // single-letter for simplicity).
        ctx.fillStyle = empty ? PALETTE.uiDim : (active ? PALETTE.uiAccent : PALETTE.uiText);
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        const glyph = sw.def.name[0].toUpperCase();
        ctx.fillText(glyph, sx + slotW / 2, ribbonY + slotH / 2 + 4);

        // Slot number, top-left corner of slot
        ctx.fillStyle = PALETTE.uiDim;
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1), sx + 2, ribbonY + 8);

        // Tiny mag-bar under the slot.
        const barH = 2;
        const magFrac = sw.def.magSize > 0 ? Math.max(0, Math.min(1, sw.mag / sw.def.magSize)) : 1;
        ctx.fillStyle = 'rgba(20,22,26,0.7)';
        ctx.fillRect(sx, ribbonY + slotH + 1, slotW, barH);
        ctx.fillStyle = magFrac > 0.5 ? PALETTE.uiAccent
                      : magFrac > 0.2 ? PALETTE.uiWarn
                                      : PALETTE.uiDanger;
        ctx.fillRect(sx, ribbonY + slotH + 1, slotW * magFrac, barH);
      }
    }

    // ── Bottom-right: weapon + ammo ──
    const wx = w - 14, wy = h - 50;
    ctx.textAlign = 'right';
    const wpn = player.weapon;
    const allDry = player._allDry && player._allDry();
    ctx.fillStyle = allDry ? PALETTE.uiWarn : PALETTE.uiText;
    ctx.font = 'bold 14px monospace';
    // Truncate so unusually long weapon names (e.g. modded entries) can't
    // bleed into the kills/scrap column on a narrow viewport.
    const nameLabel = allDry ? 'KNIFE (NO AMMO)' : truncateToWidth(ctx, wpn.name.toUpperCase(), 200);
    ctx.fillText(nameLabel, wx, wy - 12);
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

    // ── Lore toast (lower-third, italic, multi-line) ──
    // Distinct slot from .toast so a note pickup never collides with a
    // wave/cycle/checkpoint hint. Lines stack upward from a baseline so
    // long transcripts read top-to-bottom in reading order.
    if (this.loreToast) {
      const a = Math.min(1, this.loreToast.life / this.loreToast.maxLife * 1.4);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cdb88a';
      ctx.font = 'italic 15px monospace';
      ctx.textAlign = 'center';
      const baseY = h - 170;
      const lineH = 19;
      const lines = this.loreToast.lines;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText(lines[i], w / 2 + 1, baseY + i * lineH + 1);
        ctx.fillStyle = '#cdb88a';
        ctx.fillText(lines[i], w / 2,     baseY + i * lineH);
      }
      ctx.globalAlpha = 1;
    }
  }
}
