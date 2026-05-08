// ChaseEntity: an unkillable pursuer that activates when the player
// enters a chase zone. Movement is deliberately just under the player's
// sprint speed, so a panicked sprint outruns it but a cautious walk
// gets caught. Contact = instant death (or a heavy chunk of damage —
// `lethalDamage` defaults to 9999, but a chase def can lower it).
//
// Doesn't take damage. Doesn't slot into the WaveDirector's zombie list
// — CombatScene keeps a separate `hazards` array so kill-credit, scrap,
// and the spatial hash don't interact with it.
//
// Cosmetic: heavy footstep cadence keyed to dread (chain_drag SFX) and
// a faint dark trail behind it so the player feels its momentum.

import { events } from '../engine/EventBus.js';
import { angleTo } from '../util/geom.js';

export class ChaseEntity {
  constructor(opts) {
    const o = opts || {};
    this.x = o.x != null ? o.x : 0;
    this.y = o.y != null ? o.y : 0;
    this.r = o.r != null ? o.r : 22;
    this.speed = o.speed != null ? o.speed : 220;       // player base ≈ 240, sprint ≈ 360 — outrunnable, walking-distance lethal
    this.lethalR = o.lethalR != null ? o.lethalR : 28;
    this.lethalDamage = o.lethalDamage != null ? o.lethalDamage : 9999;
    this.alive = true;
    this.aim = 0;
    this._trail = [];                                    // {x, y} positions for fade-out trail
    this._trailTimer = 0;
    this._stepTimer = 0;
    this._color = o.color || '#0a0408';
    this._spawnDelay = o.spawnDelay != null ? o.spawnDelay : 1.0;  // brief grace period
    events.emit('CHASE_HUNT_START', { x: this.x, y: this.y });
  }

  update(dt, ctx) {
    if (this._spawnDelay > 0) {
      this._spawnDelay = Math.max(0, this._spawnDelay - dt);
      return;
    }
    const player = ctx && ctx.player;
    if (!player || !player.alive) return;

    this.aim = angleTo(this.x, this.y, player.x, player.y);
    this.x += Math.cos(this.aim) * this.speed * dt;
    this.y += Math.sin(this.aim) * this.speed * dt;
    if (ctx.arena && typeof ctx.arena.clamp === 'function') ctx.arena.clamp(this);

    // Trail samples for the rendering layer — drop one every 80ms.
    this._trailTimer += dt;
    if (this._trailTimer >= 0.08) {
      this._trailTimer = 0;
      this._trail.push({ x: this.x, y: this.y, life: 0.45 });
      if (this._trail.length > 8) this._trail.shift();
    }
    for (let i = this._trail.length - 1; i >= 0; i--) {
      this._trail[i].life -= dt;
      if (this._trail[i].life <= 0) this._trail.splice(i, 1);
    }

    // Heavy footstep cadence — slower at distance, snappier up close.
    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const stepInterval = Math.max(0.32, Math.min(0.7, dist / 600));
    this._stepTimer += dt;
    if (this._stepTimer >= stepInterval) {
      this._stepTimer = 0;
      if (ctx.audio && ctx.audio.playSfx) ctx.audio.playSfx('chain_drag');
    }

    // Lethal contact.
    if (dist < this.lethalR) {
      player.takeDamage(this.lethalDamage);
      events.emit('CHASE_CAUGHT', { x: this.x, y: this.y });
    }
  }

  despawn() {
    if (!this.alive) return;
    this.alive = false;
    events.emit('CHASE_HUNT_END', { x: this.x, y: this.y });
  }

  draw(ctx) {
    // Trail (oldest → newest), each a soft dark blob.
    for (const t of this._trail) {
      const a = Math.max(0, t.life / 0.45) * 0.45;
      ctx.fillStyle = `rgba(8,4,8,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this._spawnDelay > 0) {
      // Telegraph ring during the grace period so the player gets a
      // beat to read the threat instead of being instantly chased.
      ctx.globalAlpha = 0.35 + Math.random() * 0.2;
      ctx.strokeStyle = '#7a1018';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this._color;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    // Two faint red eyes facing the player so the silhouette reads.
    ctx.rotate(this.aim);
    ctx.fillStyle = 'rgba(220,40,40,0.85)';
    ctx.beginPath();
    ctx.arc(this.r * 0.45, -this.r * 0.30, 1.6, 0, Math.PI * 2);
    ctx.arc(this.r * 0.45,  this.r * 0.30, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
