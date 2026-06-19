export interface WeaponDef {
  id: string;
  name: string;
  fireRate: number; // seconds between shots
  mag: number;
  reload: number; // seconds
  damage: number;
  pellets: number;
  spread: number; // radians of cone half-angle
  speed: number; // projectile units/sec
  auto: boolean;
  shake: number; // camera trauma per shot
  pierce: number; // extra zombies a round passes through
  tracer: number; // tracer length (visual)
  color: number;
  sfx: string;
  sidearm?: boolean; // always-available fallback — never runs out of reserve
}

// A very weak, infinite-ammo holdout used by allies who have no gun assigned.
export const ALLY_SIDEARM: WeaponDef = {
  id: "ally_sidearm",
  name: "Sidearm",
  fireRate: 0.5,
  mag: 99,
  reload: 1,
  damage: 5,
  pellets: 1,
  spread: 0.06,
  speed: 145,
  auto: false,
  shake: 0,
  pierce: 0,
  tracer: 2.6,
  color: 0xffd47a,
  sfx: "shot_pistol",
  sidearm: true,
};

// Tuned against reference HP: shambler 30, runner 14, spitter 22, brute 135.
export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    id: "pistol",
    name: "Sidearm",
    fireRate: 0.28,
    mag: 10,
    reload: 1.2,
    damage: 8,
    pellets: 1,
    spread: 0.03,
    speed: 150,
    auto: false,
    shake: 0.05,
    pierce: 0,
    tracer: 3.2,
    color: 0xffd47a,
    sfx: "shot_pistol",
    sidearm: true,
  },
  smg: {
    id: "smg",
    name: "SMG",
    fireRate: 0.075,
    mag: 32,
    reload: 1.5,
    damage: 9,
    pellets: 1,
    spread: 0.045,
    speed: 160,
    auto: true,
    shake: 0.045,
    pierce: 0,
    tracer: 2.6,
    color: 0xffe08a,
    sfx: "shot_smg",
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    fireRate: 0.72,
    mag: 6,
    reload: 2.0,
    damage: 8,
    pellets: 9,
    spread: 0.14,
    speed: 130,
    auto: false,
    shake: 0.17,
    pierce: 0,
    tracer: 2.2,
    color: 0xffc36a,
    sfx: "shot_shotgun",
  },
  rifle: {
    id: "rifle",
    name: "Rifle",
    fireRate: 0.5,
    mag: 8,
    reload: 1.7,
    damage: 34,
    pellets: 1,
    spread: 0.004,
    speed: 240,
    auto: false,
    shake: 0.13,
    pierce: 2,
    tracer: 6.0,
    color: 0xfff0c0,
    sfx: "shot_rifle",
  },
  lmg: {
    id: "lmg",
    name: "LMG",
    fireRate: 0.07,
    mag: 60,
    reload: 2.7,
    damage: 12,
    pellets: 1,
    spread: 0.05,
    speed: 175,
    auto: true,
    shake: 0.06,
    pierce: 1,
    tracer: 3.4,
    color: 0xffe08a,
    sfx: "shot_smg",
  },
  // --- Later-act finds: a wider pool so the 5-weapon cap forces real choices. ---
  ar: {
    id: "ar",
    name: "Assault Rifle",
    fireRate: 0.11,
    mag: 30,
    reload: 1.8,
    damage: 16,
    pellets: 1,
    spread: 0.03,
    speed: 205,
    auto: true,
    shake: 0.07,
    pierce: 1,
    tracer: 4.2,
    color: 0xffe0a0,
    sfx: "shot_rifle",
  },
  dmr: {
    id: "dmr",
    name: "Marksman",
    fireRate: 0.34,
    mag: 12,
    reload: 1.9,
    damage: 26,
    pellets: 1,
    spread: 0.006,
    speed: 250,
    auto: false,
    shake: 0.1,
    pierce: 2,
    tracer: 6.5,
    color: 0xfff0d0,
    sfx: "shot_rifle",
  },
  autoshotgun: {
    id: "autoshotgun",
    name: "Auto Shotgun",
    fireRate: 0.34,
    mag: 8,
    reload: 2.4,
    damage: 7,
    pellets: 6,
    spread: 0.13,
    speed: 130,
    auto: true,
    shake: 0.14,
    pierce: 0,
    tracer: 2.2,
    color: 0xffb060,
    sfx: "shot_shotgun",
  },
  minigun: {
    id: "minigun",
    name: "Minigun",
    fireRate: 0.04,
    mag: 120,
    reload: 3.6,
    damage: 9,
    pellets: 1,
    spread: 0.06,
    speed: 185,
    auto: true,
    shake: 0.05,
    pierce: 1,
    tracer: 3.0,
    color: 0xffe08a,
    sfx: "shot_smg",
  },
  magnum: {
    id: "magnum",
    name: "Magnum",
    fireRate: 0.62,
    mag: 6,
    reload: 1.9,
    damage: 46,
    pellets: 1,
    spread: 0.01,
    speed: 230,
    auto: false,
    shake: 0.2,
    pierce: 1,
    tracer: 5.0,
    color: 0xfff0c0,
    sfx: "shot_rifle",
  },
};

export interface Loadout {
  def: WeaponDef;
  ammo: number; // rounds in magazine
  reserve: number; // spare rounds
}

export function makeLoadout(id: string, reserve: number): Loadout {
  const def = WEAPONS[id];
  return { def, ammo: def.mag, reserve };
}
