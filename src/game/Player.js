// The player: walks the lane behind the wall with smooth acceleration, aims a
// flashlight + weapon at the cursor, fires/reloads/swaps. Renders as a layered,
// animated survivor. Its `aim` drives the flashlight cone in NightScene's
// lighting pass; muzzle flashes are drawn in the emissive pass via renderMuzzle.

import { FIELD, PAL } from '../Config.js';
import { WEAPONS } from './Weapons.js';
import { makeBullet } from './Bullet.js';
import { events } from '../engine/EventBus.js';
import { clamp, approach, TAU } from '../util/math.js';

const MOVE_SPEED = 360;

export class Player {
  constructor(run) {
    this.run = run;
    this.x = 640;
    this.y = FIELD.PLAYER_Y;
    this.vx = 0;
    this.maxHp = 100;
    this.hp = run.playerHp ?? 100;
    this.weaponIdx = 0;
    this.cool = 0;
    this.reloadT = 0;
    this.muzzle = 0;
    this.aim = -Math.PI / 2;
    this.iframe = 0;
    this.hurtFlash = 0;
    this.alive = true;
    this.recoil = 0;
    this.walk = 0;        // walk-cycle phase
    this.facing = 1;
  }

  get loadout() { return this.run.weapons[this.weaponIdx]; }
  get weapon() { return WEAPONS[this.loadout.id]; }

  switchTo(i) {
    if (i < 0 || i >= this.run.weapons.length || i === this.weaponIdx) return;
    this.weaponIdx = i;
    this.reloadT = 0;
    this.cool = Math.max(this.cool, 0.12);
    events.emit('SFX', 'reload_click');
  }

  cycle(dir) {
    const n = this.run.weapons.length;
    this.switchTo((this.weaponIdx + dir + n) % n);
  }

  move(dt, dir) {
    const target = dir * MOVE_SPEED;
    this.vx = approach(this.vx, target, 13, dt);
    this.x = clamp(this.x + this.vx * dt, FIELD.MARGIN_X, 1280 - FIELD.MARGIN_X);
    if (Math.abs(this.vx) > 12) this.walk += Math.abs(this.vx) * dt * 0.03;
  }

  startReload() {
    const lo = this.loadout, w = this.weapon;
    if (this.reloadT > 0 || lo.ammo >= w.mag || lo.reserve <= 0) return;
    this.reloadT = w.reload;
    events.emit('SFX', 'reload_click');
  }

  setAim(tx, ty) {
    this.aim = Math.atan2(ty - this.y, tx - this.x);
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  fire(tx, ty, bullets, particles) {
    if (this.cool > 0 || this.reloadT > 0 || !this.alive) return false;
    const lo = this.loadout, w = this.weapon;
    if (lo.ammo <= 0) { this.startReload(); events.emit('SFX', 'empty'); this.cool = 0.18; return false; }
    this.setAim(tx, ty);
    const muzzleX = this.x + Math.cos(this.aim) * 26;
    const muzzleY = this.y - 10 + Math.sin(this.aim) * 26;
    for (let p = 0; p < w.pellets; p++) {
      const a = this.aim + (Math.random() - 0.5) * w.spread * 2;
      bullets.push(makeBullet(muzzleX, muzzleY, Math.cos(a) * w.speed, Math.sin(a) * w.speed, {
        damage: w.damage, color: w.color, tracerLen: w.tracerLen, pierce: w.pierce || 0, fromPlayer: true,
      }));
    }
    lo.ammo--;
    this.cool = w.fireRate;
    this.muzzle = 0.07;
    this.recoil = Math.min(7, this.recoil + 3.5);
    events.emit('SFX', w.sfx);
    events.emit('SHAKE', w.shake);
    // Muzzle sparks + ejected casing.
    for (let i = 0; i < (w.pellets > 1 ? 9 : 4); i++) {
      const a = this.aim + (Math.random() - 0.5) * 0.6;
      const s = 120 + Math.random() * 200;
      particles.emit({ x: muzzleX, y: muzzleY, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.08 + Math.random() * 0.08, size: 2 + Math.random() * 2, color: PAL.muzzle, glow: true });
    }
    particles.emit({ x: this.x, y: this.y - 8, vx: -this.facing * (40 + Math.random() * 40), vy: -90 - Math.random() * 40,
      life: 0.5, size: 1.6, color: '#d9b85a', grav: 320 });
    // Smoke puff.
    particles.emit({ x: muzzleX, y: muzzleY, vx: Math.cos(this.aim) * 30, vy: Math.sin(this.aim) * 30 - 14,
      life: 0.4, size: 5, color: 'rgba(120,120,110,0.5)', grav: -20 });
    if (lo.ammo <= 0) this.startReload();
    return true;
  }

  hurt(amount, sfx = 'player_hurt') {
    if (this.iframe > 0 || !this.alive) return;
    this.hp -= amount;
    this.iframe = 0.6;
    this.hurtFlash = 0.4;
    events.emit('SFX', sfx);
    events.emit('SHAKE', 0.32);
    events.emit('HITSTOP', 0.05);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }

  update(dt) {
    if (this.cool > 0) this.cool -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.iframe > 0) this.iframe -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    this.recoil *= Math.max(0, 1 - dt * 12);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const lo = this.loadout, w = this.weapon;
        const take = Math.min(w.mag - lo.ammo, lo.reserve);
        lo.ammo += take; lo.reserve -= take;
        events.emit('SFX', 'reload_done');
      }
    }
    this.run.playerHp = this.hp;
  }

  reloadProgress() { return this.reloadT > 0 ? 1 - this.reloadT / this.weapon.reload : 0; }

  render(ctx) {
    const flick = this.iframe > 0 && Math.floor(this.iframe * 30) % 2 === 0;
    if (flick) return;
    const rx = -Math.cos(this.aim) * this.recoil;
    const ry = -Math.sin(this.aim) * this.recoil;
    const x = this.x + rx;
    const y = this.y + ry;
    const hurt = this.hurtFlash > 0;
    const moving = Math.abs(this.vx) > 12;
    const step = moving ? Math.sin(this.walk * 6) : 0;

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 13, 14, 4.5, 0, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(x, y);

    // Legs (walk cycle).
    ctx.strokeStyle = '#23262a';
    ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, 6); ctx.lineTo(-3 + step * 4, 18);
    ctx.moveTo(3, 6); ctx.lineTo(3 - step * 4, 18);
    ctx.stroke();

    // Backpack.
    ctx.fillStyle = '#3a4036';
    ctx.fillRect(-this.facing * 9 - 3, -6, 8, 14);

    // Torso / jacket with shading.
    const g = ctx.createLinearGradient(-10, -8, 10, 8);
    g.addColorStop(0, hurt ? '#e08070' : '#43544a');
    g.addColorStop(1, hurt ? '#b85a4c' : '#2c3a32');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 2, 11, 13, 0, 0, TAU); ctx.fill();
    // Chest strap.
    ctx.strokeStyle = '#1c211d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(6, 9); ctx.stroke();

    // Head with hood/beanie.
    ctx.fillStyle = hurt ? '#f0b0a4' : '#cdb89a';
    ctx.beginPath(); ctx.arc(this.facing * 1, -12, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2f3a30';
    ctx.beginPath(); ctx.arc(this.facing * 1, -14, 7.4, Math.PI, TAU); ctx.fill();
    ctx.fillRect(this.facing * 1 - 7.4, -15, 14.8, 3);

    // Arms + weapon aimed at the cursor.
    const ax = Math.cos(this.aim), ay = Math.sin(this.aim);
    const sx = 0, sy = -3;
    const gunLen = 22;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + ax * gunLen, sy + ay * gunLen);
    ctx.stroke();
    // Gun body highlight.
    ctx.strokeStyle = '#3c3c40';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx + ax * 6, sy + ay * 6);
    ctx.lineTo(sx + ax * (gunLen + 3), sy + ay * (gunLen + 3));
    ctx.stroke();
    // Forward hand.
    ctx.fillStyle = hurt ? '#f0b0a4' : '#cdb89a';
    ctx.beginPath(); ctx.arc(sx + ax * 14, sy + ay * 14, 2.6, 0, TAU); ctx.fill();

    ctx.restore();
  }

  // Bright muzzle flash, drawn additively in the emissive pass.
  renderMuzzle(ctx) {
    if (this.muzzle <= 0) return;
    const mx = this.x + Math.cos(this.aim) * 28;
    const my = this.y - 10 + Math.sin(this.aim) * 28;
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 30);
    g.addColorStop(0, 'rgba(255,228,150,0.95)');
    g.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, 30, 0, TAU); ctx.fill();
  }
}
