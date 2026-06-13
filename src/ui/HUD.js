// Canvas HUD for the night defense. Everything is drawn in screen space after
// the world (and after camera shake), so the readouts stay rock-steady. Pure
// functions — state comes in via the data bag.

import { VIEW, PAL } from '../Config.js';
import { WEAPONS } from '../game/Weapons.js';

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(0,0,0,0.55)') {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function drawNightHUD(ctx, d) {
  const { run, player, wall, director, companions, kills } = d;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // ── Top-left: night + dawn timer ──
  ctx.fillStyle = PAL.hud;
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`NIGHT ${run.night}`, 20, 32);
  ctx.font = '11px monospace';
  ctx.fillStyle = PAL.hudDim;
  ctx.fillText('HOLD UNTIL DAWN', 20, 48);
  bar(ctx, 20, 54, 200, 8, director.progress01, director.isDawn ? '#ffe08a' : '#5a7da8');
  // Sun creeps along the bar.
  const sx = 20 + 200 * director.progress01;
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath(); ctx.arc(sx, 58, 5, 0, 6.283); ctx.fill();

  // ── Top-center: road to the safe zone ──
  const cx = VIEW.W / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = PAL.hudDim;
  ctx.font = '11px monospace';
  ctx.fillText('ROAD TO THE SAFE ZONE', cx, 24);
  const pips = run.legsTotal;
  const pw = 26, gap = 8, totalW = pips * pw + (pips - 1) * gap;
  let px = cx - totalW / 2;
  for (let i = 0; i < pips; i++) {
    ctx.fillStyle = i < run.leg ? PAL.good : 'rgba(255,255,255,0.12)';
    ctx.fillRect(px, 32, pw, 6);
    px += pw + gap;
  }
  ctx.fillStyle = PAL.hudDim;
  ctx.font = '10px monospace';
  ctx.fillText(`${run.leg} / ${run.legsTotal} legs`, cx, 52);

  // ── Top-right: kills ──
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.hud;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`${kills} killed`, VIEW.W - 20, 30);

  // ── Bottom-left: health + wall ──
  ctx.textAlign = 'left';
  const by = VIEW.H - 70;
  ctx.fillStyle = PAL.hudDim;
  ctx.font = '10px monospace';
  ctx.fillText('VITALS', 20, by - 6);
  bar(ctx, 20, by, 220, 14, player.hp / player.maxHp,
    player.hp / player.maxHp < 0.3 ? '#c0392b' : '#9e2b25');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`${Math.ceil(player.hp)}`, 26, by + 11);

  ctx.fillStyle = PAL.hudDim;
  ctx.fillText('WALL', 20, by + 28);
  const integ = wall.integrity01();
  bar(ctx, 20, by + 32, 220, 14, integ, integ < 0.3 ? '#8a5a20' : '#6a7a82');
  if (wall.breachCount() > 0) {
    ctx.fillStyle = '#e0662e';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${wall.breachCount()} BREACH`, 250, by + 43);
  }

  // ── Companions roster ──
  if (companions && companions.length) {
    let ry = by - 26;
    ctx.font = '10px monospace';
    for (const co of companions) {
      ctx.fillStyle = co.downed ? '#7a3030' : '#8fb0c8';
      ctx.fillText(`${co.downed ? '✖' : '◆'} ${co.name}`, 300, ry);
      ry -= 14;
    }
  }

  // ── Bottom-right: weapon + ammo + ribbon ──
  const lo = player.loadout;
  const w = WEAPONS[lo.id];
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.hud;
  ctx.font = 'bold 20px monospace';
  ctx.fillText(w.name.toUpperCase(), VIEW.W - 20, VIEW.H - 52);
  ctx.font = 'bold 22px monospace';
  if (player.reloadT > 0) {
    ctx.fillStyle = '#ffd27a';
    ctx.fillText('RELOADING', VIEW.W - 20, VIEW.H - 26);
    bar(ctx, VIEW.W - 180, VIEW.H - 20, 160, 6, player.reloadProgress(), '#ffd27a');
  } else {
    ctx.fillStyle = lo.ammo === 0 ? '#c0392b' : '#fff';
    ctx.fillText(`${lo.ammo}`, VIEW.W - 70, VIEW.H - 24);
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '14px monospace';
    ctx.fillText(`/ ${lo.reserve}`, VIEW.W - 20, VIEW.H - 24);
  }

  // Weapon ribbon (active highlighted), drawn growing leftward.
  const n = run.weapons.length;
  let rx = VIEW.W - 20;
  ctx.textAlign = 'right';
  ctx.font = '11px monospace';
  for (let i = n - 1; i >= 0; i--) {
    const wd = WEAPONS[run.weapons[i].id];
    const label = `${i + 1}:${wd.name}`;
    const wpx = ctx.measureText(label).width + 14;
    const active = i === player.weaponIdx;
    ctx.fillStyle = active ? 'rgba(127,255,138,0.18)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(rx - wpx, VIEW.H - 92, wpx, 18);
    ctx.fillStyle = active ? PAL.accent : PAL.hudDim;
    ctx.fillText(label, rx - 7, VIEW.H - 79);
    rx -= wpx + 6;
  }
}
