// Real-time top-down arena shared by the action scavenge runs. Provides a
// fenced play area, a movable unarmed avatar (WASD/arrows), a pack of chasing
// zombies (seek + separation, with shove-stun support), supply crates, touch
// resolution, a countdown, and a polished render. Subclasses configure the
// scenario and define scoring via hooks:
//
//   configure()        set title/objective/controls/duration + spawn entities
//   step(dt, input)    per-frame scenario logic (crates, zone fill, shove)
//   onTouch(z)         what happens when a chaser grabs the avatar
//   scoreFrac()        0..1 performance → tier
//   renderHud(ctx)     extra readouts (composure, crate count, fill meter)

import { Minigame, tierFromFrac } from './Minigame.js';
import { VIEW, PAL } from '../Config.js';
import { events } from '../engine/EventBus.js';
import { clamp, dist2, TAU } from '../util/math.js';

export class ArenaMinigame extends Minigame {
  start() {
    this.area = { x: 240, y: 150, w: 800, h: 470 };
    const cx = this.area.x + this.area.w / 2, cy = this.area.y + this.area.h / 2;
    this.av = { x: cx, y: cy, r: 11, speed: 240, hitFlash: 0, stun: 0, fx: 0, fy: 1 };
    this.zombies = [];
    this.crates = [];
    this.sparks = [];           // tiny local particle list (minigames have no global pool)
    this.duration = 20;
    this.timeLeft = 20;
    this.elapsed = 0;
    this.stamina = 1;
    this.touchCd = 0;
    this.flash = 0;
    this.shake = 0;
    this.failed = false;
    this._frac = null;
    this.configure();
    this.timeLeft = this.duration;
  }

  // ── subclass hooks ──
  configure() {}
  step(dt, input) {}
  onTouch(z) {}
  scoreFrac() { return 0; }
  renderHud(ctx) {}

  // ── spawning ──
  edgePoint() {
    const a = this.area, m = 18;
    const side = (Math.random() * 4) | 0;
    if (side === 0) return { x: a.x + Math.random() * a.w, y: a.y + m };
    if (side === 1) return { x: a.x + a.w - m, y: a.y + Math.random() * a.h };
    if (side === 2) return { x: a.x + Math.random() * a.w, y: a.y + a.h - m };
    return { x: a.x + m, y: a.y + Math.random() * a.h };
  }

  spawnChaser(speed, r = 12) {
    const p = this.edgePoint();
    this.zombies.push({ x: p.x, y: p.y, r, speed, wob: Math.random() * TAU, stun: 0, eye: Math.random() < 0.5 ? '#c9ff6a' : '#ffcf6a' });
  }

  spawnCrate() {
    const a = this.area, pad = 40;
    this.crates.push({
      x: a.x + pad + Math.random() * (a.w - pad * 2),
      y: a.y + pad + Math.random() * (a.h - pad * 2),
      r: 12, taken: false, bob: Math.random() * TAU,
    });
  }

  spark(x, y, color, n = 8, spd = 140) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = Math.random() * spd;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, color, size: 2 + Math.random() * 2 });
    }
  }

  // ── movement ──
  moveAvatar(dt, input) {
    if (this.av.stun > 0) { this.av.stun -= dt; return; }
    let vx = 0, vy = 0;
    if (input.isDown('a') || input.isDown('arrowleft')) vx -= 1;
    if (input.isDown('d') || input.isDown('arrowright')) vx += 1;
    if (input.isDown('w') || input.isDown('arrowup')) vy -= 1;
    if (input.isDown('s') || input.isDown('arrowdown')) vy += 1;
    if (vx || vy) {
      const m = Math.hypot(vx, vy);
      vx /= m; vy /= m;
      this.av.fx = vx; this.av.fy = vy;
    }
    const a = this.area;
    this.av.x = clamp(this.av.x + vx * this.av.speed * dt, a.x + this.av.r, a.x + a.w - this.av.r);
    this.av.y = clamp(this.av.y + vy * this.av.speed * dt, a.y + this.av.r, a.y + a.h - this.av.r);
  }

  updateChasers(dt) {
    const a = this.area;
    for (const z of this.zombies) {
      z.wob += dt * 9;
      if (z.stun > 0) { z.stun -= dt; continue; }
      let dx = this.av.x - z.x, dy = this.av.y - z.y;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      // Light separation so they fan out rather than stack into one dot.
      let sx = 0, sy = 0;
      for (const o of this.zombies) {
        if (o === z) continue;
        const ox = z.x - o.x, oy = z.y - o.y, od2 = ox * ox + oy * oy;
        const rad = z.r + o.r + 6;
        if (od2 > 0 && od2 < rad * rad) { const od = Math.sqrt(od2); sx += ox / od; sy += oy / od; }
      }
      let vx = dx + sx * 0.7, vy = dy + sy * 0.7;
      const vm = Math.hypot(vx, vy) || 1;
      vx /= vm; vy /= vm;
      // A little shamble wobble perpendicular to travel.
      const wob = Math.sin(z.wob) * 0.25;
      z.x = clamp(z.x + (vx + -vy * wob) * z.speed * dt, a.x, a.x + a.w);
      z.y = clamp(z.y + (vy + vx * wob) * z.speed * dt, a.y, a.y + a.h);
    }
  }

  handleTouches(dt) {
    if (this.touchCd > 0) this.touchCd -= dt;
    for (const z of this.zombies) {
      const rr = this.av.r + z.r;
      if (dist2(this.av.x, this.av.y, z.x, z.y) < rr * rr && this.touchCd <= 0) {
        this.touchCd = 0.55;
        this.onTouch(z);
        return;
      }
    }
  }

  knockAvatarFrom(z, amt) {
    const dx = this.av.x - z.x, dy = this.av.y - z.y, d = Math.hypot(dx, dy) || 1;
    const a = this.area;
    this.av.x = clamp(this.av.x + dx / d * amt, a.x + this.av.r, a.x + a.w - this.av.r);
    this.av.y = clamp(this.av.y + dy / d * amt, a.y + this.av.r, a.y + a.h - this.av.r);
  }

  // ── main loop ──
  update(dt, input) {
    if (this.done) return;
    this.elapsed += dt;
    this.timeLeft -= dt;
    if (this.av.hitFlash > 0) this.av.hitFlash -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.shake > 0) this.shake -= dt;

    this.moveAvatar(dt, input);
    this.updateChasers(dt);
    this.handleTouches(dt);
    this.step(dt, input);

    for (const s of this.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    if (this.sparks.length > 120) this.sparks = this.sparks.filter(s => s.life > 0);

    if (this.timeLeft <= 0 || this.failed) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this._frac = clamp(this.scoreFrac(), 0, 1);
  }

  getResult() {
    const f = this._frac != null ? this._frac : clamp(this.scoreFrac(), 0, 1);
    return { tier: tierFromFrac(f), frac: f };
  }

  // ── render ──
  render(ctx) {
    ctx.fillStyle = '#080a09';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() * 2 - 1) * this.shake * 8, (Math.random() * 2 - 1) * this.shake * 8);

    const a = this.area;
    // Floor.
    const g = ctx.createRadialGradient(a.x + a.w / 2, a.y + a.h / 2, 40, a.x + a.w / 2, a.y + a.h / 2, a.w * 0.6);
    g.addColorStop(0, '#16201a');
    g.addColorStop(1, '#0c130f');
    ctx.fillStyle = g;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    // Grid.
    ctx.strokeStyle = 'rgba(80,120,90,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = a.x; x <= a.x + a.w; x += 48) { ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); }
    for (let y = a.y; y <= a.y + a.h; y += 48) { ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); }
    ctx.stroke();
    // Fence border.
    ctx.strokeStyle = '#3a463a';
    ctx.lineWidth = 4;
    ctx.strokeRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = 'rgba(120,140,120,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(a.x + 5, a.y + 5, a.w - 10, a.h - 10);
    ctx.setLineDash([]);

    // Scenario-specific ground markers (zone, etc.) drawn before entities.
    this.renderGround(ctx);

    // Crates.
    for (const c of this.crates) {
      if (c.taken) continue;
      const bob = Math.sin(this.elapsed * 4 + c.bob) * 2;
      ctx.fillStyle = '#6b5a32';
      ctx.fillRect(c.x - c.r, c.y - c.r + bob, c.r * 2, c.r * 2);
      ctx.strokeStyle = '#9c8244';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - c.r, c.y - c.r + bob, c.r * 2, c.r * 2);
      ctx.beginPath();
      ctx.moveTo(c.x - c.r, c.y - c.r + bob); ctx.lineTo(c.x + c.r, c.y + c.r + bob);
      ctx.moveTo(c.x + c.r, c.y - c.r + bob); ctx.lineTo(c.x - c.r, c.y + c.r + bob);
      ctx.stroke();
    }

    // Chasers.
    for (const z of this.zombies) {
      const bob = Math.sin(z.wob) * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(z.x, z.y + z.r * 0.7, z.r * 0.9, z.r * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = z.stun > 0 ? '#6a7a55' : '#47592f';
      ctx.beginPath(); ctx.arc(z.x, z.y + bob, z.r, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = z.eye;
      ctx.beginPath(); ctx.arc(z.x - z.r * 0.3, z.y - z.r * 0.2 + bob, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(z.x + z.r * 0.3, z.y - z.r * 0.2 + bob, 1.6, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Avatar (a survivor; a little facing nub shows heading).
    const av = this.av;
    const flick = av.hitFlash > 0 && Math.floor(av.hitFlash * 30) % 2 === 0;
    if (!flick) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(av.x, av.y + av.r * 0.7, av.r * 0.9, av.r * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = av.hitFlash > 0 ? '#e87a6a' : '#cfe8d0';
      ctx.beginPath(); ctx.arc(av.x, av.y, av.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a4a3c';
      ctx.beginPath(); ctx.arc(av.x + av.fx * av.r * 0.5, av.y + av.fy * av.r * 0.5, av.r * 0.4, 0, TAU); ctx.fill();
    }
    // A small light around the avatar.
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(av.x, av.y, 4, av.x, av.y, 110);
    lg.addColorStop(0, 'rgba(180,210,170,0.18)');
    lg.addColorStop(1, 'rgba(120,150,120,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(av.x, av.y, 110, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Sparks.
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      ctx.globalAlpha = clamp(s.life / s.max, 0, 1);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Hit flash wash.
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(150,20,20,${Math.min(0.4, this.flash * 0.5)})`;
      ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    }

    this.renderHeader(ctx);
    this.renderHud(ctx);
  }

  renderGround(ctx) {}

  renderHeader(ctx) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.accent;
    ctx.font = 'bold 24px monospace';
    ctx.fillText(this.title, VIEW.W / 2, 56);
    ctx.fillStyle = PAL.hud;
    ctx.font = '13px monospace';
    ctx.fillText(this.objective, VIEW.W / 2, 80);
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '11px monospace';
    ctx.fillText(this.controls, VIEW.W / 2, 100);

    // Countdown bar.
    const w = 360, x = VIEW.W / 2 - w / 2, y = 116;
    const frac = clamp(this.timeLeft / this.duration, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = frac < 0.25 ? '#d8662e' : '#7fb0d8';
    ctx.fillRect(x, y, w * frac, 8);
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '11px monospace';
    ctx.fillText(`${Math.ceil(this.timeLeft)}s`, VIEW.W / 2, y + 24);
  }

  // Shared composure (stamina) bar used by survival-style runs.
  drawStamina(ctx, label = 'COMPOSURE') {
    const w = 200, x = this.area.x, y = this.area.y - 26;
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '10px monospace';
    ctx.fillText(label, x, y - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = this.stamina < 0.34 ? '#c0392b' : '#5fbf6a';
    ctx.fillRect(x, y, w * clamp(this.stamina, 0, 1), 10);
  }
}
