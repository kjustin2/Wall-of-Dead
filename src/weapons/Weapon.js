// Stateful weapon holder. Reads from a frozen WEAPONS def for stats; tracks
// runtime mag, reserve, cooldown, reload progress.

import { events } from '../engine/EventBus.js';

export class Weapon {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.mag = def.magSize;
    this.reserve = def.startReserve;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.reloading = false;
  }

  get magSize()    { return this.def.magSize; }
  get name()       { return this.def.name; }
  get ammoLabel()  { return this.def.ammoType.label; }

  update(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload();
    }
  }

  startReload() {
    if (this.reloading) return false;
    if (this.mag >= this.def.magSize) return false;
    if (this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = this.def.reloadTime;
    events.emit('WEAPON_RELOAD_START', { weaponId: this.id });
    return true;
  }

  cancelReload() {
    if (!this.reloading) return;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  _finishReload() {
    this.reloading = false;
    const need = this.def.magSize - this.mag;
    const take = Math.min(need, this.reserve);
    this.mag += take;
    this.reserve -= take;
    events.emit('WEAPON_RELOAD_END', { weaponId: this.id });
  }

  canFire() {
    return !this.reloading && this.cooldown <= 0 && this.mag > 0;
  }

  // Called by Player when LMB is held / pressed. Returns true if a shot
  // was fired (caller is responsible for spawning the projectile so that
  // weapons with unique behaviors stay in one place).
  tryFire() {
    if (!this.canFire()) {
      // Auto-reload when dry — feels better than a dead click.
      if (this.mag <= 0 && !this.reloading && this.reserve > 0) this.startReload();
      return false;
    }
    this.mag -= 1;
    this.cooldown = 1 / this.def.fireRate;
    return true;
  }

  addReserve(amount) {
    this.reserve += amount;
  }
}
