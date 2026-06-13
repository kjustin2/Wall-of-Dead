// Rescued survivors who hold the wall alongside you. Each auto-targets the
// nearest threat and fires its weapon. They have HP and can be downed for the
// rest of a night (crossing zombies / acid), then they get back up at dawn.
// Their data persists on run.companions between nights; the night scene spawns
// a Companion instance per record.

import { FIELD } from '../Config.js';
import { WEAPONS } from './Weapons.js';
import { makeBullet } from './Bullet.js';
import { events } from '../engine/EventBus.js';
import { dist2, TAU } from '../util/math.js';

export class Companion {
  constructor(record, x) {
    this.rec = record;
    this.name = record.name;
    this.weaponId = record.weaponId || 'pistol';
    this.x = x;
    this.y = FIELD.PLAYER_Y + 4;
    this.maxHp = record.maxHp || 70;
    this.hp = record.hp != null ? record.hp : this.maxHp;
    this.cool = Math.random() * 0.4;
    this.reloadT = 0;
    this.ammo = WEAPONS[this.weaponId].mag;
    this.aim = -Math.PI / 2;
    this.muzzle = 0;
    this.downed = this.hp <= 0;
    this.hurtFlash = 0;
    this.iframe = 0;
    this.range2 = 560 * 560;
  }

  hurt(amount) {
    if (this.downed || this.iframe > 0) return;
    this.hp -= amount;
    this.hurtFlash = 0.3;
    this.iframe = 0.5;
    if (this.hp <= 0) { this.hp = 0; this.downed = true; events.emit('SFX', 'player_hurt'); }
  }

  _acquire(zombies) {
    let best = null, bestD = this.range2;
    for (const z of zombies) {
      if (!z.alive || z.state === 'fleeing') continue;
      const d = dist2(this.x, this.y, z.x, z.y);
      if (d < bestD) { bestD = d; best = z; }
    }
    return best;
  }

  update(dt, c) {
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.iframe > 0) this.iframe -= dt;
    // Sync HP back so it persists across nights.
    this.rec.hp = this.hp;
    if (this.downed) return;

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = WEAPONS[this.weaponId].mag;
      return;
    }
    if (this.cool > 0) this.cool -= dt;

    const target = this._acquire(c.zombies);
    if (!target) return;
    this.aim = Math.atan2(target.y - this.y, target.x - this.x);
    if (this.cool > 0) return;

    const w = WEAPONS[this.weaponId];
    if (this.ammo <= 0) { this.reloadT = w.reload; events.emit('SFX', 'reload_click'); return; }

    // Fire. Companions are a touch less accurate and slower than the player.
    const mx = this.x + Math.cos(this.aim) * 20;
    const my = this.y - 8 + Math.sin(this.aim) * 20;
    for (let p = 0; p < w.pellets; p++) {
      const a = this.aim + (Math.random() - 0.5) * (w.spread * 2 + 0.04);
      c.bullets.push(makeBullet(mx, my, Math.cos(a) * w.speed, Math.sin(a) * w.speed, {
        damage: w.damage * 0.85, color: w.color, tracerLen: w.tracerLen,
        pierce: w.pierce || 0, fromPlayer: true,
      }));
    }
    this.ammo--;
    this.cool = w.fireRate * 1.25;
    this.muzzle = 0.05;
    events.emit('SFX', w.sfx);
    if (c.particles) {
      c.particles.emit({ x: mx, y: my, vx: Math.cos(this.aim) * 120, vy: Math.sin(this.aim) * 120,
        life: 0.08, size: 2, color: '#ffd27a', glow: true });
    }
  }

  render(ctx) {
    const x = this.x, y = this.y;
    if (this.downed) {
      // Crumpled on the ground.
      ctx.fillStyle = '#4a4438';
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 14, 6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7a3030';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DOWN', x, y - 6);
      return;
    }
    const flick = this.iframe > 0 && Math.floor(this.iframe * 30) % 2 === 0;
    if (!flick) {
      ctx.fillStyle = this.hurtFlash > 0 ? '#e87a6a' : '#5a6f8f';
      ctx.beginPath();
      ctx.ellipse(x, y + 6, 10, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.hurtFlash > 0 ? '#f0a090' : '#b8c8d8';
      ctx.beginPath();
      ctx.arc(x, y - 9, 6.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2a2a28';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x + Math.cos(this.aim) * 20, y - 3 + Math.sin(this.aim) * 20);
      ctx.stroke();
    }
    if (this.muzzle > 0) {
      const mx = x + Math.cos(this.aim) * 22, my = y - 3 + Math.sin(this.aim) * 22;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,210,140,0.8)';
      ctx.beginPath(); ctx.arc(mx, my, 12, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    // Name tag.
    ctx.fillStyle = 'rgba(150,180,200,0.7)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, x, y - 22);
    // HP pip bar.
    const w = 22, hpw = (this.hp / this.maxHp) * w;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - w / 2, y - 19, w, 3);
    ctx.fillStyle = '#5fbf6a';
    ctx.fillRect(x - w / 2, y - 19, hpw, 3);
  }

  renderLight(ctx) {
    const g = ctx.createRadialGradient(this.x, this.y - 6, 6, this.x, this.y - 6, 120);
    g.addColorStop(0, 'rgba(150,180,220,0.28)');
    g.addColorStop(1, 'rgba(100,130,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y - 6, 120, 0, TAU);
    ctx.fill();
  }
}
