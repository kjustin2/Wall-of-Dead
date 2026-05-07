// Slimmed particle system, derived from roguehero2/src/Particles.js. Keeps
// the parts we need:
//   - 400-cap object pool (free-list, zero alloc after warm-up)
//   - Damage numbers (floating text)
//   - Per-frame batched fillStyle/globalAlpha to minimize state changes
//
// Drops slash/ring/crashburst/etc. visuals — those will be re-added piecemeal
// in M5/M6 polish only when actually needed.
//
// IMPORTANT: never `this.particles.push()` directly; call _pushParticle so
// the cap is enforced. Pool reuse depends on it.

import { PARTICLES } from '../Config.js';

const PARTICLE_CAP = PARTICLES.cap;
const _particlePool = [];

// Module-level batch map — reset per frame, not replaced. Avoids GC pressure.
const _batchGroups = Object.create(null);
const _batchKeys = [];

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.texts = [];
  }

  clear() {
    // Return all live particles to pool so an arena reset doesn't leak.
    for (const p of this.particles) _particlePool.push(p);
    this.particles.length = 0;
    this.texts.length = 0;
  }

  _pushParticle(opts) {
    if (this.particles.length >= PARTICLE_CAP) return;
    const p = _particlePool.length > 0 ? _particlePool.pop() : {};
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx; p.vy = opts.vy;
    p.r = opts.r; p.color = opts.color;
    p.life = opts.life; p.maxLife = opts.maxLife;
    p.drag = opts.drag != null ? opts.drag : 0.9;
    this.particles.push(p);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        _particlePool.push(p);
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.vy += 70 * dt;
      t.x += (t.vx || 0) * dt;
      t.y += t.vy * dt;
      if (t.life <= 0) {
        this.texts[i] = this.texts[this.texts.length - 1];
        this.texts.pop();
      }
    }
  }

  draw(ctx, canvasW, canvasH) {
    if (this.particles.length > 0) {
      // Reset batch map without reallocating it.
      for (let i = 0; i < _batchKeys.length; i++) _batchGroups[_batchKeys[i]].count = 0;
      _batchKeys.length = 0;

      const cW = canvasW || 9999, cH = canvasH || 9999;
      for (const p of this.particles) {
        if (p.x + p.r < 0 || p.x - p.r > cW || p.y + p.r < 0 || p.y - p.r > cH) continue;
        const alpha = Math.round((p.life / p.maxLife) * 20) / 20;
        const key = p.color + '|' + alpha;
        let g = _batchGroups[key];
        if (!g) {
          g = { color: p.color, alpha, ps: [], count: 0 };
          _batchGroups[key] = g;
        }
        if (g.count === 0) _batchKeys.push(key);
        g.ps[g.count++] = p;
      }
      for (let k = 0; k < _batchKeys.length; k++) {
        const g = _batchGroups[_batchKeys[k]];
        ctx.fillStyle = g.color;
        ctx.globalAlpha = g.alpha;
        ctx.beginPath();
        for (let j = 0; j < g.count; j++) {
          const p = g.ps[j];
          const r = p.r * g.alpha;
          if (r <= 0) continue;
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (this.texts.length > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      let lastFont = null;
      for (let i = 0; i < this.texts.length; i++) {
        const t = this.texts[i];
        ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
        const font = `bold ${t.size}px monospace`;
        if (font !== lastFont) { ctx.font = font; lastFont = font; }
        ctx.fillText(t.text, t.x + 1, t.y + 1);
      }
      lastFont = null;
      for (let i = 0; i < this.texts.length; i++) {
        const t = this.texts[i];
        ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
        ctx.fillStyle = t.color;
        const font = `bold ${t.size}px monospace`;
        if (font !== lastFont) { ctx.font = font; lastFont = font; }
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ── Spawners ──

  spawnBlood(x, y) {
    const count = 9 + ((Math.random() * 5) | 0);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 200;
      this._pushParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2 + Math.random() * 3,
        color: Math.random() < 0.6 ? '#5a0a14' : '#3a060c',
        life: 0.3 + Math.random() * 0.25,
        maxLife: 0.55,
        drag: 0.88,
      });
    }
  }

  spawnMuzzleFlash(x, y, angle) {
    for (let i = 0; i < 5; i++) {
      const a = angle + (Math.random() - 0.5) * 0.5;
      const speed = 240 + Math.random() * 160;
      this._pushParticle({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 2 + Math.random() * 2,
        color: Math.random() < 0.5 ? '#ffe066' : '#ffaa33',
        life: 0.06 + Math.random() * 0.05,
        maxLife: 0.12,
        drag: 0.85,
      });
    }
  }

  spawnExplosion(x, y, radius) {
    const count = 24;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = radius * (2 + Math.random() * 2);
      this._pushParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 4,
        color: i < count * 0.5 ? '#ff8833' : '#ffaa33',
        life: 0.4, maxLife: 0.55,
        drag: 0.86,
      });
    }
  }

  spawnDamageNumber(x, y, amount) {
    const isText = typeof amount === 'string';
    const text = isText ? amount : String(amount);
    const color = isText ? '#88ffaa' : (amount >= 15 ? '#ffaa66' : '#ffd699');
    const size  = isText ? 13 : (amount >= 15 ? 18 : 14);
    this.texts.push({
      x: x + (Math.random() * 18 - 9),
      y: y - 12,
      vx: (Math.random() - 0.5) * 30,
      vy: -75,
      text, color, size,
      life: 0.85, maxLife: 0.85,
    });
  }
}
