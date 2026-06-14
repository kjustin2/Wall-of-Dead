// Night HUD — drawn in screen space after the world + post FX, so it stays
// crisp. Framed translucent panels, a dawn timeline, road progress, vitals
// with bars, a companion strip, and a weapon panel with ammo pips. Pure
// functions; state arrives via the data bag.

import { VIEW, PAL } from '../Config.js';
import { WEAPONS } from '../game/Weapons.js';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(6,10,11,0.62)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(127,255,138,0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function drawNightHUD(ctx, d) {
  const { run, player, wall, director, companions, kills } = d;
  ctx.textBaseline = 'alphabetic';

  // ── Top bar: night · dawn timeline · road · kills ──
  panel(ctx, 14, 12, VIEW.W - 28, 56);

  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.hud;
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`NIGHT ${run.night}`, 28, 38);
  ctx.fillStyle = PAL.hudDim;
  ctx.font = '10px monospace';
  ctx.fillText('HOLD UNTIL DAWN', 28, 54);

  // Dawn timeline.
  const tlx = 190, tlw = 360, tly = 40;
  bar(ctx, tlx, tly, tlw, 7, director.progress01, director.isDawn ? '#ffe08a' : '#5a7da8');
  const sx = tlx + tlw * director.progress01;
  ctx.fillStyle = '#ffe49a';
  ctx.beginPath(); ctx.arc(sx, tly + 3.5, 6, 0, 6.2832); ctx.fill();
  ctx.fillStyle = PAL.hudDim;
  ctx.font = '9px monospace';
  ctx.fillText('☾', tlx - 2, tly - 4);
  ctx.textAlign = 'right';
  ctx.fillText('DAWN ☀', tlx + tlw + 2, tly - 4);

  // Road progress (right of timeline).
  ctx.textAlign = 'center';
  ctx.fillStyle = PAL.hudDim;
  ctx.font = '9px monospace';
  const rcx = VIEW.W - 230;
  ctx.fillText('ROAD TO SAFE ZONE', rcx, 28);
  const pips = run.legsTotal, pw = 22, gap = 6;
  let px = rcx - (pips * pw + (pips - 1) * gap) / 2;
  for (let i = 0; i < pips; i++) {
    ctx.fillStyle = i < run.leg ? PAL.good : 'rgba(255,255,255,0.14)';
    ctx.fillRect(px, 36, pw, 6);
    if (i === run.leg) { ctx.fillStyle = '#ffe49a'; ctx.fillRect(px, 36, pw, 6); }
    px += pw + gap;
  }

  // Kills.
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.hud;
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`${kills}`, VIEW.W - 28, 38);
  ctx.fillStyle = PAL.hudDim;
  ctx.font = '9px monospace';
  ctx.fillText('KILLED', VIEW.W - 28, 52);

  // ── Bottom-left: vitals ──
  const vy = VIEW.H - 92;
  panel(ctx, 14, vy, 286, 78);
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.hudDim;
  ctx.font = '10px monospace';
  ctx.fillText('♥ HEALTH', 26, vy + 20);
  const hpf = player.hp / player.maxHp;
  bar(ctx, 26, vy + 24, 262, 13, hpf, hpf < 0.3 ? '#c0392b' : '#9e2b25');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${Math.ceil(player.hp)}`, 30, vy + 34);

  ctx.fillStyle = PAL.hudDim;
  ctx.font = '10px monospace';
  ctx.fillText('▣ WALL', 26, vy + 52);
  const integ = wall.integrity01();
  bar(ctx, 26, vy + 56, 262, 13, integ, integ < 0.3 ? '#8a5a20' : '#6a7a82');
  if (wall.breachCount() > 0) {
    ctx.fillStyle = '#e0662e';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`⚠ ${wall.breachCount()} BREACH`, 288, vy + 66);
    ctx.textAlign = 'left';
  }

  // Companion strip.
  if (companions && companions.length) {
    let cx = 314;
    for (const co of companions) {
      const w = 96;
      ctx.fillStyle = 'rgba(6,10,11,0.6)';
      ctx.fillRect(cx, VIEW.H - 40, w, 26);
      ctx.strokeStyle = co.downed ? 'rgba(120,40,40,0.5)' : 'rgba(120,160,200,0.4)';
      ctx.strokeRect(cx + 0.5, VIEW.H - 39.5, w, 26);
      ctx.fillStyle = co.downed ? '#7a3030' : '#8fb0c8';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${co.downed ? '✖' : '◆'} ${co.name}`, cx + 6, VIEW.H - 28);
      if (!co.downed) bar(ctx, cx + 6, VIEW.H - 22, w - 12, 4, co.hp / co.maxHp, '#5fbf6a');
      cx += w + 8;
    }
  }

  // ── Bottom-right: weapon ──
  const lo = player.loadout, w = WEAPONS[lo.id];
  const px2 = VIEW.W - 300, py2 = VIEW.H - 92;
  panel(ctx, px2, py2, 286, 78);

  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.hud;
  ctx.font = 'bold 19px monospace';
  ctx.fillText(w.name.toUpperCase(), px2 + 14, py2 + 26);

  if (player.reloadT > 0) {
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('RELOADING', px2 + 272, py2 + 24);
    bar(ctx, px2 + 120, py2 + 30, 152, 6, player.reloadProgress(), '#ffd27a');
  } else {
    // Ammo pips for the current mag.
    const pipW = Math.min(12, (262) / w.mag);
    let ax = px2 + 14;
    for (let i = 0; i < w.mag; i++) {
      ctx.fillStyle = i < lo.ammo ? '#ffe49a' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(ax, py2 + 34, pipW - 2, 9);
      ax += pipW;
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '13px monospace';
    ctx.fillText(`${lo.ammo} / ${lo.reserve}`, px2 + 272, py2 + 26);
  }

  // Weapon slots.
  ctx.textAlign = 'left';
  let wx = px2 + 14;
  ctx.font = '10px monospace';
  for (let i = 0; i < run.weapons.length; i++) {
    const wd = WEAPONS[run.weapons[i].id];
    const active = i === player.weaponIdx;
    const label = `${i + 1} ${wd.name}`;
    const bw = ctx.measureText(label).width + 12;
    ctx.fillStyle = active ? 'rgba(127,255,138,0.18)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(wx, py2 + 52, bw, 16);
    ctx.strokeStyle = active ? PAL.accent : 'rgba(255,255,255,0.1)';
    ctx.strokeRect(wx + 0.5, py2 + 52.5, bw, 16);
    ctx.fillStyle = active ? PAL.accent : PAL.hudDim;
    ctx.fillText(label, wx + 6, py2 + 63);
    wx += bw + 6;
  }
}
