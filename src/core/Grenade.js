// Thrown grenade. Arcs from player → target with a fuse timer; on
// timeout (or when it leaves the arena), explodes via AOE_EXPLOSION.
//
// Uses simple ballistic-style decay rather than full physics — feels
// arcade-y and predictable. Players who want twitch shooters use guns;
// this is the "place damage at a known spot in 1.4s" tool.

import { Entity } from './Entity.js';
import { events } from '../engine/EventBus.js';

export class Grenade extends Entity {
  constructor(x, y, vx, vy, def) {
    super(x, y, 5);
    this.vx = vx;
    this.vy = vy;
    this.def = def;                  // { aoe:{radius,damage,falloff}, fuseTime }
    this.fuse = def.fuseTime || 1.4;
    this.spinT = 0;
  }

  update(dt, arena) {
    this.fuse -= dt;
    if (this.fuse <= 0) { this._explode(); return; }

    // Linear horizontal motion + drag for an arc-ish feel
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.985;
    this.vy *= 0.985;
    this.spinT += dt;

    // Bounce off arena walls — feels nicer than vanish-at-edge
    const margin = arena.wall + this.r;
    if (this.x < arena.x + margin) { this.x = arena.x + margin; this.vx = -this.vx * 0.6; }
    if (this.x > arena.x + arena.w - margin) { this.x = arena.x + arena.w - margin; this.vx = -this.vx * 0.6; }
    if (this.y < arena.y + margin) { this.y = arena.y + margin; this.vy = -this.vy * 0.6; }
    if (this.y > arena.y + arena.h - margin) { this.y = arena.y + arena.h - margin; this.vy = -this.vy * 0.6; }
  }

  _explode() {
    this.alive = false;
    events.emit('AOE_EXPLOSION', {
      x: this.x, y: this.y,
      radius: this.def.aoe.radius,
      damage: this.def.aoe.damage,
      falloff: this.def.aoe.falloff,
      source: 'grenade',
    });
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spinT * 8);
    ctx.fillStyle = '#3a4a1a';
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1c1410';
    ctx.lineWidth = 1;
    ctx.stroke();
    // pin
    ctx.fillStyle = '#ddccaa';
    ctx.fillRect(this.r - 1, -1.5, 3, 3);
    ctx.restore();
    // Pulsing fuse light intensifies as fuse shortens
    const lit = 1 - this.fuse / (this.def.fuseTime || 1.4);
    if (lit > 0) {
      ctx.fillStyle = `rgba(255,80,40,${0.3 + lit * 0.6})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y - this.r - 2, 2 + lit * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
