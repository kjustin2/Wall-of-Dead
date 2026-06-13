// Weapon definitions. Ammo is deliberately lean — scarcity is part of the
// horror tone. Reserve ammo is shared per weapon and refilled by scavenging.
//
//   fireRate    seconds between shots
//   mag         rounds before a reload is needed
//   reload      seconds to reload
//   damage      per projectile (reference zombie HP: shambler 30, runner 14)
//   pellets     projectiles per trigger pull (shotgun > 1)
//   spread      radians of random cone
//   speed       projectile px/s
//   auto        hold-to-fire vs click-per-shot
//   shake       camera trauma added per shot

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Pistol', sfx: 'pistol',
    fireRate: 0.22, mag: 12, reload: 1.1, damage: 11,
    pellets: 1, spread: 0.018, speed: 1150, auto: false, shake: 0.05,
    color: '#fff2c4', tracerLen: 16,
  },
  smg: {
    id: 'smg', name: 'SMG', sfx: 'smg',
    fireRate: 0.075, mag: 30, reload: 1.5, damage: 7,
    pellets: 1, spread: 0.055, speed: 1250, auto: true, shake: 0.035,
    color: '#fff0b0', tracerLen: 14,
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', sfx: 'shotgun',
    fireRate: 0.72, mag: 6, reload: 1.9, damage: 8,
    pellets: 8, spread: 0.34, speed: 1000, auto: false, shake: 0.16,
    color: '#ffd27a', tracerLen: 12,
  },
  rifle: {
    id: 'rifle', name: 'Rifle', sfx: 'rifle',
    fireRate: 0.5, mag: 8, reload: 1.7, damage: 30,
    pellets: 1, spread: 0.006, speed: 1700, auto: false, shake: 0.12,
    color: '#fffadf', tracerLen: 24, pierce: 2,
  },
};

// A loadout entry tracks live ammo state for one owned weapon.
export function makeLoadout(id, reserve) {
  const w = WEAPONS[id];
  return { id, ammo: w.mag, reserve: reserve ?? w.mag * 3 };
}
