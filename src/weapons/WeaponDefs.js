// Weapon definitions. Per improve.md feedback, each weapon should feel
// strictly distinct — no upgrade-stacking that turns a pistol into a
// shotgun. Behavioral tags (aoe / pierce / melee / flame / placesMine /
// thrown) on each def hand off to specialized fire paths in Player.js.
//
// Numbers tuned against shambler 32hp / runner 14hp / spitter 22hp.
// `startReserve` was reduced ~40% across the board to support the horror
// scarcity goal — finding ammo should feel meaningful, not routine.

import { AMMO } from './AmmoTypes.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Pistol',
    ammoType: AMMO.LIGHT,
    magSize: 12, startReserve: 36,
    fireRate: 5.0, fireMode: 'semi',
    damage: 14, pellets: 1,
    spreadRad: 0.04, projectileSpeed: 1100, projectileLife: 0.55, projectileR: 3,
    reloadTime: 1.0, recoilShake: 0.18, knockback: 60,
    bulletColor: '#ffe066',
    sfxId: 'pistol',
  },

  smg: {
    id: 'smg', name: 'SMG',
    ammoType: AMMO.LIGHT,
    magSize: 36, startReserve: 80,
    fireRate: 12.0, fireMode: 'auto',
    damage: 7, pellets: 1,
    spreadRad: 0.13, projectileSpeed: 980, projectileLife: 0.5, projectileR: 2.5,
    reloadTime: 1.5, recoilShake: 0.12, knockback: 35,
    bulletColor: '#ffd844',
    sfxId: 'smg',
  },

  shotgun: {
    id: 'shotgun', name: 'Shotgun',
    ammoType: AMMO.SHELL,
    magSize: 6, startReserve: 14,
    fireRate: 1.4, fireMode: 'semi',
    damage: 9, pellets: 8,
    spreadRad: 0.42, projectileSpeed: 940, projectileLife: 0.32, projectileR: 2.5,
    reloadTime: 1.8, recoilShake: 0.65, hitStop: 0.05, knockback: 240,
    bulletColor: '#ff9955',
    sfxId: 'shotgun',
  },

  ar: {
    id: 'ar', name: 'Assault Rifle',
    ammoType: AMMO.HEAVY,
    magSize: 30, startReserve: 54,
    fireRate: 2.8, fireMode: 'burst',     // 2.8 trigger pulls/sec; each pull fires 3 rounds
    burst: { count: 3, intervalSec: 0.07 },
    damage: 13, pellets: 1,
    spreadRad: 0.07, projectileSpeed: 1300, projectileLife: 0.5, projectileR: 2.5,
    reloadTime: 1.7, recoilShake: 0.18, knockback: 80,
    bulletColor: '#ffaa55',
    sfxId: 'ar',
  },

  sniper: {
    id: 'sniper', name: 'Sniper Rifle',
    ammoType: AMMO.HEAVY,
    magSize: 5, startReserve: 12,
    fireRate: 0.9, fireMode: 'semi',
    damage: 60, pellets: 1,
    spreadRad: 0.0, projectileSpeed: 2200, projectileLife: 0.5, projectileR: 4,
    reloadTime: 2.2, recoilShake: 0.55, hitStop: 0.04, knockback: 400,
    pierce: 3,                            // skewers a small line
    bulletColor: '#88ccff',
    sfxId: 'sniper',
  },

  rocket: {
    id: 'rocket', name: 'Rocket Launcher',
    ammoType: AMMO.ROCKET,
    magSize: 1, startReserve: 3,
    fireRate: 0.7, fireMode: 'semi',
    damage: 0,                            // direct hit body damage; AoE does the work
    pellets: 1,
    spreadRad: 0.0, projectileSpeed: 480, projectileLife: 1.6, projectileR: 6,
    reloadTime: 2.6, recoilShake: 1.2, hitStop: 0.08,
    aoe: { radius: 100, damage: 70, falloff: 0.6 },
    bulletColor: '#ff6622',
    sfxId: 'rocket_fire',
  },

  flame: {
    id: 'flame', name: 'Flamethrower',
    ammoType: AMMO.FUEL,
    magSize: 80, startReserve: 120,
    fireRate: 22.0, fireMode: 'auto',
    damage: 4,                            // per fuel-tick (so DPS depends on hold time)
    pellets: 1,
    spreadRad: 0.0,                       // cone math handles spread directly
    projectileSpeed: 0, projectileLife: 0, projectileR: 0,
    reloadTime: 2.0, recoilShake: 0.06,
    flame: { range: 170, halfArc: 0.45 }, // ~50° front cone
    bulletColor: '#ff7733',
    sfxId: 'flame',
  },

  mine: {
    id: 'mine', name: 'Proximity Mine',
    ammoType: AMMO.EXPLOSIVE,
    magSize: 1, startReserve: 2,
    fireRate: 1.2, fireMode: 'semi',
    damage: 0, pellets: 1,
    spreadRad: 0, projectileSpeed: 0, projectileLife: 0, projectileR: 0,
    reloadTime: 0.6, recoilShake: 0.03,
    placesMine: { radius: 80, damage: 55, armDelay: 0.7 },
    bulletColor: '#ff7733',
    sfxId: 'reload_click',
  },

  grenade: {
    id: 'grenade', name: 'Frag Grenade',
    ammoType: AMMO.EXPLOSIVE,
    magSize: 1, startReserve: 2,
    fireRate: 1.0, fireMode: 'semi',
    damage: 0, pellets: 1,
    spreadRad: 0.05, projectileSpeed: 520, projectileLife: 1.4, projectileR: 5,
    reloadTime: 0.6, recoilShake: 0.10,
    thrown: true,                         // arcs (no zombie collision until fuse)
    fuseTime: 1.4,
    aoe: { radius: 110, damage: 50, falloff: 0.55 },
    bulletColor: '#88aa44',
    sfxId: 'reload_click',
  },

  bat: {
    id: 'bat', name: 'Bat',
    ammoType: AMMO.MELEE,
    magSize: 1, startReserve: 0,          // melee never reloads / runs dry
    fireRate: 2.0, fireMode: 'melee',
    damage: 30, pellets: 1,
    spreadRad: 0, projectileSpeed: 0, projectileLife: 0, projectileR: 0,
    reloadTime: 0, recoilShake: 0.20, hitStop: 0.06,
    melee: { range: 64, halfArc: Math.PI * 0.45 },  // ~80° wide swing
    bulletColor: '#ddccaa',
    sfxId: 'hit',
  },
};

// Lookup helpers — used by RunState to resolve loot drops by id.
export function isWeapon(id) { return !!WEAPONS[id]; }
