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

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 12, 12, 4, 0, 0, TAU); ctx.fill();

    if (this.downed) {
      ctx.fillStyle = '#3a3630';
      ctx.beginPath(); ctx.ellipse(x, y + 8, 15, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7a3030';
      ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('✚ ' + this.name, x, y - 4);
      return;
    }
    const flick = this.iframe > 0 && Math.floor(this.iframe * 30) % 2 === 0;
    const facing = Math.cos(this.aim) >= 0 ? 1 : -1;
    if (!flick) {
      // Legs.
      ctx.strokeStyle = '#23262a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 3, y + 6); ctx.lineTo(x - 3, y + 17); ctx.moveTo(x + 3, y + 6); ctx.lineTo(x + 3, y + 17); ctx.stroke();
      // Torso (blue jacket).
      const g = ctx.createLinearGradient(x - 9, y - 6, x + 9, y + 8);
      g.addColorStop(0, this.hurtFlash > 0 ? '#e08070' : '#4a6080');
      g.addColorStop(1, this.hurtFlash > 0 ? '#b85a4c' : '#2e3e54');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 10, 12, 0, 0, TAU); ctx.fill();
      // Head + cap.
      ctx.fillStyle = this.hurtFlash > 0 ? '#f0b0a4' : '#c8b496';
      ctx.beginPath(); ctx.arc(x + facing, y - 10, 6.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#34465a';
      ctx.beginPath(); ctx.arc(x + facing, y - 12, 6.6, Math.PI, TAU); ctx.fill();
      // Weapon toward target.
      const ax = Math.cos(this.aim), ay = Math.sin(this.aim);
      ctx.strokeStyle = '#222'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + ax * 19, y - 3 + ay * 19); ctx.stroke();
    }
    // Name tag + HP.
    ctx.fillStyle = 'rgba(160,190,210,0.75)';
    ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(this.name, x, y - 24);
    const w = 24, hpw = (this.hp / this.maxHp) * w;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - w / 2, y - 21, w, 3);
    ctx.fillStyle = '#5fbf6a'; ctx.fillRect(x - w / 2, y - 21, hpw, 3);
  }

  // Bright muzzle flash for the emissive pass.
  renderMuzzle(ctx) {
    if (this.downed || this.muzzle <= 0) return;
    const mx = this.x + Math.cos(this.aim) * 22, my = this.y - 3 + Math.sin(this.aim) * 22;
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 18);
    g.addColorStop(0, 'rgba(255,210,140,0.85)');
    g.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, 18, 0, TAU); ctx.fill();
  }
}
