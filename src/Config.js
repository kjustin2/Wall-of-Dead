// Central tunables for Wall of Dead.
//
// The game is a "behind-the-wall" 2.5D defense: a horizontal barrier sits
// across the lower screen, the player walks along it (A/D), and zombies
// emerge from the dark horizon at the top and advance downward toward the
// wall. Everything below is laid out against a fixed 1280x720 canvas; the
// renderer letterboxes/scales it to fit the window.

export const VIEW = {
  W: 1280,
  H: 720,
};

// Field geometry. The "field" is the dark kill-zone zombies cross.
//   HORIZON_Y  ── where zombies fade in and spawn
//   WALL_Y     ── the front face of the wall; zombies stop here to claw it
//   WALL_BOTTOM── bottom of the wall structure
//   PLAYER_Y   ── the lane the player walks behind the wall
export const FIELD = {
  HORIZON_Y: 96,
  WALL_Y: 556,
  WALL_BOTTOM: 628,
  PLAYER_Y: 602,
  MARGIN_X: 64,        // player can't walk past this from either edge
  SPAWN_PAD: 60,       // zombies can spawn this far outside the visible x
};

// Depth scaling: a zombie at the horizon is small/dim, at the wall it's
// full-size. lerp factor t = (y - HORIZON_Y) / (WALL_Y - HORIZON_Y).
export const DEPTH = {
  scaleNear: 1.28,     // at the wall
  scaleFar: 0.42,      // at the horizon
};

// Horror palette — desaturated, cold, with a sickly green accent.
export const PAL = {
  skyTop: '#070a0d',
  skyHorizon: '#13202a',
  fieldNear: '#0c1410',
  fieldFar: '#0a1018',
  wall: '#23211f',
  wallEdge: '#3a362f',
  wallDmg: '#5a1410',
  player: '#cfe8d0',
  playerDark: '#6f8f78',
  muzzle: '#ffd27a',
  bullet: '#fff2c4',
  blood: '#7a0d10',
  bloodDark: '#3a060a',
  hud: '#9fb8a6',
  hudDim: '#4a5a4f',
  warn: '#d8662e',
  good: '#5fbf6a',
  accent: '#7fff8a',
  fog: 'rgba(120,150,140,0.05)',
};

export const ENGINE = {
  maxDt: 1 / 20,       // clamp dt so a tab-blur doesn't teleport entities
};

// Run-wide pacing. The slice is a 4-leg road to the safe zone: survive a
// night, scavenge by day, advance one leg. Reach the end → victory.
export const RUN = {
  legsToSafeZone: 4,
  wallMaxHp: 360,      // 12 segments → 30 HP each; a brute claw is ~16
  dawnRepair: 40,      // free patch applied to the wall each dawn
};
