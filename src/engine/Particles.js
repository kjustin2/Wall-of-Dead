// Fixed-cap particle pool. We never allocate during play — particles are
// recycled from a ring buffer. Used for blood spray, muzzle sparks, gore
// chunks, dust, and the dawn embers.

const CAP = 520;

export class Particles {
  constructor() {
    this.pool = new Array(CAP);
    for (let i = 0; i < CAP; i++) {
      this.pool[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', grav: 0, fade: true, glow: false };
    }
    this.head = 0;
  }

  _spawn() {
    // Overwrite the oldest slot — visually fine, keeps allocation at zero.
    const p = this.pool[this.head];
    this.head = (this.head + 1) % CAP;
    p.active = true;
    return p;
  }

  // Generic emitter. opts: {x,y,vx,vy,life,size,color,grav,glow}
  emit(opts) {
    const p = this._spawn();
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.life = p.maxLife = opts.life ?? 0.5;
    p.size = opts.size ?? 2;
    p.color = opts.color ?? '#fff';
    p.grav = opts.grav ?? 0;
    p.glow = !!opts.glow;
    p.fade = opts.fade !== false;
  }

  burst(x, y, n, baseOpts, spread = 120) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * spread;
      this.emit({
        ...baseOpts,
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
      });
    }
  }

  // Directional blood spray — biased along (dirx,diry) for bullet impacts.
  blood(x, y, dirx, diry, n = 8) {
    for (let i = 0; i < n; i++) {
      const spread = 1.6;
      const a = Math.atan2(diry, dirx) + (Math.random() - 0.5) * spread;
      const s = 40 + Math.random() * 180;
      this.emit({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.45,
        size: 1.5 + Math.random() * 2.5,
        color: Math.random() < 0.3 ? '#3a060a' : '#7a0d10',
        grav: 220,
      });
    }
  }

  update(dt) {
    for (let i = 0; i < CAP; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  render(ctx) {
    for (let i = 0; i < CAP; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const a = p.fade ? p.life / p.maxLife : 1;
      ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
      if (p.glow) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 6.283);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    for (let i = 0; i < CAP; i++) this.pool[i].active = false;
  }
}
