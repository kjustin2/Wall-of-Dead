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
    // Sandbox seed: when no RunState is active, give the player one of each
    // baseline weapon so the SANDBOX intro button is useful for testing.
    // RunState.applyToPlayer overrides this list during a real run.
    this.inventory = [
      new Weapon(WEAPONS.pistol),
      new Weapon(WEAPONS.smg),
      new Weapon(WEAPONS.shotgun),
    ];
    this.currentWeaponIdx = 0;
    this._wasLeftDown = false;   // edge-detect for semi-auto fire
    // Fire is "armed" only after the LMB has been released at least once
    // since the Player was constructed. This prevents a click-through:
    // clicking a map node leaves leftDown=true entering combat — without
    // this gate, the first frame would auto-fire (bug reported in
    // improve.md #1).
    this._fireArmed = false;
    // Backup knife: short-range melee that auto-fires when every weapon in
    // the inventory is dry (improve.md #2). Holds its own cooldown so it
    // doesn't share the active weapon's rate cap.
    this.knife = {
      cooldown: 0,
      cooldownMax: 0.45,
      damage: 8,
      range: 46,
      arc: Math.PI * 0.55,         // ~100° front cone
      swingT: 0,                   // visual swing animation timer (s)
      swingDuration: 0.18,
    };
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
  update(dt, input, arena, projMgr, particles, _audio) {
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

    // Update active weapon timers + knife cooldown
    this.weapon.update(dt);
    if (this.knife.cooldown > 0) this.knife.cooldown = Math.max(0, this.knife.cooldown - dt);
    if (this.knife.swingT > 0)   this.knife.swingT   = Math.max(0, this.knife.swingT - dt);

    // Arm fire only after the LMB has been released at least once since
    // construction. Stops a held click from a previous scene (e.g. clicking
    // a map node) auto-firing on the first combat frame.
    if (!this._fireArmed && !input.mouse.leftDown) this._fireArmed = true;

    if (this._fireArmed) {
      const def = this.weapon.def;
      const isAuto = def.fireMode === 'auto';
      const wantFire = isAuto
        ? input.mouse.leftDown
        : (input.mouse.leftDown && !this._wasLeftDown);
      if (wantFire) {
        if (this.weapon.tryFire()) {
          this._dispatchFire(def, projMgr, particles);
        } else if (this._allDry()) {
          // Backup knife — only when EVERY weapon is empty. Forces a real
          // scavenge run rather than rewarding spam-melee mid-fight.
          this._knifeAttack(particles, this._zombies);
        }
      }
    }
    this._wasLeftDown = input.mouse.leftDown;
  }

  // Called by CombatScene each frame so the knife can target zombies.
  setZombieList(list) { this._zombies = list; }

  _allDry() {
    for (const w of this.inventory) {
      if (w.mag > 0 || w.reserve > 0) return false;
    }
    return true;
  }

  _knifeAttack(particles, zombies) {
    if (this.knife.cooldown > 0) return;
    this.knife.cooldown = this.knife.cooldownMax;
    this.knife.swingT = this.knife.swingDuration;
    events.emit('KNIFE_SWING', { x: this.x, y: this.y, angle: this.aim });
    if (!zombies) return;
    const halfArc = this.knife.arc / 2;
    const rangeSq = this.knife.range * this.knife.range;
    for (const z of zombies) {
      if (!z.alive) continue;
      const dx = z.x - this.x, dy = z.y - this.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq) continue;
      const ang = Math.atan2(dy, dx);
      let d = Math.abs(ang - this.aim);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d > halfArc) continue;
      // Hit
      z.takeDamage(this.knife.damage);
      if (particles) particles.spawnBlood(z.x, z.y);
      events.emit('KNIFE_HIT', { zombie: z, damage: this.knife.damage });
    }
  }

  // Routes a fire to the right behavior based on weapon-def tags. Each
  // path is intentionally distinct so weapons feel different (per
  // improve.md #3: keep weapons strictly distinct).
  _dispatchFire(def, projMgr, particles) {
    if (def.melee)      return this._fireMelee(def, particles);
    if (def.flame)      return this._fireFlame(def, particles);
    if (def.placesMine) return this._fireMine(def);
    if (def.thrown)     return this._fireGrenade(def);
    return this._fireBullet(def, projMgr, particles);
  }

  _fireBullet(def, projMgr, particles) {
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
        pierce: def.pierce || 0,
        aoe: def.aoe || null,
      });
    }
    if (particles) particles.spawnMuzzleFlash(px, py, this.aim);
    events.emit('SCREEN_SHAKE', { duration: 0.08, intensity: def.recoilShake });
    events.emit('WEAPON_FIRED', { weaponId: def.id, x: px, y: py });
  }

  _fireMelee(def, particles) {
    const m = def.melee;
    const halfArc = m.halfArc;
    const rangeSq = m.range * m.range;
    if (this._zombies) {
      for (const z of this._zombies) {
        if (!z.alive) continue;
        const dx = z.x - this.x, dy = z.y - this.y;
        if (dx * dx + dy * dy > rangeSq) continue;
        const ang = Math.atan2(dy, dx);
        let d = Math.abs(ang - this.aim);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > halfArc) continue;
        const wasAlive = z.alive;
        z.takeDamage(def.damage);
        if (particles) particles.spawnBlood(z.x, z.y);
        // FLAME_HIT-style event so CombatScene awards kill credit.
        events.emit('FLAME_HIT', { zombie: z, damage: def.damage });
        if (def.hitStop && wasAlive && z.alive) events.emit('HIT_STOP', def.hitStop);
      }
    }
    // Reuse the knife swing animation for visual feedback.
    this.knife.swingT = this.knife.swingDuration;
    events.emit('SCREEN_SHAKE', { duration: 0.10, intensity: def.recoilShake });
    events.emit('WEAPON_FIRED', { weaponId: def.id, x: this.x, y: this.y });
  }

  _fireFlame(def, particles) {
    const f = def.flame;
    const baseR = this.r + 4;
    const px = this.x + Math.cos(this.aim) * baseR;
    const py = this.y + Math.sin(this.aim) * baseR;
    // Cone particles for visual fire — each tick spawns a few flame puffs
    // along a randomized angle within the cone.
    if (particles) {
      for (let i = 0; i < 4; i++) {
        const a = this.aim + (Math.random() - 0.5) * f.halfArc * 2;
        const reach = f.range * (0.4 + Math.random() * 0.6);
        const speed = 240 + Math.random() * 200;
        particles._pushParticle({
          x: px, y: py,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r: 4 + Math.random() * 3,
          color: Math.random() < 0.55 ? '#ff7733' : (Math.random() < 0.5 ? '#ffcc44' : '#cc3322'),
          life: 0.18 + Math.random() * 0.18,
          maxLife: 0.36,
          drag: 0.86,
        });
      }
    }
    // Damage all zombies in the cone, this fuel-tick.
    if (this._zombies) {
      const halfArc = f.halfArc;
      const rangeSq = f.range * f.range;
      for (const z of this._zombies) {
        if (!z.alive) continue;
        const dx = z.x - this.x, dy = z.y - this.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > rangeSq) continue;
        const ang = Math.atan2(dy, dx);
        let d = Math.abs(ang - this.aim);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > halfArc) continue;
        const wasAlive = z.alive;
        z.takeDamage(def.damage);
        if (wasAlive && !z.alive) {
          events.emit('FLAME_HIT', { zombie: z, damage: def.damage });
        } else if (Math.random() < 0.18) {
          // Damage numbers occasionally on tick — full stack would be spammy.
          events.emit('FLAME_HIT', { zombie: z, damage: def.damage });
        }
      }
    }
    events.emit('SCREEN_SHAKE', { duration: 0.04, intensity: def.recoilShake });
    events.emit('WEAPON_FIRED', { weaponId: def.id, x: px, y: py });
  }

  _fireMine(def) {
    events.emit('PLACE_MINE', { x: this.x, y: this.y, def: def.placesMine });
    events.emit('WEAPON_FIRED', { weaponId: def.id, x: this.x, y: this.y });
  }

  _fireGrenade(def) {
    const muzzleDist = this.r + 4;
    const px = this.x + Math.cos(this.aim) * muzzleDist;
    const py = this.y + Math.sin(this.aim) * muzzleDist;
    const a = this.aim + (Math.random() - 0.5) * (def.spreadRad || 0);
    const speed = def.projectileSpeed;
    events.emit('THROW_GRENADE', {
      x: px, y: py,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      def: { aoe: def.aoe, fuseTime: def.fuseTime },
    });
    events.emit('SCREEN_SHAKE', { duration: 0.06, intensity: def.recoilShake });
    events.emit('WEAPON_FIRED', { weaponId: def.id, x: px, y: py });
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

    // Held weapon silhouette — or knife mid-swing
    if (this.knife.swingT > 0) {
      const t = 1 - this.knife.swingT / this.knife.swingDuration;
      const swing = -this.knife.arc / 2 + this.knife.arc * t;
      ctx.save();
      ctx.rotate(swing);
      ctx.strokeStyle = '#cdd6c0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(this.r, 0);
      ctx.lineTo(this.r + this.knife.range * 0.6, 0);
      ctx.stroke();
      // arc trail
      ctx.strokeStyle = 'rgba(205,214,192,0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + this.knife.range * 0.5, -this.knife.arc / 2, swing);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = '#1a1a1c';
      ctx.fillRect(this.r - 2, -3, 14, 6);
      ctx.fillStyle = '#3a3a3c';
      ctx.fillRect(this.r + 6, -2, 6, 4);
    }

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
