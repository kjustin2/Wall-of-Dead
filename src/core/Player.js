// Player: WASD movement, mouse aim, LMB shoot, R reload, weapon swap.
// Single-player only. Holds a list of Weapon instances; current weapon is
// indexed by `currentWeaponIdx`.

import { Entity } from './Entity.js';
import { events } from '../engine/EventBus.js';
import { PLAYER, PALETTE } from '../Config.js';
import { Weapon } from '../weapons/Weapon.js';
import { WEAPONS } from '../weapons/WeaponDefs.js';
import { angleTo } from '../util/geom.js';

export class Player extends Entity {
  constructor(x, y) {
    super(x, y, PLAYER.radius);
    this.hp = PLAYER.hpMax;
    this.maxHp = PLAYER.hpMax;
    this.stamina = PLAYER.staminaMax;
    this.aim = 0;          // radians
    this.iframe = 0;
    this.scrap = 0;        // run-state currency, awarded per kill
    this.kills = 0;
    // M2: start with all three baseline weapons so the player can try them
    // out from the sandbox. M3+ replaces this with a loadout-pick from
    // BaseCampScene that respects MetaProgress unlocks.
    this.inventory = [
      new Weapon(WEAPONS.pistol),
      new Weapon(WEAPONS.smg),
      new Weapon(WEAPONS.shotgun),
    ];
    this.currentWeaponIdx = 0;
    this._wasLeftDown = false;   // edge-detect for semi-auto fire
  }

  get weapon() { return this.inventory[this.currentWeaponIdx]; }

  swap(idx) {
    if (idx < 0 || idx >= this.inventory.length) return;
    if (idx === this.currentWeaponIdx) return;
    const cur = this.weapon;
    if (cur) cur.cancelReload();
    this.currentWeaponIdx = idx;
    events.emit('WEAPON_SWAPPED', { idx, weaponId: this.weapon.id });
  }

  cycleWeapon(dir) {
    if (this.inventory.length <= 1) return;
    const n = this.inventory.length;
    this.swap((this.currentWeaponIdx + dir + n) % n);
  }

  takeDamage(amount) {
    if (this.iframe > 0) return;
    this.hp -= amount;
    this.iframe = PLAYER.iframeOnHit;
    events.emit('PLAYER_DAMAGED', { amount });
    if (this.hp <= 0) {
      this.alive = false;
      events.emit('PLAYER_DIED', {});
    }
  }

  // ── Per-frame update ──
  update(dt, input, arena, projMgr, particles, audio) {
    // Aim toward mouse
    this.aim = angleTo(this.x, this.y, input.mouse.x, input.mouse.y);

    // Movement
    const sprinting = input.isDown('shift') && this.stamina > 0;
    let mx = 0, my = 0;
    if (input.isDown('a') || input.isDown('arrowleft'))  mx -= 1;
    if (input.isDown('d') || input.isDown('arrowright')) mx += 1;
    if (input.isDown('w') || input.isDown('arrowup'))    my -= 1;
    if (input.isDown('s') || input.isDown('arrowdown'))  my += 1;
    const mag = Math.hypot(mx, my);
    let speed = PLAYER.speed;
    if (sprinting) speed *= PLAYER.sprintMult;
    if (mag > 0) {
      this.x += (mx / mag) * speed * dt;
      this.y += (my / mag) * speed * dt;
    }
    arena.clamp(this);

    // Stamina
    if (sprinting && mag > 0) {
      this.stamina = Math.max(0, this.stamina - PLAYER.staminaDrainSprint * dt);
    } else {
      this.stamina = Math.min(PLAYER.staminaMax, this.stamina + PLAYER.staminaRegen * dt);
    }

    // I-frame decay
    if (this.iframe > 0) this.iframe = Math.max(0, this.iframe - dt);

    // Weapon swap (1..9 / wheel)
    for (let i = 0; i < this.inventory.length && i < 9; i++) {
      if (input.consumeKey(String(i + 1))) this.swap(i);
    }
    if (input.consumeKey('weaponnext')) this.cycleWeapon(+1);
    if (input.consumeKey('weaponprev')) this.cycleWeapon(-1);

    // Reload
    if (input.consumeKey('r')) this.weapon.startReload();

    // Update active weapon timers
    this.weapon.update(dt);

    // Fire — semi requires fresh press, auto fires on hold (rate-capped).
    const isAuto = this.weapon.def.fireMode === 'auto';
    const wantFire = isAuto
      ? input.mouse.leftDown
      : (input.mouse.leftDown && !this._wasLeftDown);
    if (wantFire) {
      if (this.weapon.tryFire()) {
        this._fireBullet(projMgr, particles, audio);
      }
    }
    this._wasLeftDown = input.mouse.leftDown;
  }

  _fireBullet(projMgr, particles, audio) {
    const def = this.weapon.def;
    const muzzleDist = this.r + 4;
    const px = this.x + Math.cos(this.aim) * muzzleDist;
    const py = this.y + Math.sin(this.aim) * muzzleDist;
    const pellets = def.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = this.aim + (Math.random() - 0.5) * def.spreadRad;
      projMgr.spawn({
        x: px, y: py,
        vx: Math.cos(a) * def.projectileSpeed,
        vy: Math.sin(a) * def.projectileSpeed,
        r: def.projectileR,
        life: def.projectileLife,
        damage: def.damage,
        color: def.bulletColor,
        weaponId: def.id,
        source: 'player',
        pierce: 0,
      });
    }
    if (particles) particles.spawnMuzzleFlash(px, py, this.aim);
    events.emit('SCREEN_SHAKE', { duration: 0.08, intensity: def.recoilShake });
    events.emit('WEAPON_FIRED', { weaponId: def.id, x: px, y: py });
    // Audio is a no-op stub during M1; in M2+ Audio.js binds to WEAPON_FIRED
    // directly via bindAudioEvents, so calling audio.playSfx here would
    // double-play the same sample. Leave the param around for future per-shot
    // pitch variations but no direct call.
  }

  draw(ctx) {
    const flicker = this.iframe > 0 && (Math.floor(this.iframe * 28) % 2 === 0);

    // Body
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);

    // Aim line
    ctx.strokeStyle = 'rgba(126,255,102,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.r + 2, 0);
    ctx.lineTo(this.r + 22, 0);
    ctx.stroke();

    // Held weapon silhouette
    ctx.fillStyle = '#1a1a1c';
    ctx.fillRect(this.r - 2, -3, 14, 6);
    ctx.fillStyle = '#3a3a3c';
    ctx.fillRect(this.r + 6, -2, 6, 4);

    // Body circle
    if (!flicker) {
      ctx.fillStyle = PALETTE.player;
      ctx.strokeStyle = PALETTE.playerOutline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Forward indicator
    ctx.fillStyle = PALETTE.uiAccent;
    ctx.beginPath();
    ctx.arc(this.r * 0.45, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
