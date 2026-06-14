// Central tunables. World axes:
//   +X = along the wall (player strafes here with A/D)
//   +Z = toward the camera / behind the wall;  -Z = out into the dark field
//   +Y = up
// The wall sits at z=0; the defender stands behind it at +Z; zombies spawn far
// out at -Z and advance toward the wall.

export const FIELD = {
  wallZ: 0,
  wallHalf: 24, // wall spans x ∈ [-24, 24]
  wallHeight: 3.4,
  wallThickness: 1.4,
  segments: 12,
  rampartZ: 4.6, // top of the platform the defender walks on
  rampartHeight: 1.1,
  playerHalf: 21, // player x clamp
  attackZ: -1.9, // zombies stop here to claw the wall
  spawnZ: -82,
  spawnZJitter: 16,
  fieldHalf: 30, // half-width of the spawn field
  crossZ: 8, // beyond this (behind player) a crossed zombie is "inside"
  aimPlaneY: 1.15,
} as const;

export const RUN = {
  nightLength: 96, // seconds dusk → dawn
  wallMaxHp: 360,
  playerMaxHp: 100,
} as const;

// Reference zombie HP so weapon tuning stays legible:
// shambler 30, runner 14, spitter 22, brute 135.

export const PAL = {
  bg: 0x05070a,
  fogNight: 0x0a0e14,
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
