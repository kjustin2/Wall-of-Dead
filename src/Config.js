// Single source of truth for tunable values. Touch numbers here, not in
// individual systems. Balancing is faster when one file owns the dials.

export const CANVAS = {
  width: 1280,
  height: 720,
};

// Dark/scary palette — desaturated, low-light, neon-accent. Drawn programmatically.
export const PALETTE = {
  bgDeep: '#050306',
  bgFloor: '#10090c',
  bgFloorHi: '#1a1218',
  wall: '#22141a',
  wallHi: '#2c1c24',
  player: '#d8e0d0',
  playerOutline: '#3a4a32',
  bullet: '#ffe066',
  bulletGlow: '#ffaa33',
  bloodCore: '#5a0a14',
  bloodSplat: '#3a060c',
  zombieGreen: '#6a8c40',
  zombieDark: '#22301a',
  shamblerBody: '#5a7a38',
  runnerBody: '#7aa838',
  spitterBody: '#88a040',
  bloaterBody: '#5a8c3a',
  bruteBody: '#3a5a26',
  screamerBody: '#9c8a3a',
  crawlerBody: '#42501e',
  uiText: '#cdd6c0',
  uiDim: '#6e7a64',
  uiAccent: '#7eff66',
  uiDanger: '#ff5a55',
  uiWarn: '#ffaa33',
  hpBar: '#7eff66',
  hpBarBg: '#240a10',
};

// Engine timing — see roguehero2/src/Engine.js. Full-fps states burn fewer frames.
export const FULL_FPS_STATES = new Set([
  'combat', 'minigame', 'paused',
]);

export const ENGINE = {
  maxDt: 0.05,
};

export const PLAYER = {
  radius: 14,
  speed: 220,             // px/sec walking
  sprintMult: 1.45,
  staminaMax: 100,
  staminaDrainSprint: 18, // per second sprinting
  staminaRegen: 26,       // per second not sprinting
  hpMax: 100,
  iframeOnHit: 0.25,      // seconds invulnerable after taking damage
};

export const ARENA = {
  width: 1280,
  height: 720,
  wall: 36,
};

export const SPATIAL_HASH = {
  cellSize: 64,
};

export const PARTICLES = {
  cap: 400,
};

// Wave / night scaling — used by WaveDirector to scale budgets per night.
export const NIGHT = {
  totalNights: 7,
  baseBudget: 12,
  budgetPerNight: 6,
  ambientSpawnPerSec: 0.0,   // M1 = 0; later milestones raise this
};

// Tunables for M0 — the title pulse, etc.
export const INTRO = {
  titlePulseSpeed: 1.6,
  titleColor: '#7eff66',
  titleDripColor: '#5a0a14',
};
