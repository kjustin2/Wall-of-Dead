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
}

// Tuned against reference HP: shambler 30, runner 14, spitter 22, brute 135.
export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    id: "pistol",
    name: "Sidearm",
    fireRate: 0.2,
    mag: 13,
    reload: 1.1,
    damage: 16,
    pellets: 1,
    spread: 0.012,
    speed: 150,
    auto: false,
    shake: 0.06,
    pierce: 0,
    tracer: 3.2,
    color: 0xffd47a,
    sfx: "shot_pistol",
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
