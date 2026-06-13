// The player: walks the lane behind the wall (A/D), aims at the cursor, fires
// the active weapon, reloads, and cycles weapons. Holds HP and a lantern that
// lights the nearby field. Firing pushes bullets into a provided array and
// asks for sfx/shake/particles via the event bus + passed pools — the night
// scene owns those pools.

import { FIELD, PAL } from '../Config.js';
import { WEAPONS } from './Weapons.js';
import { makeBullet } from './Bullet.js';
import { events } from '../engine/EventBus.js';
import { clamp, TAU } from '../util/math.js';

const MOVE_SPEED = 360;

export class Player {
  constructor(run) {
    this.run = run;
    this.x = 640;
    this.y = FIELD.PLAYER_Y;
    this.maxHp = 100;
    this.hp = run.playerHp ?? 100;
    this.weaponIdx = 0;
    this.cool = 0;
    this.reloadT = 0;       // >0 while reloading
    this.muzzle = 0;        // flash timer
    this.aim = -Math.PI / 2;
    this.iframe = 0;        // damage cooldown
    this.hurtFlash = 0;
    this.alive = true;
    this.recoil = 0;
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
    this.x = clamp(this.x + dir * MOVE_SPEED * dt, FIELD.MARGIN_X, 1280 - FIELD.MARGIN_X);
  }

  startReload() {
    const lo = this.loadout;
    const w = this.weapon;
    if (this.reloadT > 0 || lo.ammo >= w.mag || lo.reserve <= 0) return;
    this.reloadT = w.reload;
    events.emit('SFX', 'reload_click');
  }

  // Aim toward (tx,ty) in canvas space.
  setAim(tx, ty) { this.aim = Math.atan2(ty - this.y, tx - this.x); }

  // Attempt to fire at the cursor. Pushes bullets into `bullets`, spawns
  // muzzle particles. Returns true if a shot left the barrel.
  fire(tx, ty, bullets, particles) {
    if (this.cool > 0 || this.reloadT > 0 || !this.alive) return false;
    const lo = this.loadout;
    const w = this.weapon;
    if (lo.ammo <= 0) {
      this.startReload();
      events.emit('SFX', 'empty');
      this.cool = 0.18;
      return false;
    }
    this.setAim(tx, ty);
    const muzzleX = this.x + Math.cos(this.aim) * 22;
    const muzzleY = this.y - 8 + Math.sin(this.aim) * 22;
    for (let p = 0; p < w.pellets; p++) {
      const a = this.aim + (Math.random() - 0.5) * w.spread * 2;
      const vx = Math.cos(a) * w.speed;
      const vy = Math.sin(a) * w.speed;
      bullets.push(makeBullet(muzzleX, muzzleY, vx, vy, {
        damage: w.damage, color: w.color, tracerLen: w.tracerLen,
        pierce: w.pierce || 0, fromPlayer: true,
      }));
    }
    lo.ammo--;
    this.cool = w.fireRate;
    this.muzzle = 0.06;
    this.recoil = Math.min(6, this.recoil + 3);
    events.emit('SFX', w.sfx);
    events.emit('SHAKE', w.shake);
    // Muzzle sparks.
    for (let i = 0; i < (w.pellets > 1 ? 8 : 4); i++) {
      const a = this.aim + (Math.random() - 0.5) * 0.6;
      const s = 120 + Math.random() * 180;
      particles.emit({
        x: muzzleX, y: muzzleY,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.08 + Math.random() * 0.08, size: 2 + Math.random() * 2,
        color: PAL.muzzle, glow: true,
      });
    }
    if (lo.ammo <= 0) this.startReload();
    return true;
  }

  hurt(amount, sfx = 'player_hurt') {
    if (this.iframe > 0 || !this.alive) return;
    this.hp -= amount;
    this.iframe = 0.6;
    this.hurtFlash = 0.4;
    events.emit('SFX', sfx);
    events.emit('SHAKE', 0.3);
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
        const need = w.mag - lo.ammo;
        const take = Math.min(need, lo.reserve);
        lo.ammo += take;
        lo.reserve -= take;
        events.emit('SFX', 'reload_done');
      }
    }
    // Persist HP back to run so it carries between scenes.
    this.run.playerHp = this.hp;
  }

  reloadProgress() {
    return this.reloadT > 0 ? 1 - this.reloadT / this.weapon.reload : 0;
  }

  render(ctx) {
    const flick = this.iframe > 0 && Math.floor(this.iframe * 30) % 2 === 0;
    const recoilDx = -Math.cos(this.aim) * this.recoil;
    const recoilDy = -Math.sin(this.aim) * this.recoil;
    const x = this.x + recoilDx;
    const y = this.y + recoilDy;

    // Body — hunched survivor silhouette.
    if (!flick) {
      ctx.fillStyle = this.hurtFlash > 0 ? '#e87a6a' : PAL.playerDark;
      ctx.beginPath();
      ctx.ellipse(x, y + 6, 11, 14, 0, 0, TAU);
      ctx.fill();
      // Head.
      ctx.fillStyle = this.hurtFlash > 0 ? '#f0a090' : PAL.player;
      ctx.beginPath();
      ctx.arc(x, y - 10, 7, 0, TAU);
      ctx.fill();
      // Weapon — a line from shoulder toward the aim.
      ctx.strokeStyle = '#2a2a28';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + Math.cos(this.aim) * 24, y - 4 + Math.sin(this.aim) * 24);
      ctx.stroke();
    }
    // Muzzle flash.
    if (this.muzzle > 0) {
      const mx = x + Math.cos(this.aim) * 26;
      const my = y - 4 + Math.sin(this.aim) * 26;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 26);
      g.addColorStop(0, 'rgba(255,220,140,0.9)');
      g.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(mx, my, 26, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Lantern light — drawn in the lighting pass (additive).
  renderLight(ctx) {
    const g = ctx.createRadialGradient(this.x, this.y - 6, 8, this.x, this.y - 6, 190);
    g.addColorStop(0, 'rgba(255,210,150,0.55)');
    g.addColorStop(0.5, 'rgba(200,150,90,0.16)');
    g.addColorStop(1, 'rgba(120,90,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y - 6, 190, 0, TAU);
    ctx.fill();
  }
}
