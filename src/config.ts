// Central tunables. World axes:
//   +X = along the wall (player strafes here with A/D)
//   +Z = toward the camera / behind the wall;  -Z = out into the dark field
//   +Y = up
// The wall sits at z=0; the defender stands behind it at +Z; zombies spawn far
// out at -Z and advance toward the wall.

export const FIELD = {
  wallZ: 0,
  wallHalf: 24, // wall spans x ∈ [-24, 24]
  wallHeight: 1.6, // chest-high barricade — the defender peeks and fires over it
  wallThickness: 1.5,
  segments: 12,
  rampartZ: 4.2, // where the defender stands, behind the barrier
  rampartHeight: 0.35, // a low firing step the defender stands on
  playerHalf: 21, // player x clamp
  attackZ: -1.9, // zombies stop here to claw the wall
  spawnZ: -82,
  spawnZJitter: 16,
  fieldHalf: 30, // half-width of the spawn field
  crossZ: 8, // beyond this (behind player) a crossed zombie is "inside"
  aimPlaneY: 1.15,
  fireY: 2.0, // height tracers fly — clears the barrier
} as const;

// Static field wrecks that funnel the horde. Zombies steer around them, so the
// approach narrows into lanes — where you stand and aim starts to matter.
// x = center along the wall, halfW = half-width, z = depth into the field (-Z),
// halfD = half-depth.
export const CHOKES: readonly { x: number; halfW: number; z: number; halfD: number }[] = [
  { x: -10, halfW: 6.5, z: -34, halfD: 2.6 }, // wrecked bus, blocking left-center
  { x: 14, halfW: 4.5, z: -24, halfD: 2.4 }, // rubble heap, right
];

export const RUN = {
  nightLength: 96, // seconds dusk → dawn
  wallMaxHp: 360,
  playerMaxHp: 100,
} as const;

// Reference zombie HP so weapon tuning stays legible:
// shambler 30, runner 14, spitter 22, brute 135.

// Difficulty presets — multipliers applied across the run (ctx.tuning). Story is
// gentler (weaker/fewer enemies, more ammo, you take less); Nightmare is harder.
export type DifficultyId = "story" | "normal" | "nightmare";
export interface Tuning {
  zHp: number; // zombie HP scale
  spawnRate: number; // >1 = more/faster spawns
  enemyDmg: number; // damage dealt to you + the wall
  ammo: number; // starting reserve scale
}
export const DIFFICULTY: Record<DifficultyId, Tuning> = {
  story: { zHp: 0.75, spawnRate: 0.78, enemyDmg: 0.6, ammo: 1.5 },
  normal: { zHp: 1.0, spawnRate: 1.0, enemyDmg: 1.0, ammo: 1.0 },
  nightmare: { zHp: 1.35, spawnRate: 1.32, enemyDmg: 1.5, ammo: 0.8 },
};

export const PAL = {
  bg: 0x05070a,
  fogNight: 0x080a10,
  fogDawn: 0x4a3b46,
  ground: 0x0c1014,
  wall: 0x2b3138,
  wallDark: 0x191e23,
  rampart: 0x23282d,
  moon: 0xdfe7d6,
  blood: 0x7a0d10,
  acid: 0x9bd83a,
  muzzle: 0xffd47a,
  eye: 0xff5a3c,
} as const;
