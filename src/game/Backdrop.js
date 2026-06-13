// Static and animated scenery behind the action: night sky, moon, treeline,
// the dark field zombies cross, drifting fog, and the dread vignette. Kept
// separate so both the night and day scenes can share the mood.

import { VIEW, FIELD, PAL } from '../Config.js';
import { TAU } from '../util/math.js';

export function drawNightField(ctx, time) {
  const W = VIEW.W, H = VIEW.H;

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, FIELD.HORIZON_Y + 40);
  sky.addColorStop(0, PAL.skyTop);
  sky.addColorStop(1, PAL.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, FIELD.HORIZON_Y + 40);

  // Sickly moon with a soft halo.
  const mx = W * 0.74, my = 52;
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(mx, my, 4, mx, my, 90);
  halo.addColorStop(0, 'rgba(180,200,170,0.30)');
  halo.addColorStop(1, 'rgba(120,140,120,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(mx, my, 90, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#c2cbb4';
  ctx.beginPath(); ctx.arc(mx, my, 22, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(70,80,70,0.5)';
  ctx.beginPath(); ctx.arc(mx + 7, my - 4, 6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx - 6, my + 6, 4, 0, TAU); ctx.fill();

  // Ragged treeline silhouette along the horizon.
  ctx.fillStyle = '#05080a';
  ctx.beginPath();
  ctx.moveTo(0, FIELD.HORIZON_Y);
  for (let x = 0; x <= W; x += 28) {
    const h = 14 + ((x * 9301 + 49297) % 233) / 233 * 26;
    ctx.lineTo(x, FIELD.HORIZON_Y - h);
    ctx.lineTo(x + 14, FIELD.HORIZON_Y - h * 0.4);
  }
  ctx.lineTo(W, FIELD.HORIZON_Y);
  ctx.closePath();
  ctx.fill();

  // The field — darkest at the horizon, lifting slightly toward the wall.
  const field = ctx.createLinearGradient(0, FIELD.HORIZON_Y, 0, FIELD.WALL_Y);
  field.addColorStop(0, PAL.fieldFar);
  field.addColorStop(1, PAL.fieldNear);
  ctx.fillStyle = field;
  ctx.fillRect(0, FIELD.HORIZON_Y, W, FIELD.WALL_Y - FIELD.HORIZON_Y);

  // Faint scattered debris/grave-mounds for texture (deterministic).
  // NOTE: use unsigned shifts (>>>) — a signed >> on a >=2^31 hash yields a
  // negative value, and JS `%` keeps the sign, which would feed a negative
  // radius to ellipse() and throw, aborting the whole frame's render.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 22; i++) {
    const r = (i * 2654435761) >>> 0;
    const x = (r % W);
    const y = FIELD.HORIZON_Y + 30 + ((r >>> 8) % (FIELD.WALL_Y - FIELD.HORIZON_Y - 40));
    const w = 8 + ((r >>> 16) % 26);
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.3, 0, 0, TAU);
    ctx.fill();
  }

  // Ground behind the wall (where the player stands).
  ctx.fillStyle = '#0a0c0a';
  ctx.fillRect(0, FIELD.WALL_BOTTOM, W, H - FIELD.WALL_BOTTOM);

  drawFog(ctx, time);
}

export function drawFog(ctx, time) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 4; i++) {
    const speed = 8 + i * 5;
    const y = FIELD.HORIZON_Y + 50 + i * 90;
    const off = (time * speed + i * 320) % (VIEW.W + 400) - 200;
    const g = ctx.createRadialGradient(off, y, 0, off, y, 260);
    g.addColorStop(0, `rgba(120,140,130,${0.05 - i * 0.008})`);
    g.addColorStop(1, 'rgba(120,140,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(off, y, 260, 70, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// Dread vignette — darkens the screen edges; intensity 0..1.
export function drawVignette(ctx, intensity) {
  const W = VIEW.W, H = VIEW.H;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.45 + intensity * 0.45})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (intensity > 0.5) {
    // Creeping red at the corners when things are dire.
    const r = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H);
    r.addColorStop(0, 'rgba(80,0,0,0)');
    r.addColorStop(1, `rgba(80,0,0,${(intensity - 0.5) * 0.5})`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
}
