// Weapon definitions. Add a new weapon by appending an entry here — Weapon.js
// reads only the named fields. Player.js handles multi-pellet, recoil, etc.
//
// Numbers tuned against Shambler (32 hp, 70 px/s) and Runner (16 hp, 130 px/s):
//   Pistol  TTK shambler ≈ 3 hits  ·  per-shot DPS feels punchy
//   SMG     TTK shambler ≈ 5 hits  ·  high uptime, low precision
//   Shotgun TTK shambler ≈ 1 close-range pellet salvo  ·  low ammo, big shake

import { AMMO } from './AmmoTypes.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    ammoType: AMMO.LIGHT,
    magSize: 12,
    startReserve: 60,
    fireRate: 5.0,
    fireMode: 'semi',          // requires re-click between shots
    damage: 14,
    pellets: 1,
    spreadRad: 0.04,
    projectileSpeed: 1100,
    projectileLife: 0.55,
    projectileR: 3,
    reloadTime: 1.0,
    recoilShake: 0.18,
    bulletColor: '#ffe066',
    sfxId: 'pistol',
  },

  smg: {
    id: 'smg',
    name: 'SMG',
    ammoType: AMMO.LIGHT,
    magSize: 36,
    startReserve: 144,
    fireRate: 12.0,
    fireMode: 'auto',
    damage: 7,
    pellets: 1,
    spreadRad: 0.13,
    projectileSpeed: 980,
    projectileLife: 0.5,
    projectileR: 2.5,
    reloadTime: 1.5,
    recoilShake: 0.12,
    bulletColor: '#ffd844',
    sfxId: 'smg',
  },

  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    ammoType: AMMO.SHELL,
    magSize: 6,
    startReserve: 24,
    fireRate: 1.4,
    fireMode: 'semi',
    damage: 9,                  // per pellet — 8 pellets ≈ 72 dmg perfect hit
    pellets: 8,
    spreadRad: 0.42,
    projectileSpeed: 940,
    projectileLife: 0.32,
    projectileR: 2.5,
    reloadTime: 1.8,
    recoilShake: 0.65,
    hitStop: 0.05,              // freeze frame on impact = hit weight
    bulletColor: '#ff9955',
    sfxId: 'shotgun',
  },
};
