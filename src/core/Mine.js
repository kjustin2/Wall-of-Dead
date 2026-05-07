// Placeable proximity mine. Arms after a short delay so the player who
// dropped it can't immediately set it off; then explodes when any zombie
// enters the trigger radius.

import { Entity } from './Entity.js';
import { events } from '../engine/EventBus.js';

export class Mine extends Entity {
  constructor(x, y, def) {
    super(x, y, 8);
    this.def = def;                        // { radius, damage, armDelay }
    this.armTimer = def.armDelay || 0.7;
    this.beepT = 0;
    this.detonated = false;
  }

  update(dt, zombies) {
    if (this.detonated) { this.alive = false; return; }
    if (this.armTimer > 0) {
      this.armTimer = Math.max(0, this.armTimer - dt);
      return;
    }
    this.beepT += dt;

    const r = this.def.radius * 0.45;       // trigger radius is smaller than damage
    const rSq = r * r;
    for (const z of zombies) {
      if (!z.alive || z.spawnTimer > 0) continue;
      const dx = z.x - this.x, dy = z.y - this.y;
      if (dx * dx + dy * dy <= rSq) {
        this._detonate();
        return;
      }
    }
  }

  _detonate() {
    this.detonated = true;
    events.emit('AOE_EXPLOSION', {
      x: this.x, y: this.y,
      radius: this.def.radius,
      damage: this.def.damage,
      falloff: 0.55,
      source: 'mine',
    });
  }

  draw(ctx) {
    const armed = this.armTimer <= 0;
    // Body
    ctx.fillStyle = '#1c1410';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = armed ? '#ff5544' : '#aa8866';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pulsing red light when armed
    if (armed) {
      const pulse = 0.5 + 0.5 * Math.sin(this.beepT * 8);
      ctx.fillStyle = `rgba(255,80,80,${0.4 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Faint trigger ring while arming
      ctx.strokeStyle = `rgba(255,170,80,${0.4 - this.armTimer / (this.def.armDelay || 1) * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.def.radius * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
