// Scenery behind the action. The static night layers (sky, stars, moon, a
// ruined skyline, treeline, the field) are rendered ONCE into an offscreen
// canvas and blitted each frame — cheaper and lets us pile on detail. Animated
// fog drifts on top. drawVignette is the shared edge-darkening used by menus.
//
// Headless-safe: if an offscreen canvas can't be made, we fall back to a plain
// gradient field drawn directly (no crash, just less pretty).

import { VIEW, FIELD, PAL } from '../Config.js';
import { TAU } from '../util/math.js';

let _night = undefined;   // offscreen canvas (or null if unavailable)

export function drawNightField(ctx, time) {
  if (_night === undefined) _night = buildNight();
  if (_night) ctx.drawImage(_night, 0, 0);
  else simpleField(ctx);
  drawFog(ctx, time);
  drawEmbers(ctx, time);
}

function buildNight() {
  let c;
  try {
    c = document.createElement('canvas');
    c.width = VIEW.W; c.height = VIEW.H;
  } catch (e) { return null; }
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const W = VIEW.W, H = VIEW.H, hz = FIELD.HORIZON_Y;

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, hz + 80);
  sky.addColorStop(0, '#05070b');
  sky.addColorStop(0.6, '#0a121b');
  sky.addColorStop(1, '#16242e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, hz + 80);

  // Stars.
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * W;
    const y = Math.random() * (hz - 6);
    const a = 0.15 + Math.random() * 0.5;
    ctx.fillStyle = `rgba(200,220,230,${a})`;
    const s = Math.random() < 0.85 ? 1 : 1.6;
    ctx.fillRect(x, y, s, s);
  }

  // Moon + halo.
  const mx = W * 0.76, my = 60;
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(mx, my, 6, mx, my, 150);
  halo.addColorStop(0, 'rgba(190,205,180,0.30)');
  halo.addColorStop(0.4, 'rgba(150,170,160,0.10)');
  halo.addColorStop(1, 'rgba(120,140,120,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(mx, my, 150, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#c8d0bc';
  ctx.beginPath(); ctx.arc(mx, my, 26, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(90,100,90,0.45)';
  [[8, -5, 7], [-7, 7, 5], [4, 10, 3.5], [-10, -8, 3]].forEach(([dx, dy, r]) => {
    ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, TAU); ctx.fill();
  });
  // Thin cloud band across the moon.
  ctx.fillStyle = 'rgba(12,18,22,0.55)';
  ctx.fillRect(mx - 60, my - 4, 120, 7);
  ctx.fillRect(mx - 40, my + 8, 100, 5);

  // Distant ruined skyline near the horizon.
  let bx = -20;
  while (bx < W + 20) {
    const bw = 26 + Math.random() * 60;
    const bh = 30 + Math.random() * 80;
    const top = hz - bh;
    ctx.fillStyle = '#070b0e';
    ctx.fillRect(bx, top, bw, bh + 6);
    // Broken roofline.
    ctx.fillStyle = '#05080a';
    ctx.fillRect(bx + bw * 0.3, top - 6 - Math.random() * 8, bw * 0.2, 8);
    // A few faint lit windows.
    if (Math.random() < 0.5) {
      ctx.fillStyle = 'rgba(200,150,70,0.18)';
      for (let k = 0; k < 3; k++) {
        if (Math.random() < 0.4) ctx.fillRect(bx + 6 + (k % 3) * (bw / 3), top + 10 + ((k * 13) % bh), 3, 4);
      }
    }
    bx += bw + 4;
  }

  // Jagged treeline just in front of the skyline.
  ctx.fillStyle = '#04070a';
  ctx.beginPath();
  ctx.moveTo(0, hz);
  for (let x = 0; x <= W; x += 26) {
    const h = 12 + ((x * 9301 + 49297) % 233) / 233 * 28;
    ctx.lineTo(x, hz - h);
    ctx.lineTo(x + 13, hz - h * 0.35);
  }
  ctx.lineTo(W, hz); ctx.closePath(); ctx.fill();

  // The field — darkest far, lifting toward the wall.
  const field = ctx.createLinearGradient(0, hz, 0, FIELD.WALL_Y);
  field.addColorStop(0, '#0a1016');
  field.addColorStop(1, '#0e1712');
  ctx.fillStyle = field;
  ctx.fillRect(0, hz, W, FIELD.WALL_Y - hz);

  // Cracked-earth + grave-mound detail (deterministic, all-positive radii).
  for (let i = 0; i < 26; i++) {
    const r = (i * 2654435761) >>> 0;
    const x = r % W;
    const y = hz + 26 + ((r >>> 8) % (FIELD.WALL_Y - hz - 36));
    const w = 8 + ((r >>> 16) % 30);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.28, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x - w * 0.2, y - 3); ctx.lineTo(x + w * 0.6, y + 2); ctx.stroke();
  }

  // Ground behind the wall where the defenders stand.
  const grd = ctx.createLinearGradient(0, FIELD.WALL_BOTTOM - 10, 0, H);
  grd.addColorStop(0, '#0a0d0a');
  grd.addColorStop(1, '#050705');
  ctx.fillStyle = grd;
  ctx.fillRect(0, FIELD.WALL_BOTTOM - 10, W, H - FIELD.WALL_BOTTOM + 10);

  return c;
}

function simpleField(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.H);
  g.addColorStop(0, '#070a0d');
  g.addColorStop(1, '#0c130f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
}

export function drawFog(ctx, time) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 5; i++) {
    const speed = 7 + i * 4;
    const y = FIELD.HORIZON_Y + 40 + i * 84;
    const off = (time * speed + i * 280) % (VIEW.W + 520) - 260;
    const g = ctx.createRadialGradient(off, y, 0, off, y, 280);
    g.addColorStop(0, `rgba(120,140,130,${0.045 - i * 0.006})`);
    g.addColorStop(1, 'rgba(120,140,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(off, y, 280, 64, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Faint ash drifting up through the field.
function drawEmbers(ctx, time) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const seed = i * 1103515245;
    const baseX = (seed >>> 8) % VIEW.W;
    const x = baseX + Math.sin(time * 0.5 + i) * 14;
    const y = FIELD.WALL_Y - ((time * (10 + (i % 5) * 4) + (seed % 400)) % (FIELD.WALL_Y - FIELD.HORIZON_Y));
    const a = 0.10 + 0.10 * Math.sin(time * 2 + i);
    ctx.fillStyle = `rgba(180,160,120,${a})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.restore();
}

export function drawVignette(ctx, intensity) {
  const W = VIEW.W, H = VIEW.H;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.86);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.4 + intensity * 0.45})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (intensity > 0.5) {
    const r = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H);
    r.addColorStop(0, 'rgba(70,0,0,0)');
    r.addColorStop(1, `rgba(70,0,0,${(intensity - 0.5) * 0.5})`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
}
