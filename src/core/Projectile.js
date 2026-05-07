// Pooled bullets. Adapted from roguehero2/src/Projectile.js.
// Free-list pattern: dead projectiles are returned to _pool and reused.
// Trail slots are pre-allocated and mutated in-place — never reassigned.

import { events } from '../engine/EventBus.js';

const _pool = [];
const TRAIL_LEN = 4;

function makeProjectile() {
  const trail = new Array(TRAIL_LEN);
  for (let i = 0; i < TRAIL_LEN; i++) trail[i] = { x: 0, y: 0 };
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 3,
    life: 0, maxLife: 0,
    damage: 1,
    color: '#ffe066',
    weaponId: '',
    pierce: 0,
    hitSet: null,
    source: 'player',
    aoe: null,            // {radius, damage, falloff} — explodes on impact
    alive: false,
    trail,
    trailIdx: 0,
  };
}

export class ProjectileManager {
  constructor() {
    this.list = [];
  }

  spawn(opts) {
    const p = _pool.length > 0 ? _pool.pop() : makeProjectile();
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx; p.vy = opts.vy;
    p.r = opts.r != null ? opts.r : 3;
    p.maxLife = opts.life != null ? opts.life : 0.7;
    p.life = p.maxLife;
    p.damage = opts.damage != null ? opts.damage : 1;
    p.color = opts.color || '#ffe066';
    p.weaponId = opts.weaponId || '';
    p.pierce = opts.pierce || 0;
    p.source = opts.source || 'player';
    p.aoe = opts.aoe || null;
    if (p.pierce > 0) {
      if (!p.hitSet) p.hitSet = new Set();
      else p.hitSet.clear();
    } else {
      p.hitSet = null;
    }
    p.alive = true;
    p.trailIdx = 0;
    for (let i = 0; i < TRAIL_LEN; i++) {
      p.trail[i].x = opts.x;
      p.trail[i].y = opts.y;
    }
    this.list.push(p);
    return p;
  }

  // Update each projectile, run callback against each candidate target from
  // the spatial hash. Caller decides damage application + retiring.
  update(dt, arena, zombieHash, onZombieHit) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.alive) { this._retire(i); continue; }

      p.life -= dt;
      if (p.life <= 0) { p.alive = false; this._retire(i); continue; }

      // Step trail
      const t = p.trail[p.trailIdx];
      t.x = p.x; t.y = p.y;
      p.trailIdx = (p.trailIdx + 1) % TRAIL_LEN;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Out-of-arena → retire
      if (p.x < arena.x || p.x > arena.x + arena.w || p.y < arena.y || p.y > arena.y + arena.h) {
        p.alive = false; this._retire(i); continue;
      }

      // Collision: candidate sweep via spatial hash
      if (p.source === 'player' && zombieHash) {
        const cands = zombieHash.query(p.x, p.y, p.r);
        for (let c = 0; c < cands.length; c++) {
          const z = cands[c];
          if (!z.alive) continue;
          if (p.hitSet && p.hitSet.has(z)) continue;
          const dx = z.x - p.x, dy = z.y - p.y;
          const tr = z.r + p.r;
          if (dx * dx + dy * dy <= tr * tr) {
            onZombieHit(z, p);
            if (p.aoe) {
              // Rocket-style impact — emit explosion then retire bullet.
              events.emit('AOE_EXPLOSION', {
                x: p.x, y: p.y,
                radius: p.aoe.radius,
                damage: p.aoe.damage,
                falloff: p.aoe.falloff != null ? p.aoe.falloff : 0.5,
                source: p.weaponId,
              });
              p.alive = false;
              break;
            }
            if (p.pierce > 0) {
              p.hitSet.add(z);
              p.pierce -= 1;
            } else {
              p.alive = false;
            }
            if (!p.alive) break;
          }
        }
        if (!p.alive) { this._retire(i); continue; }
      }

      // Zombie projectile vs player handled by CombatScene directly via
      // simple per-projectile distance check (only one target).
    }
  }

  _retire(idx) {
    const p = this.list[idx];
    p.alive = false;
    // Swap-pop for O(1) removal.
    this.list[idx] = this.list[this.list.length - 1];
    this.list.pop();
    _pool.push(p);
  }

  draw(ctx) {
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      // Trail
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = p.r * 1.4;
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < TRAIL_LEN; k++) {
        const t = p.trail[(p.trailIdx + k) % TRAIL_LEN];
        if (!started) { ctx.moveTo(t.x, t.y); started = true; }
        else ctx.lineTo(t.x, t.y);
      }
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Bullet head
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Used by zombie acid spit — single-target collision against the player.
  // Player passed in so ProjectileManager doesn't import Player.
  resolveAgainstPlayer(player, onPlayerHit) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.alive || p.source !== 'zombie') continue;
      const dx = player.x - p.x, dy = player.y - p.y;
      const tr = player.r + p.r;
      if (dx * dx + dy * dy <= tr * tr) {
        onPlayerHit(p);
        p.alive = false;
        this._retire(i);
      }
    }
  }
}
