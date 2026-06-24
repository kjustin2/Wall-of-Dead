import * as THREE from "three";
import type { Ctx } from "../game/ctx";
import { makeGlow, makeLabel, concreteTexture, stencilTexture, glowTexture } from "../render/textures";
import { clamp } from "../core/math";
import { TRAITS } from "../game/traits";
import { levelInfo, type SupplyTheme } from "../game/acts";

const SURVIVOR_NAMES = ["Cole", "Reyes", "Tess", "Vance", "Okafor", "Lin", "Brenner"];

const DURATION = 82;
// A larger play area than the old lot — more district to crawl, longer sightlines
// broken up by procedural city blocks (see generateWalls).
const AREA = { minX: -54, maxX: 54, minZ: -88, maxZ: -4 };
const SNEAK = 7.2;
const SPRINT = 13.6;
const CRATES = 8; // default supply crates (per-run count comes from DENSITY)
const AV_R = 0.6;

/** Where you choose to scavenge. The choice drives BOTH the danger/loot AND the
 * look of the map, so it matches its label: a crowded district is a dense, neon-
 * lit maze with the richest (and most-guarded) haul; the quiet outskirts are an
 * open, scrubby, near-empty edge of town — lean pickings, but far safer. */
export type Density = "low" | "med" | "high";
interface DensityCfg {
  name: string; // shown in the day banner
  guardMul: number; // scales the patrol count
  crates: number; // supply crates to find (also the run-rating denominator)
  gold: number; // how many of those are rich "ammo cache" crates
  kits: number; // bonus repair-kit pickups
  // --- environment skin ---
  floor: number; // floor tint
  wall: number; // cover-wall tint
  cap: number; // wall-cap tint
  fog: number; // scene fog density
  layouts: number[]; // which MAPS layouts this archetype draws from
  lanes: boolean; // painted lot/lane lines (urban only)
  rubble: number;
  barrels: number;
  planks: number;
  blood: number;
  redLights: number; // flickering emergency lights (urban)
  neon: number; // hazard neon signs (urban)
  graffiti: number; // floor stencils
  glints: number; // broken-glass sparkles
  trees: number; // dead scrub trees (outskirts)
  buildings: number; // backdrop building silhouettes (urban)
}
const DENSITY: Record<Density, DensityCfg> = {
  high: {
    name: "CROWDED DISTRICT", guardMul: 1.6, crates: 12, gold: 4, kits: 3,
    floor: 0x2b323a, wall: 0x2a2f35, cap: 0x3a4048, fog: 0.05, layouts: [1, 3, 4],
    lanes: true, rubble: 24, barrels: 10, planks: 12, blood: 11, redLights: 4, neon: 3, graffiti: 5, glints: 24, trees: 0, buildings: 16,
  },
  med: {
    name: "PICKED-OVER BLOCKS", guardMul: 1.0, crates: 8, gold: 2, kits: 2,
    floor: 0x2a2d2a, wall: 0x2c3026, cap: 0x3a4030, fog: 0.04, layouts: [0, 2],
    lanes: true, rubble: 14, barrels: 6, planks: 8, blood: 7, redLights: 2, neon: 1, graffiti: 3, glints: 14, trees: 3, buildings: 8,
  },
  low: {
    name: "QUIET OUTSKIRTS", guardMul: 0.6, crates: 5, gold: 1, kits: 1,
    floor: 0x2b2a1d, wall: 0x33301f, cap: 0x403924, fog: 0.03, layouts: [5, 6],
    lanes: false, rubble: 9, barrels: 3, planks: 4, blood: 3, redLights: 0, neon: 0, graffiti: 1, glints: 6, trees: 9, buildings: 0,
  },
};

interface ActSkin {
  route: string;
  floor: number;
  wall: number;
  cap: number;
  accent: number;
  guard: number;
  crate: number;
  gold: number;
  kit: number;
  backdrop: number;
  window: number;
  fogMul: number;
  layouts: Record<Density, number[]>;
  lanes?: boolean;
  rubbleMul: number;
  barrelMul: number;
  neonMul: number;
  redMul: number;
  glintMul: number;
}

const ACT_SKINS: Record<SupplyTheme, ActSkin> = {
  outer: {
    route: "OUTER ROAD",
    floor: 0x3a2814,
    wall: 0x3a2e22,
    cap: 0x544131,
    accent: 0xff5a2c,
    guard: 0xffb24a,
    crate: 0x5a3f25,
    gold: 0xc58a22,
    kit: 0x2c5260,
    backdrop: 0x12100f,
    window: 0xb15a24,
    fogMul: 1,
    layouts: { high: [1, 3, 4], med: [0, 2], low: [5, 6] },
    lanes: true,
    rubbleMul: 1.15,
    barrelMul: 1.2,
    neonMul: 0.7,
    redMul: 1,
    glintMul: 1,
  },
  flood: {
    route: "FLOODLINE",
    floor: 0x18313a,
    wall: 0x203a42,
    cap: 0x315866,
    accent: 0x73dfff,
    guard: 0x78e2ff,
    crate: 0x214752,
    gold: 0x8aa84a,
    kit: 0x2a6478,
    backdrop: 0x0b161b,
    window: 0x4bb6ca,
    fogMul: 1.24,
    layouts: { high: [3, 4], med: [2, 4], low: [5] },
    lanes: false,
    rubbleMul: 0.85,
    barrelMul: 0.65,
    neonMul: 0.55,
    redMul: 0.65,
    glintMul: 1.8,
  },
  haven: {
    route: "HAVEN PERIMETER",
    floor: 0x2a323b,
    wall: 0x323b45,
    cap: 0x68747f,
    accent: 0xcfe9ff,
    guard: 0xff4030,
    crate: 0x36414a,
    gold: 0xb8a35a,
    kit: 0x33576a,
    backdrop: 0x11171e,
    window: 0xbfdfff,
    fogMul: 0.82,
    layouts: { high: [1, 3], med: [0, 4], low: [6] },
    lanes: true,
    rubbleMul: 0.7,
    barrelMul: 0.45,
    neonMul: 0.2,
    redMul: 1.4,
    glintMul: 1.25,
  },
};

const RUN_LABEL: Record<Density, string> = {
  high: "CROWDED",
  med: "SALVAGE",
  low: "QUIET",
};

function mixColor(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

function themedDensity(base: DensityCfg, skin: ActSkin, density: Density): DensityCfg {
  return {
    ...base,
    name: `${skin.route} - ${RUN_LABEL[density]}`,
    floor: mixColor(base.floor, skin.floor, 0.62),
    wall: mixColor(base.wall, skin.wall, 0.6),
    cap: mixColor(base.cap, skin.cap, 0.6),
    fog: base.fog * skin.fogMul,
    layouts: skin.layouts[density],
    lanes: skin.lanes ?? base.lanes,
    rubble: Math.max(2, Math.round(base.rubble * skin.rubbleMul)),
    barrels: Math.max(0, Math.round(base.barrels * skin.barrelMul)),
    redLights: Math.max(0, Math.round(base.redLights * skin.redMul)),
    neon: Math.max(0, Math.round(base.neon * skin.neonMul)),
    glints: Math.max(0, Math.round(base.glints * skin.glintMul)),
  };
}
const VISION_RANGE = 15;
const CONE_HALF = 0.52; // radians, half-angle of a guard's sight cone
const NOISE_SPRINT = 12; // a sprinting avatar is heard within this radius
const HIDE_R = 2.6; // radius of a hiding alcove

export type Tier = "S" | "A" | "B" | "C" | "D";

export function tierFromFrac(f: number): Tier {
  if (f >= 0.95) return "S";
  if (f >= 0.75) return "A";
  if (f >= 0.55) return "B";
  if (f >= 0.3) return "C";
  return "D";
}

interface Wall {
  x: number;
  z: number;
  w: number;
  d: number;
  car?: boolean;
}
interface Crate {
  group: THREE.Group;
  x: number;
  z: number;
  got: boolean;
  gold: boolean;
  kit: boolean;
  weapon?: string; // weapon id this crate holds (a rare weapon-case crate), if any
  halo: THREE.Sprite; // the beacon glow (breathes so a find glints in the dark)
  haloBase: number; // its rest scale
}
interface Survivor {
  group: THREE.Group;
  x: number;
  z: number;
  taken: boolean;
}
type GType = "shambler" | "runner" | "spitter" | "brute" | "screamer";
interface Guard {
  group: THREE.Group;
  cone: THREE.Mesh;
  coneMat: THREE.MeshBasicMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  type: GType;
  x: number;
  z: number;
  facing: number;
  patrol: { x: number; z: number }[];
  pIdx: number;
  state: "patrol" | "chase" | "investigate";
  alertT: number;
  speed: number;
  chase: number; // chase speed
  vision: number; // sight-range multiplier
  scream: boolean; // alerts the block when it first spots you
  spitCd: number; // spitter: time until next projectile
  stuckT: number;
  px: number;
  pz: number;
  invX: number;
  invZ: number;
  dead: boolean;
}
interface Spit {
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  mesh: THREE.Mesh;
}
// Per-type look + movement. Body color is the main read; eyes/cone are state-tinted.
//   shambler — the baseline patroller.
//   runner   — small, fast, deadly chase.
//   spitter  — hangs back and lobs acid.
//   brute    — huge + slow; a lumbering roadblock with a short cone.
//   screamer — spots you and shrieks, dragging every nearby guard onto your spot.
interface GuardCfg {
  flesh: number;
  coat: number;
  scale: number;
  speed: number;
  chase: number;
  vision?: number; // sight-cone range multiplier (default 1)
  scream?: boolean; // alerts nearby guards to your position on first sight
}
const GUARD_CFG: Record<GType, GuardCfg> = {
  shambler: { flesh: 0x35402c, coat: 0x232a1c, scale: 1.0, speed: 3.0, chase: 7.4 },
  runner: { flesh: 0x5a3020, coat: 0x331a12, scale: 0.84, speed: 4.6, chase: 10.5 },
  spitter: { flesh: 0x2f4a26, coat: 0x1c3018, scale: 1.1, speed: 2.3, chase: 5.6 },
  brute: { flesh: 0x47352a, coat: 0x281a12, scale: 1.5, speed: 1.9, chase: 4.8, vision: 0.82 },
  screamer: { flesh: 0x53305a, coat: 0x2a1830, scale: 0.95, speed: 3.3, chase: 8.2, vision: 1.18, scream: true },
};
interface HideZone {
  x: number;
  z: number;
}

const THREAT = 0xff4030;

// Several maze-ish layouts (corners to break line of sight); one is picked per
// run. Concrete barriers plus a couple of wrecked cars — all solid cover.
const MAPS: Wall[][] = [
  // 0 — the original lot
  [
    { x: -14, z: -14, w: 20, d: 1.4 },
    { x: 12, z: -13, w: 1.4, d: 14 },
    { x: 26, z: -20, w: 1.4, d: 18 },
    { x: -2, z: -27, w: 22, d: 1.4 },
    { x: -26, z: -26, w: 1.4, d: 22 },
    { x: 18, z: -34, w: 1.4, d: 22 },
    { x: 4, z: -42, w: 18, d: 1.4 },
    { x: -16, z: -44, w: 14, d: 1.4 },
    { x: -30, z: -52, w: 1.4, d: 16 },
    { x: 28, z: -50, w: 1.4, d: 18 },
    { x: 8, z: -58, w: 22, d: 1.4 },
    { x: -10, z: -58, w: 1.4, d: 12 },
    { x: -8, z: -22, w: 2.4, d: 4.6, car: true },
    { x: 16, z: -40, w: 4.6, d: 2.4, car: true },
    { x: -22, z: -50, w: 2.4, d: 4.6, car: true },
  ],
  // 1 — a tighter, more enclosed warehouse grid
  [
    { x: 0, z: -12, w: 30, d: 1.4 },
    { x: -15, z: -20, w: 1.4, d: 18 },
    { x: 15, z: -20, w: 1.4, d: 18 },
    { x: -4, z: -24, w: 16, d: 1.4 },
    { x: 8, z: -34, w: 1.4, d: 20 },
    { x: -10, z: -36, w: 16, d: 1.4 },
    { x: -24, z: -40, w: 1.4, d: 22 },
    { x: 24, z: -42, w: 1.4, d: 24 },
    { x: 2, z: -48, w: 22, d: 1.4 },
    { x: -14, z: -56, w: 18, d: 1.4 },
    { x: 14, z: -58, w: 1.4, d: 12 },
    { x: 18, z: -16, w: 2.4, d: 4.6, car: true },
    { x: -10, z: -46, w: 4.6, d: 2.4, car: true },
    { x: 6, z: -60, w: 2.4, d: 4.6, car: true },
  ],
  // 2 — open plaza with diagonal-ish staggered cover (longer sightlines)
  [
    { x: -20, z: -16, w: 1.4, d: 20 },
    { x: 20, z: -18, w: 1.4, d: 24 },
    { x: 0, z: -20, w: 14, d: 1.4 },
    { x: -10, z: -30, w: 14, d: 1.4 },
    { x: 10, z: -32, w: 14, d: 1.4 },
    { x: -28, z: -38, w: 1.4, d: 18 },
    { x: 0, z: -42, w: 1.4, d: 18 },
    { x: -14, z: -50, w: 20, d: 1.4 },
    { x: 16, z: -50, w: 14, d: 1.4 },
    { x: -6, z: -60, w: 26, d: 1.4 },
    { x: 12, z: -24, w: 2.4, d: 4.6, car: true },
    { x: -16, z: -36, w: 4.6, d: 2.4, car: true },
    { x: 22, z: -56, w: 2.4, d: 4.6, car: true },
  ],
  // 3 — central spine with side rooms (forces commit down one flank)
  [
    { x: 0, z: -14, w: 1.4, d: 18 },
    { x: 0, z: -38, w: 1.4, d: 20 },
    { x: -12, z: -22, w: 22, d: 1.4 },
    { x: 12, z: -22, w: 22, d: 1.4 },
    { x: -22, z: -32, w: 1.4, d: 22 },
    { x: 22, z: -32, w: 1.4, d: 22 },
    { x: -12, z: -46, w: 20, d: 1.4 },
    { x: 14, z: -46, w: 20, d: 1.4 },
    { x: -6, z: -58, w: 1.4, d: 14 },
    { x: 8, z: -58, w: 18, d: 1.4 },
    { x: -18, z: -54, w: 2.4, d: 4.6, car: true },
    { x: 16, z: -16, w: 4.6, d: 2.4, car: true },
    { x: 4, z: -50, w: 2.4, d: 4.6, car: true },
  ],
  // 4 — broken ring road with a choked center (loops + dead-ends)
  [
    { x: -16, z: -14, w: 22, d: 1.4 },
    { x: 16, z: -14, w: 18, d: 1.4 },
    { x: -26, z: -26, w: 1.4, d: 26 },
    { x: 26, z: -26, w: 1.4, d: 26 },
    { x: -6, z: -28, w: 14, d: 1.4 },
    { x: 10, z: -34, w: 14, d: 1.4 },
    { x: -14, z: -40, w: 1.4, d: 16 },
    { x: 4, z: -44, w: 1.4, d: 18 },
    { x: -20, z: -52, w: 18, d: 1.4 },
    { x: 18, z: -52, w: 18, d: 1.4 },
    { x: -2, z: -60, w: 24, d: 1.4 },
    { x: 20, z: -30, w: 2.4, d: 4.6, car: true },
    { x: -10, z: -48, w: 4.6, d: 2.4, car: true },
    { x: 12, z: -58, w: 2.4, d: 4.6, car: true },
  ],
  // 5 — outskirts: open ground, a handful of scattered low cover (long sightlines)
  [
    { x: -18, z: -22, w: 6, d: 1.4 },
    { x: 14, z: -18, w: 1.4, d: 7 },
    { x: 2, z: -34, w: 8, d: 1.4 },
    { x: -24, z: -44, w: 1.4, d: 8 },
    { x: 20, z: -46, w: 7, d: 1.4 },
    { x: -8, z: -54, w: 1.4, d: 6 },
    { x: -4, z: -28, w: 2.4, d: 4.6, car: true },
    { x: 10, z: -50, w: 4.6, d: 2.4, car: true },
  ],
  // 6 — outskirts: a lone barn-ish block + a broken fence line, mostly open
  [
    { x: -10, z: -26, w: 10, d: 1.4 },
    { x: -15, z: -32, w: 1.4, d: 12 },
    { x: -5, z: -38, w: 10, d: 1.4 },
    { x: 18, z: -30, w: 1.4, d: 10 },
    { x: 8, z: -52, w: 9, d: 1.4 },
    { x: 24, z: -50, w: 2.4, d: 4.6, car: true },
    { x: -20, z: -52, w: 4.6, d: 2.4, car: true },
  ],
];

function pushOutAABB(px: number, pz: number, r: number, w: Wall): [number, number] {
  const minX = w.x - w.w / 2;
  const maxX = w.x + w.w / 2;
  const minZ = w.z - w.d / 2;
  const maxZ = w.z + w.d / 2;
  const cx = clamp(px, minX, maxX);
  const cz = clamp(pz, minZ, maxZ);
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return [px, pz];
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const push = r - d;
    return [px + (dx / d) * push, pz + (dz / d) * push];
  }
  // centre inside the box — eject along the nearest face
  const dl = px - minX;
  const dr = maxX - px;
  const dt = pz - minZ;
  const db = maxZ - pz;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return [minX - r, pz];
  if (m === dr) return [maxX + r, pz];
  if (m === dt) return [px, minZ - r];
  return [px, maxZ + r];
}

function segAABB(ax: number, az: number, bx: number, bz: number, w: Wall): boolean {
  const minX = w.x - w.w / 2;
  const maxX = w.x + w.w / 2;
  const minZ = w.z - w.d / 2;
  const maxZ = w.z + w.d / 2;
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  for (let axis = 0; axis < 2; axis++) {
    const o = axis === 0 ? ax : az;
    const dd = axis === 0 ? dx : dz;
    const lo = axis === 0 ? minX : minZ;
    const hi = axis === 0 ? maxX : maxZ;
    if (Math.abs(dd) < 1e-6) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / dd;
      let t2 = (hi - o) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/** Entry parameter t in [0,1] where segment a→b first enters the box, else Infinity. */
function segEntryT(ax: number, az: number, bx: number, bz: number, w: Wall): number {
  const minX = w.x - w.w / 2;
  const maxX = w.x + w.w / 2;
  const minZ = w.z - w.d / 2;
  const maxZ = w.z + w.d / 2;
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  for (let axis = 0; axis < 2; axis++) {
    const o = axis === 0 ? ax : az;
    const dd = axis === 0 ? dx : dz;
    const lo = axis === 0 ? minX : minZ;
    const hi = axis === 0 ? maxX : maxZ;
    if (Math.abs(dd) < 1e-6) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / dd;
      let t2 = (hi - o) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/**
 * The day "Supply Run" — a moody stealth crawl. The map is dark; your avatar has
 * a flashlight and moves slow (hold Shift to sprint a short burst). Zombies
 * patrol with visible sight cones; step into one (with line of sight, not behind
 * a wall) and they give chase. Find the crates in the dark; returns { tier, frac }.
 */
export class Scavenge {
  active = false;
  done = false;
  got = 0;
  total = CRATES;
  timeLeft = DURATION;
  readonly maxTime = DURATION;
  stamina = 1;
  private exhausted = false;
  spotted = false;
  // HUD-facing state (read by the day HUD)
  promptText = "";
  lightOn = true;
  extractOpen = false;

  private group = new THREE.Group();
  private startGrace = 0; // no detection for a beat at the start of a run
  private spits: Spit[] = [];
  private hideZones: HideZone[] = [];
  private extractZone = { x: 0, z: -5 };
  private extractMarker = new THREE.Group();
  private hidden = false;
  private debugAlert = false; // debug: hold a "spotted" frame for capture
  private dbgTeleT = 0;
  private lightDefault = 19;
  private avatar = new THREE.Group();
  private light: THREE.SpotLight;
  private sweep!: THREE.SpotLight; // slow watch-searchlight raking the lot
  private ax = 0;
  private az = -7;
  private crates: Crate[] = [];
  private guards: Guard[] = [];
  private survivor: Survivor | null = null;
  private redLights: { light: THREE.PointLight; glow: THREE.Sprite; phase: number }[] = [];
  private signs: { mat: THREE.MeshBasicMaterial; glow: THREE.Sprite; phase: number }[] = [];
  private fogPrev = 0.017;
  private groanT = 4;
  private t = 0;
  private tmp = new THREE.Vector2();
  private coneGeo: THREE.BufferGeometry;
  private nearest = new THREE.Vector3();
  private walls: Wall[] = MAPS[0]; // active layout (chosen per run)
  private wallGroup = new THREE.Group();
  private floorMat!: THREE.MeshStandardMaterial;
  private laneGroup = new THREE.Group(); // painted lot lines (urban only)
  private dressGroup = new THREE.Group(); // per-run rubble/barrels/signs/etc.
  private backdropGroup = new THREE.Group(); // per-run buildings / scrub trees
  // Per-run environment skin (set in start() from the chosen density archetype).
  private envWall = 0x2a2f35;
  private envCap = 0x3a4048;
  private envFog = 0.038;
  private skinId: SupplyTheme = "outer";
  /** Weapon ids picked up from weapon-case crates this run (granted at day's end). */
  private collectedWeapons: string[] = [];
  /** Name of the current environment — shown in the day banner. */
  envName = "PICKED-OVER BLOCKS";
  private spitGeo = new THREE.SphereGeometry(0.22, 8, 6);
  private spitMat = new THREE.MeshBasicMaterial({ color: 0x9bff4a, fog: false });
  private spitPool: THREE.Mesh[] = [];

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    this.buildAvatar();
    this.light = new THREE.SpotLight(0xfff0d0, 18, 26, 0.62, 0.5, 1.0);
    this.light.position.set(0, 3.5, 0);
    this.light.target.position.set(0, -1, 10); // local +Z = the way the avatar faces
    this.avatar.add(this.light);
    this.avatar.add(this.light.target);
    this.avatar.add(makeGlow(0x6fc3ff, 2.4, 0.5));
    this.group.add(this.avatar);

    // A slow watch-searchlight raking the lot from high above — the guards' eyes
    // hunting the dark. It lights real geometry (a grounded moving pool, not a fake
    // additive blob); top-down framing keeps it a drifting pool, never a wedge. Its
    // color is re-tinted per district in start().
    this.sweep = new THREE.SpotLight(0xdfe8ff, 4.2, 80, 0.34, 0.7, 1.1);
    this.sweep.position.set(0, 28, -30);
    this.sweep.target.position.set(0, 0, -42);
    this.group.add(this.sweep, this.sweep.target);

    this.group.add(this.backdropGroup, this.dressGroup);
    this.buildFloor();
    this.buildWalls();
    this.buildBoundary();
    this.buildHideAndExtract();
    // Rubble/signage/buildings/trees are rebuilt per run in start() so the map
    // matches the chosen district (crowded urban vs. open outskirts).

    // Sight-cone sector geometry (points +Z; rotated to each guard's facing).
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.absarc(0, 0, VISION_RANGE, Math.PI / 2 - CONE_HALF, Math.PI / 2 + CONE_HALF, false);
    shape.lineTo(0, 0);
    const g = new THREE.ShapeGeometry(shape, 16);
    g.rotateX(Math.PI / 2);
    this.coneGeo = g;

    this.group.visible = false;
    scene.add(this.group);
  }

  private buildAvatar(): void {
    const coat = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x223043, roughness: 1, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 1, flatShading: true });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.45), coat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), dark);
    pack.position.set(0, 1.05, 0.34);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skin);
    head.position.y = 1.72;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.46), dark);
    helmet.position.y = 1.95;
    for (const lx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), dark);
      leg.position.set(lx, 0.42, 0);
      this.avatar.add(leg);
    }
    this.avatar.add(torso, pack, head, helmet);
  }

  /** A dedicated cracked-concrete lot floor under the run, with faded painted
   * lane lines — reads as an urban yard rather than open ground. */
  private buildFloor(): void {
    const tex = concreteTexture();
    tex.repeat.set(15, 13);
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0x2b323a, map: tex, roughness: 0.85, metalness: 0.08 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(132, 104), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, (AREA.minZ + AREA.maxZ) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
    // Faded yellow parking/lane lines — toggled off in the rural outskirts.
    this.group.add(this.laneGroup);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x6a5a22, transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 12), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-48 + i * 12, 0.03, -26);
      this.laneGroup.add(line);
    }
  }

  private buildWalls(): void {
    // Rebuildable: DISPOSE the prior layout's geometry/materials (not just clear,
    // or every supply run leaks a whole block layout → GPU memory creep → lag).
    this.clearGroup(this.wallGroup);
    if (!this.wallGroup.parent) this.group.add(this.wallGroup);
    const concrete = new THREE.MeshStandardMaterial({ color: this.envWall, roughness: 1, flatShading: true });
    const cap = new THREE.MeshStandardMaterial({ color: this.envCap, roughness: 1, flatShading: true });
    const rust = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.8, metalness: 0.3, flatShading: true });
    const tire = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1 });
    for (const w of this.walls) {
      if (w.car) {
        const car = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.9, w.d), rust);
        body.position.y = 0.7;
        body.castShadow = true;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(w.w * 0.85, 0.8, w.d * 0.5), metal);
        cabin.position.set(0, 1.4, 0);
        car.add(body, cabin);
        const along = w.w > w.d; // orient wheels along the longer axis
        for (const a of [-0.32, 0.32])
          for (const b of [-0.34, 0.34]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), tire);
            wheel.rotation.z = Math.PI / 2;
            if (along) wheel.position.set(a * w.w, 0.4, b * w.d);
            else wheel.position.set(b * w.w, 0.4, a * w.d);
            car.add(wheel);
          }
        car.position.set(w.x, 0, w.z);
        this.wallGroup.add(car);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, 1.8, w.d), concrete);
        m.position.set(w.x, 0.9, w.z);
        m.castShadow = true;
        m.receiveShadow = true;
        const top = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.1, 0.25, w.d + 0.1), cap);
        top.position.set(w.x, 1.85, w.z);
        this.wallGroup.add(m, top);
      }
    }
  }

  /** Procedurally lay out a district of cover: a loose grid of "blocks" (solid
   * buildings, L-corners, long fences, wrecked cars) separated by open streets,
   * scaled to fill the larger play area. The entrance strip is always kept clear
   * so you never spawn boxed in, and blocks are islands (never closed rings), so
   * every free spot stays reachable. Varies per run and per district. */
  private generateWalls(cfg: DensityCfg): Wall[] {
    const rng = this.ctx.rng;
    const walls: Wall[] = [];
    const urban = cfg.buildings > 0;
    let built = urban ? 0.82 : 0.44; // crowded districts pack the blocks
    if (this.skinId === "flood") built *= 0.82; // more open black water
    const carBias = this.skinId === "outer" ? 0.12 : 0; // outer road = more wrecks

    const entranceZ = AREA.maxZ - 12; // keep z > this (the spawn/extract strip) clear
    const minX = AREA.minX + 5;
    const maxX = AREA.maxX - 5;
    const minZ = AREA.minZ + 6;
    const maxZ = entranceZ - 4;
    const cols = 4;
    const rows = 5;
    const cellW = (maxX - minX) / cols;
    const cellD = (maxZ - minZ) / rows;

    for (let cxI = 0; cxI < cols; cxI++) {
      for (let czI = 0; czI < rows; czI++) {
        if (!rng.chance(built)) continue;
        const ccx = minX + (cxI + 0.5) * cellW + rng.range(-2, 2);
        const ccz = minZ + (czI + 0.5) * cellD + rng.range(-2, 2);
        const roll = rng.next() + carBias; // outer road skews toward more wrecks
        if (roll < 0.4) {
          // Solid building block — big cover, sized to leave streets around it.
          const bw = clamp(rng.range(7, 13), 6, cellW - 8);
          const bd = clamp(rng.range(6, 10), 5, cellD - 4);
          walls.push({ x: ccx, z: ccz, w: bw, d: bd });
        } else if (roll < 0.66) {
          // L-shaped wall corner.
          const arm = clamp(rng.range(6, 10), 5, Math.min(cellW - 6, cellD - 2));
          const sx = rng.chance(0.5) ? 1 : -1;
          const sz = rng.chance(0.5) ? 1 : -1;
          walls.push({ x: ccx, z: ccz, w: arm, d: 1.4 });
          walls.push({ x: ccx + (sx * (arm / 2 - 0.7)), z: ccz + (sz * (arm / 2)), w: 1.4, d: arm });
        } else if (roll < 0.84) {
          // A long fence / barrier — across or along the street.
          if (rng.chance(0.5)) walls.push({ x: ccx, z: ccz, w: clamp(rng.range(9, cellW - 2), 6, cellW - 2), d: 1.4 });
          else walls.push({ x: ccx, z: ccz, w: 1.4, d: clamp(rng.range(7, cellD - 2), 5, cellD - 2) });
        } else {
          // A wrecked car as cover/landmark.
          const along = rng.chance(0.5);
          walls.push({ x: ccx, z: ccz, w: along ? 4.6 : 2.4, d: along ? 2.4 : 4.6, car: true });
        }
      }
    }
    return walls;
  }

  /** Free a rebuildable group's children (geometry + materials + maps) so the
   * per-run dressing/backdrop don't leak across runs. */
  private clearGroup(g: THREE.Group): void {
    const sharedGlow = glowTexture();
    const free = (x: THREE.Material) => {
      const map = (x as THREE.Material & { map?: THREE.Texture | null }).map;
      if (map && map !== sharedGlow) map.dispose(); // per-instance maps (labels) freed; shared glow kept
      x.dispose();
    };
    g.traverse((o) => {
      // Free geometry (meshes) + materials/maps for BOTH meshes and sprites — the
      // beacon halos and survivor labels are Sprites, which the old mesh-only walk
      // leaked across runs.
      const m = o as THREE.Mesh & { material?: THREE.Material | THREE.Material[]; isMesh?: boolean; isSprite?: boolean };
      if (m.isMesh) m.geometry?.dispose?.();
      if (!m.isMesh && !m.isSprite) return;
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach(free);
      else if (mat) free(mat);
    });
    g.clear();
  }

  /** Per-run mood layer, scaled to the chosen district: rubble, barrels, debris,
   * blood, flickering emergency lights, graffiti, neon, fog, cables, glass. A
   * crowded district is dense and lit; the quiet outskirts are bare. */
  private buildDressing(cfg: DensityCfg): void {
    this.clearGroup(this.dressGroup);
    this.redLights = [];
    this.signs = [];
    const rng = this.ctx.rng;
    const G = this.dressGroup;
    const skin = ACT_SKINS[this.skinId];
    const dark = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 1, flatShading: true });
    const rust = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1, flatShading: true });
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e2316, roughness: 1, flatShading: true });
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0x3a0608, transparent: true, opacity: 0.5, depthWrite: false });

    const spot = (pad = 1.4) => {
      for (let i = 0; i < 24; i++) {
        const x = rng.range(AREA.minX + 2, AREA.maxX - 2);
        const z = rng.range(AREA.minZ + 2, AREA.maxZ - 2);
        if (!this.inWall(x, z, pad)) return { x, z };
      }
      return { x: 0, z: -20 };
    };

    for (let i = 0; i < cfg.rubble; i++) {
      const s = rng.range(0.4, 1.2);
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), dark);
      const p = spot();
      r.position.set(p.x, s * 0.3, p.z);
      r.scale.y = 0.5;
      r.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      G.add(r);
    }
    for (let i = 0; i < cfg.barrels; i++) {
      const p = spot();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), rust);
      barrel.position.set(p.x, 0.55, p.z);
      barrel.rotation.z = rng.chance(0.3) ? Math.PI / 2 : 0;
      barrel.castShadow = true;
      G.add(barrel);
    }
    for (let i = 0; i < cfg.planks; i++) {
      const p = spot();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(rng.range(0.8, 1.6), 0.1, 0.22), wood);
      plank.position.set(p.x, 0.06, p.z);
      plank.rotation.y = rng.range(0, Math.PI);
      G.add(plank);
    }
    for (let i = 0; i < cfg.blood; i++) {
      const p = spot();
      const blood = new THREE.Mesh(new THREE.CircleGeometry(rng.range(0.6, 1.4), 12), bloodMat);
      blood.rotation.x = -Math.PI / 2;
      blood.position.set(p.x, 0.03, p.z);
      G.add(blood);
    }
    for (let i = 0; i < cfg.redLights; i++) {
      const p = spot();
      const light = new THREE.PointLight(skin.accent, 0, 18, 2);
      light.position.set(p.x, 4, p.z);
      const glow = makeGlow(skin.accent, 2.6, 0.5);
      glow.position.set(p.x, 4, p.z);
      G.add(light, glow);
      this.redLights.push({ light, glow, phase: rng.range(0, 6) });
    }

    // Stencilled graffiti on the ground.
    const words = this.skinId === "outer"
      ? ["ROAD CLOSED", "TURN BACK", "FUEL", "DEAD ZONE", "HELP US"]
      : this.skinId === "flood"
        ? ["HIGH WATER", "PUMPS DEAD", "NO WAKE", "FLOOD LINE", "HELP US"]
        : ["SCREENING", "NO ENTRY", "GATE CHECK", "STAY IN LINE", "HAVEN"];
    for (let i = 0; i < cfg.graffiti; i++) {
      const p = spot(1.6);
      const tex = stencilTexture(rng.pick(words), i === 0 ? `#${skin.accent.toString(16).padStart(6, "0")}` : "#7a8a3a");
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), mat);
      tag.rotation.x = -Math.PI / 2;
      tag.rotation.z = rng.range(0, Math.PI);
      tag.position.set(p.x, 0.04, p.z);
      G.add(tag);
    }
    // Flickering neon hazard signs mounted high.
    for (let i = 0; i < cfg.neon; i++) {
      const p = spot(1.6);
      const color = i % 2 === 0 ? skin.accent : skin.guard;
      const mat = new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.9 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), mat);
      sign.position.set(p.x, 3.4, p.z);
      sign.rotation.y = rng.range(-0.5, 0.5);
      const glow = makeGlow(color, 4, 0.6);
      glow.position.copy(sign.position);
      G.add(sign, glow);
      this.signs.push({ mat, glow, phase: rng.range(0, 6) });
    }
    // Drifting low fog cards (a little, everywhere).
    const fogTex = makeGlow(0xffffff, 1).material.map;
    for (let i = 0; i < 6; i++) {
      const p = spot();
      const fmat = new THREE.MeshBasicMaterial({ map: fogTex, color: skin.wall, transparent: true, opacity: 0.14, depthWrite: false });
      const fog = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), fmat);
      fog.rotation.x = -Math.PI / 2;
      fog.position.set(p.x, rng.range(0.3, 1.0), p.z);
      G.add(fog);
    }
    // Glints of broken glass.
    for (let i = 0; i < cfg.glints; i++) {
      const p = spot();
      const glint = makeGlow(skin.accent, rng.range(0.2, 0.5), rng.range(0.2, 0.5));
      glint.position.set(p.x + rng.range(-2, 2), 0.06, p.z + rng.range(-2, 2));
      G.add(glint);
    }

    if (this.skinId === "outer") {
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.32, depthWrite: false, fog: false });
      for (const x of [-13, 13]) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 60), stripeMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(x, 0.056, -36);
        G.add(stripe);
      }
      const flareMat = new THREE.MeshBasicMaterial({ color: skin.accent, fog: false });
      for (const x of [-24, 0, 24]) {
        const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), flareMat);
        flare.rotation.z = Math.PI / 2;
        flare.position.set(x + rng.range(-3, 3), 0.12, rng.range(-58, -18));
        const glow = makeGlow(skin.accent, 4.2, 0.55);
        glow.position.copy(flare.position);
        glow.position.y = 0.5;
        G.add(flare, glow);
      }
      const barricadeMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 1, flatShading: true });
      for (const z of [-20, -47]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 0.35), barricadeMat);
        rail.position.set(rng.range(-30, 30), 0.95, z + rng.range(-4, 4));
        rail.rotation.y = rng.range(-0.4, 0.4);
        G.add(rail);
      }
      // Warm sodium-lamp pools washing the asphalt — emissive decals (not lights),
      // so they sell the warm industrial road without breaking the stealth dark.
      for (const [gx, gz] of [
        [-22, -28],
        [20, -42],
        [-6, -58],
        [12, -16],
      ] as [number, number][]) {
        const pool = makeGlow(0xff8a3a, 8, 0.26);
        pool.position.set(gx, 0.35, gz);
        G.add(pool);
      }
      // Roadside dressing: stacked tires, a toppled fuel tanker, oil slicks, and
      // leaning highway signs — a wrecked-highway sense of place.
      const tireMat = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 1, flatShading: true });
      for (let s = 0; s < 3; s++) {
        const p = spot(1.6);
        const stack = new THREE.Group();
        const h = 2 + Math.floor(rng.range(0, 3));
        for (let i = 0; i < h; i++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.22, 6, 10), tireMat);
          t.rotation.x = Math.PI / 2;
          t.position.y = 0.22 + i * 0.34;
          stack.add(t);
        }
        stack.position.set(p.x, 0, p.z);
        G.add(stack);
      }
      const tp = spot(3);
      const tanker = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 8, 14), new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.85, metalness: 0.3, flatShading: true }));
      tanker.rotation.z = Math.PI / 2;
      tanker.rotation.y = rng.range(0, 1);
      tanker.position.set(tp.x, 1.5, tp.z);
      tanker.castShadow = true;
      G.add(tanker);
      const oilMat = new THREE.MeshBasicMaterial({ color: 0x05060a, transparent: true, opacity: 0.55, depthWrite: false });
      for (let i = 0; i < 4; i++) {
        const p = spot();
        const oil = new THREE.Mesh(new THREE.CircleGeometry(rng.range(1.2, 2.6), 14), oilMat);
        oil.rotation.x = -Math.PI / 2;
        oil.position.set(p.x, 0.045, p.z);
        G.add(oil);
      }
      for (let i = 0; i < 2; i++) {
        const p = spot(1.4);
        const sPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), barricadeMat);
        sPost.position.set(p.x, 1.5, p.z);
        sPost.rotation.z = rng.range(-0.3, 0.3);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(2.0, 1.0),
          new THREE.MeshBasicMaterial({ map: stencilTexture(rng.pick(["DETOUR", "ROAD CLOSED", "REFINERY 4 MI"]), "#ffb24a"), transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide })
        );
        sign.position.set(p.x, 2.6, p.z);
        sign.rotation.y = rng.range(-0.5, 0.5);
        G.add(sPost, sign);
      }
    } else if (this.skinId === "flood") {
      // The whole district is under black water — a full-lot reflective sheet so
      // every step reads as wading the drowned blocks.
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(112, 88),
        new THREE.MeshStandardMaterial({
          color: skin.floor,
          transparent: true,
          opacity: 0.58,
          roughness: 0.1,
          metalness: 0.72,
          depthWrite: false,
        })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.05, -46);
      G.add(water);
      const rippleMat = new THREE.MeshBasicMaterial({ color: skin.accent, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      for (let i = 0; i < 16; i++) {
        const r = new THREE.Mesh(new THREE.RingGeometry(rng.range(0.8, 1.6), rng.range(2.0, 3.8), 20), rippleMat);
        r.rotation.x = -Math.PI / 2;
        r.position.set(rng.range(AREA.minX + 4, AREA.maxX - 4), 0.07, rng.range(AREA.minZ + 4, AREA.maxZ - 4));
        G.add(r);
      }
      const postMat = new THREE.MeshStandardMaterial({ color: 0x162126, roughness: 1, flatShading: true });
      for (let i = 0; i < 8; i++) {
        const p = spot();
        const h = rng.range(0.7, 1.8);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, h, 0.25), postMat);
        post.position.set(p.x, h / 2, p.z);
        post.rotation.z = rng.range(-0.25, 0.25);
        G.add(post);
      }
      const wreckMat = new THREE.MeshStandardMaterial({ color: 0x102b34, roughness: 0.8, metalness: 0.2, flatShading: true });
      for (let i = 0; i < 3; i++) {
        const p = spot(2);
        const wreck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 1.4), wreckMat);
        wreck.position.set(p.x, 0.2, p.z);
        wreck.rotation.y = rng.range(0, Math.PI);
        G.add(wreck);
      }
      // Floating debris, a half-sunk dinghy, and reed clusters break up the water.
      const driftMat = new THREE.MeshStandardMaterial({ color: 0x2a3a3e, roughness: 1, flatShading: true });
      for (let i = 0; i < 7; i++) {
        const p = spot();
        const plank = new THREE.Mesh(new THREE.BoxGeometry(rng.range(1.2, 2.4), 0.16, 0.4), driftMat);
        plank.position.set(p.x, 0.18, p.z);
        plank.rotation.y = rng.range(0, Math.PI);
        G.add(plank);
      }
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x224a44, roughness: 1, metalness: 0.2, flatShading: true });
      for (let i = 0; i < 4; i++) {
        const p = spot();
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 10), barrelMat);
        barrel.position.set(p.x, 0.25, p.z); // mostly submerged
        barrel.rotation.x = rng.range(-0.2, 0.2);
        G.add(barrel);
      }
      const dp = spot(2.5);
      const dinghy = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.7), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1, flatShading: true }));
      dinghy.position.set(dp.x, 0.35, dp.z);
      dinghy.rotation.set(0, rng.range(0, Math.PI), 0.12);
      G.add(dinghy);
      const reedMat = new THREE.MeshStandardMaterial({ color: 0x2a3a22, roughness: 1, flatShading: true });
      for (let c = 0; c < 6; c++) {
        const p = spot();
        for (let i = 0; i < 5; i++) {
          const rh = rng.range(1.0, 2.0);
          const reed = new THREE.Mesh(new THREE.BoxGeometry(0.06, rh, 0.06), reedMat);
          reed.position.set(p.x + rng.range(-0.7, 0.7), rh / 2, p.z + rng.range(-0.7, 0.7));
          reed.rotation.z = rng.range(-0.15, 0.15);
          G.add(reed);
        }
      }
    } else {
      const lineMat = new THREE.MeshBasicMaterial({ color: skin.accent, transparent: true, opacity: 0.42, depthWrite: false });
      for (const z of [-14, -36, -58]) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(72, 0.22), lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, 0.055, z);
        G.add(line);
      }
      const gateMat = new THREE.MeshStandardMaterial({ color: 0x2d3740, roughness: 0.9, metalness: 0.2, flatShading: true });
      for (const x of [-18, 18]) {
        const booth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 2.6), gateMat);
        booth.position.set(x, 1.2, -18);
        G.add(booth);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 0.18), gateMat);
        arm.position.set(x > 0 ? x - 5 : x + 5, 1.45, -18);
        arm.rotation.y = x > 0 ? 0.25 : -0.25;
        G.add(arm);
      }
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x303840, roughness: 1, flatShading: true });
      for (const x of [-34, 34]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 6, 6), poleMat);
        pole.position.set(x, 3, -36);
        const lamp = new THREE.PointLight(skin.accent, 5, 30, 2);
        lamp.position.set(x, 6.2, -34);
        const glow = makeGlow(skin.accent, 5.2, 0.45);
        glow.position.copy(lamp.position);
        G.add(pole, lamp, glow);
      }
      // Chain-link perimeter fence hemming the screening yard — the guarded read.
      const fenceMat = new THREE.MeshStandardMaterial({ color: 0x39434b, roughness: 1, flatShading: true });
      const chainMat = new THREE.MeshBasicMaterial({ color: 0x8fb6c8, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, fog: true });
      for (const side of [-1, 1] as const) {
        const fence = new THREE.Group();
        const span = AREA.maxZ - AREA.minZ;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, 3.0), chainMat);
        mesh.rotation.y = Math.PI / 2;
        mesh.position.y = 1.6;
        fence.add(mesh);
        for (let p = 0; p <= 6; p++) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), fenceMat);
          post.position.set(0, 1.6, -span / 2 + (p / 6) * span);
          fence.add(post);
        }
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, span), fenceMat);
        topBar.position.y = 3.0;
        fence.add(topBar);
        fence.position.set(side * (AREA.maxX - 2), 0, (AREA.minZ + AREA.maxZ) / 2);
        G.add(fence);
      }
      // Cold floodlight pools washing the screening yard — emissive decals (not
      // lights), the sterile counterpart to the Outer road's warm sodium pools.
      for (const [gx, gz] of [
        [-20, -26],
        [20, -40],
        [-6, -56],
        [12, -16],
      ] as [number, number][]) {
        const pool = makeGlow(0x9fd6ff, 9, 0.3);
        pool.position.set(gx, 0.35, gz);
        G.add(pool);
      }
      // A fortified yard: sandbag bunkers, stacked supply pallets, razor wire on
      // the barrier line, and a watchtower silhouette at the perimeter.
      const sandMat = new THREE.MeshStandardMaterial({ color: 0x4a4632, roughness: 1, flatShading: true });
      for (let b = 0; b < 3; b++) {
        const p = spot(1.6);
        const bunker = new THREE.Group();
        for (let r = 0; r < 2; r++)
          for (let i = 0; i < 4; i++) {
            const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), sandMat);
            bag.position.set((i - 1.5) * 0.72, 0.18 + r * 0.34, 0);
            bunker.add(bag);
          }
        bunker.position.set(p.x, 0, p.z);
        bunker.rotation.y = rng.range(0, Math.PI);
        G.add(bunker);
      }
      const palletMat = new THREE.MeshStandardMaterial({ color: 0x5a6470, roughness: 1, flatShading: true });
      for (let i = 0; i < 4; i++) {
        const p = spot(1.4);
        const n = 1 + Math.floor(rng.range(0, 3));
        for (let k = 0; k < n; k++) {
          const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), palletMat);
          crate.position.set(p.x, 0.45 + k * 0.92, p.z);
          crate.castShadow = true;
          G.add(crate);
        }
      }
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x9fb0bc, fog: false });
      for (const wx of [-16, -5.5, 5.5, 16]) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 5, 10), wireMat);
        coil.position.set(wx, 1.5, -11);
        coil.rotation.x = Math.PI / 2;
        G.add(coil);
      }
      const towerMat = new THREE.MeshStandardMaterial({ color: 0x2a323a, roughness: 1, flatShading: true });
      const tower = new THREE.Group();
      for (const lx of [-1.4, 1.4])
        for (const lz of [-1.4, 1.4]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9, 0.3), towerMat);
          leg.position.set(lx, 4.5, lz);
          tower.add(leg);
        }
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 4), towerMat);
      cabin.position.y = 9.5;
      tower.add(cabin);
      const towerBeacon = makeGlow(0xff5a40, 2.2, 0.75);
      towerBeacon.position.set(0, 10.6, 0);
      tower.add(towerBeacon);
      tower.position.set(rng.chance(0.5) ? -46 : 46, 0, -54);
      G.add(tower);
    }
  }

  /** Per-run backdrop silhouettes: a ring of tall buildings hemming in a crowded
   * district, or scattered dead scrub trees out in the open outskirts. */
  private buildBackdrop(cfg: DensityCfg): void {
    this.clearGroup(this.backdropGroup);
    const rng = this.ctx.rng;
    const B = this.backdropGroup;
    const skin = ACT_SKINS[this.skinId];

    // Buildings: tall dark blocks just outside the play area (urban skyline).
    if (cfg.buildings > 0) {
      const near = new THREE.MeshStandardMaterial({ color: skin.backdrop, roughness: 1, flatShading: true });
      const winMat = new THREE.MeshBasicMaterial({ color: skin.window, fog: true });
      for (let i = 0; i < cfg.buildings; i++) {
        const edge = i % 4; // 0 left,1 right,2 back,3 back
        const h = rng.range(10, 26);
        const w = rng.range(6, 12);
        let x: number, z: number;
        if (edge === 0) { x = AREA.minX - rng.range(3, 16); z = rng.range(AREA.minZ - 6, AREA.maxZ); }
        else if (edge === 1) { x = AREA.maxX + rng.range(3, 16); z = rng.range(AREA.minZ - 6, AREA.maxZ); }
        else { x = rng.range(AREA.minX, AREA.maxX); z = AREA.minZ - rng.range(6, 24); }
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), near);
        b.position.set(x, h / 2, z);
        B.add(b);
        // a scatter of lit windows on the inward face
        if (rng.chance(0.7)) {
          const cols = Math.max(2, Math.floor(w / 3));
          const rowsW = Math.max(3, Math.floor(h / 5));
          for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rowsW; r++) {
              if (!rng.chance(0.18)) continue;
              const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), winMat);
              win.position.set(x + (c / (cols - 1) - 0.5) * (w - 1.5), 2 + (r / (rowsW - 1)) * (h - 4), z + (z < (AREA.minZ + AREA.maxZ) / 2 ? 3.1 : -3.1));
              B.add(win);
            }
          }
        }
      }
    }

    // Dead scrub trees scattered across the open outskirts.
    if (cfg.trees > 0) {
      const bark = new THREE.MeshStandardMaterial({ color: 0x1a160f, roughness: 1, flatShading: true });
      for (let i = 0; i < cfg.trees; i++) {
        let p = { x: 0, z: -20 };
        for (let k = 0; k < 16; k++) {
          const x = rng.range(AREA.minX + 2, AREA.maxX - 2);
          const z = rng.range(AREA.minZ + 2, AREA.maxZ - 2);
          if (!this.inWall(x, z, 1.6)) { p = { x, z }; break; }
        }
        const tree = new THREE.Group();
        const hgt = rng.range(2.4, 4.2);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, hgt, 6), bark);
        trunk.position.y = hgt / 2;
        trunk.castShadow = true;
        tree.add(trunk);
        const branches = 3 + Math.floor(rng.range(0, 3));
        for (let b = 0; b < branches; b++) {
          const bl = rng.range(0.7, 1.6);
          const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, bl, 5), bark);
          branch.position.y = hgt * rng.range(0.5, 0.95);
          branch.rotation.z = rng.range(-1.2, 1.2);
          branch.rotation.y = rng.range(0, Math.PI);
          branch.translateY(bl * 0.4);
          tree.add(branch);
        }
        tree.position.set(p.x, 0, p.z);
        tree.rotation.y = rng.range(0, Math.PI);
        B.add(tree);
      }
    }
  }

  /** Hiding alcoves (dumpsters you can tuck behind to break a chase) + the
   * extraction point that opens once the supplies are secured. */
  private buildHideAndExtract(): void {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a3a2e, roughness: 0.9, flatShading: true });
    const spots: [number, number][] = [
      [-46, -22],
      [44, -34],
      [-8, -48],
      [36, -70],
      [-40, -80],
      [14, -30],
    ];
    for (const [x, z] of spots) {
      this.hideZones.push({ x, z });
      const bin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 1.4), metal);
      bin.position.set(x, 0.75, z);
      bin.castShadow = true;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 1.5), metal);
      lid.position.set(x, 1.6, z);
      lid.rotation.z = 0.12;
      // a soft shadow-glow so the dark alcove reads as a safe pocket
      const g = makeGlow(0x2a6a4a, 3.0, 0.18);
      g.position.set(x, 0.4, z);
      this.group.add(bin, lid, g);
    }

    // Extraction beacon — hidden until the run goal is met.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.4, 28),
      new THREE.MeshBasicMaterial({ color: 0x6fffa8, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, fog: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 9, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x6fffa8, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    pillar.position.y = 4.5;
    this.extractMarker.add(ring, pillar, makeGlow(0x6fffa8, 4, 0.6));
    this.extractMarker.position.set(this.extractZone.x, 0, this.extractZone.z);
    this.extractMarker.visible = false;
    this.group.add(this.extractMarker);
  }

  private buildBoundary(): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3a6a8a,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const w = AREA.maxX - AREA.minX;
    const d = AREA.maxZ - AREA.minZ;
    const cx = (AREA.minX + AREA.maxX) / 2;
    const cz = (AREA.minZ + AREA.maxZ) / 2;
    const edges: [number, number, number, number][] = [
      [cx, AREA.minZ, w, 0.15],
      [cx, AREA.maxZ, w, 0.15],
      [AREA.minX, cz, 0.15, d],
      [AREA.maxX, cz, 0.15, d],
    ];
    for (const [ex, ez, ew, ed] of edges) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.06, ed), mat);
      bar.position.set(ex, 0.04, ez);
      this.group.add(bar);
    }
  }

  private inWall(x: number, z: number, pad = 1): boolean {
    for (const w of this.walls) {
      if (x > w.x - w.w / 2 - pad && x < w.x + w.w / 2 + pad && z > w.z - w.d / 2 - pad && z < w.z + w.d / 2 + pad)
        return true;
    }
    return false;
  }

  private freeSpot(minZ: number, maxZ: number): { x: number; z: number } {
    for (let i = 0; i < 30; i++) {
      const x = this.ctx.rng.range(AREA.minX + 3, AREA.maxX - 3);
      const z = this.ctx.rng.range(minZ, maxZ);
      if (!this.inWall(x, z, 1.2)) return { x, z };
    }
    return { x: this.ctx.rng.range(AREA.minX + 3, AREA.maxX - 3), z: this.ctx.rng.range(minZ, maxZ) };
  }

  private makeCrate(x: number, z: number, gold: boolean, kit: boolean, weapon?: string): Crate {
    const g = new THREE.Group();
    const skin = ACT_SKINS[this.skinId];
    const WEAPON_COL = 0xff8a2a; // a hot orange "armory case" read
    const beacon = weapon ? WEAPON_COL : kit ? skin.kit : gold ? skin.gold : skin.accent;
    const tint = weapon ? 0x2a2622 : kit ? skin.kit : gold ? skin.gold : skin.crate;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(weapon ? 1.4 : 0.95, weapon ? 0.5 : 0.72, 0.72),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, emissive: new THREE.Color(beacon).multiplyScalar(weapon ? 0.18 : 0.28), flatShading: true })
    );
    box.position.y = 0.4;
    box.castShadow = true;
    g.add(box);

    if (weapon) {
      // Weapon case — a long hard-shell case with a stenciled rifle silhouette on
      // top and a hot beacon, so a real find reads instantly across the dark lot.
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.12, 0.76), new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 0.8, flatShading: true }));
      lid.position.y = 0.68;
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: WEAPON_COL, emissive: new THREE.Color(WEAPON_COL), emissiveIntensity: 0.8 }));
      barrel.position.set(0, 0.76, 0);
      g.add(lid, barrel);
    } else if (kit) {
      // Repair kit — a white maintenance cross
      const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0x88c0ff), emissiveIntensity: 0.9 });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.16), cm);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.5), cm);
      c1.position.y = 0.82;
      c2.position.y = 0.82;
      g.add(c1, c2);
    } else {
      // Ammo crate — brass rounds standing on top
      const brass = new THREE.MeshStandardMaterial({ color: gold ? skin.gold : 0xdca94a, roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(gold ? skin.gold : 0x3a2a08).multiplyScalar(0.28) });
      const n = gold ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 8), brass);
        b.position.set((i / (n - 1) - 0.5) * 0.5, 0.92, 0);
        g.add(b);
      }
    }

    const haloBase = weapon ? 3.0 : gold || kit ? 2.2 : 1.7;
    const halo = makeGlow(beacon, haloBase, weapon ? 0.7 : 0.6);
    halo.position.y = 0.55;
    g.add(halo);
    // A slim beacon pillar rising from the crate — a real find glints in the dark
    // when your light sweeps near. Faint, additive, fog-faded and wall-occluded, so
    // it rewards getting close instead of giving the whole lot away.
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 4.4, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: beacon, transparent: true, opacity: weapon ? 0.3 : gold || kit ? 0.2 : 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true })
    );
    pillar.position.y = 2.5;
    g.add(pillar);
    g.position.set(x, 0, z);
    this.group.add(g);
    return { group: g, x, z, got: false, gold, kit, weapon, halo, haloBase };
  }

  private makeSurvivor(x: number, z: number): Survivor {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xa98a63, roughness: 1, flatShading: true });
    const rags = new THREE.MeshStandardMaterial({ color: 0x6a5436, roughness: 1, flatShading: true });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), rags);
    torso.position.y = 0.9;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.55;
    g.add(torso, head, makeGlow(0x9dffd0, 2.6, 0.55));
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.22, 7, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })
    );
    beam.position.y = 3.6;
    const label = makeLabel("SURVIVOR", "#9dffd0");
    label.position.y = 2.5;
    g.add(beam, label);
    g.position.set(x, 0, z);
    this.group.add(g);
    return { group: g, x, z, taken: false };
  }

  private makeGuard(type: GType, center?: { x: number; z: number }): Guard {
    const g = new THREE.Group();
    const cfg = GUARD_CFG[type];
    const skin = ACT_SKINS[this.skinId];
    const flesh = new THREE.MeshStandardMaterial({ color: cfg.flesh, roughness: 1, flatShading: true });
    const coat = new THREE.MeshStandardMaterial({ color: cfg.coat, roughness: 1, flatShading: true });
    // Body parts go in a scaled sub-group so the sight cone stays full-size.
    const body = new THREE.Group();
    // Runner is leaner + more upright; shambler/spitter are hunched and bulky.
    const lean = type === "runner" ? 0.12 : 0.28;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(type === "runner" ? 0.5 : 0.66, type === "runner" ? 1.15 : 1.0, 0.4), coat);
    torso.position.set(0, type === "runner" ? 1.05 : 0.95, 0);
    torso.rotation.x = lean;
    torso.castShadow = true;
    const hump = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.34), coat);
    hump.position.set(0, 1.2, -0.16);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), flesh);
    head.position.set(0, type === "runner" ? 1.62 : 1.5, type === "runner" ? 0.1 : 0.26);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.26), flesh);
    jaw.position.set(0, 1.36, 0.42);
    jaw.rotation.x = 0.4;
    body.add(torso, hump, head, jaw);
    // Spitter: a bulging acid sac on the belly.
    if (type === "spitter") {
      const sac = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x6a8a3a, roughness: 1, flatShading: true, emissive: new THREE.Color(0x2a4a12), emissiveIntensity: 0.8 })
      );
      sac.position.set(0, 0.82, 0.32);
      body.add(sac);
    }
    // Brute: hulking shoulders + a slab of scrap armor across the chest.
    if (type === "brute") {
      for (const sx of [-0.5, 0.5]) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.52), coat);
        pad.position.set(sx, 1.3, 0);
        body.add(pad);
      }
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.5, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8, metalness: 0.3, flatShading: true })
      );
      plate.position.set(0, 0.96, 0.3);
      body.add(plate);
    }
    // Screamer: a gaping, glowing maw thrown wide.
    if (type === "screamer") {
      const maw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.18), new THREE.MeshBasicMaterial({ color: 0xff5a8a, fog: false }));
      maw.position.set(0, 1.4, 0.5);
      body.add(maw);
      jaw.position.set(0, 1.24, 0.52);
      jaw.rotation.x = 0.85;
    }
    for (const ax of [-0.42, 0.42]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, type === "runner" ? 0.78 : 0.9, 0.13), flesh);
      arm.position.set(ax, 0.85, 0.24);
      arm.rotation.x = type === "runner" ? 0.25 : 0.5;
      body.add(arm);
    }
    for (const lx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, type === "runner" ? 0.95 : 0.8, 0.18), coat);
      leg.position.set(lx, type === "runner" ? 0.48 : 0.4, 0);
      body.add(leg);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: skin.guard, fog: false });
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat);
      eye.position.set(ex, type === "runner" ? 1.65 : 1.53, type === "runner" ? 0.3 : 0.46);
      body.add(eye);
    }
    const eyeGlow = makeGlow(skin.guard, 0.9, 0.5);
    eyeGlow.position.set(0, 1.52, 0.5);
    body.add(eyeGlow);
    body.scale.setScalar(cfg.scale);
    g.add(body);
    const coneMat = new THREE.MeshBasicMaterial({
      color: skin.guard,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    // Cloned (not shared) so the per-run guard disposal can free it safely.
    const cone = new THREE.Mesh(this.coneGeo.clone(), coneMat);
    cone.position.y = 0.06;
    g.add(cone);
    this.group.add(g);
    const patrol: { x: number; z: number }[] = [];
    for (let i = 0; i < 3; i++) {
      if (center) {
        let pt = { x: 0, z: 0 };
        for (let tries = 0; tries < 12; tries++) {
          pt = {
            x: clamp(center.x + this.ctx.rng.range(-7, 7), AREA.minX + 2, AREA.maxX - 2),
            z: clamp(center.z + this.ctx.rng.range(-7, 7), AREA.minZ + 2, AREA.maxZ - 2),
          };
          if (!this.inWall(pt.x, pt.z, 1.2)) break;
        }
        patrol.push(pt);
      } else {
        patrol.push(this.freeSpot(AREA.minZ + 2, AREA.maxZ - 8));
      }
    }
    // Face along the patrol from the start (not toward the player's spawn).
    const f0 = Math.atan2(patrol[1].x - patrol[0].x, patrol[1].z - patrol[0].z);
    return {
      group: g, cone, coneMat, eyeMat, type, x: patrol[0].x, z: patrol[0].z, facing: f0,
      patrol, pIdx: 1, state: "patrol", alertT: 0, speed: cfg.speed, chase: cfg.chase,
      vision: cfg.vision ?? 1, scream: cfg.scream ?? false,
      spitCd: this.ctx.rng.range(1.2, 2.6), stuckT: 0, px: patrol[0].x, pz: patrol[0].z,
      invX: 0, invZ: 0, dead: false,
    };
  }

  start(opts?: { density?: Density; weaponInCrate?: string }): void {
    const density = opts?.density ?? "med";
    this.collectedWeapons = [];
    const curLevel = levelInfo(this.ctx.run.night);
    this.skinId = curLevel.supplyTheme;
    const skin = ACT_SKINS[this.skinId];
    const dcfg = themedDensity(DENSITY[density], skin, density);
    this.envName = dcfg.name;
    this.envWall = dcfg.wall;
    this.envCap = dcfg.cap;
    this.envFog = dcfg.fog;

    this.active = true;
    this.done = false;
    this.got = 0;
    this.timeLeft = DURATION;
    this.total = dcfg.crates;
    this.stamina = 1;
    this.exhausted = false;
    this.spotted = false;
    this.ax = 0;
    this.az = -7;
    this.group.visible = true;
    this.groanT = 4;
    this.extractOpen = false;
    this.extractMarker.visible = false;
    this.lightOn = true;
    this.promptText = "";
    this.startGrace = 1.6; // brief grace so no guard can spot you the instant you spawn
    this.ctx.world.setDawn(0.08); // dark + moody, but still navigable
    // Thicker fog + a dimmer, tighter flashlight = scarier.
    this.fogPrev = this.ctx.stage.fog.density;
    this.ctx.stage.fog.density = this.envFog;
    this.light.distance = 23;
    this.light.intensity = this.lightDefault;
    // Tint the watch-searchlight per district as a FLOODLIGHT hue (never red —
    // red is the "spotted" alarm color; haven's guard tint is red, so don't reuse
    // it here): warm sodium on the road, cyan over the flood, cold white at Haven.
    this.sweep.color.setHex(this.skinId === "flood" ? 0x9fe4ff : this.skinId === "haven" ? 0xdfeaff : 0xffc890);

    // Apply the environment skin (floor + lane lines), then pick a layout that
    // matches the district and (re)build its walls, dressing, and backdrop.
    this.floorMat.color.setHex(dcfg.floor);
    this.laneGroup.visible = dcfg.lanes;
    // A fresh procedural block layout each run — larger and more varied than the
    // old hand-authored lots, with streets between the blocks for stealth routing.
    this.walls = this.generateWalls(dcfg);
    this.buildWalls();
    this.buildDressing(dcfg);
    this.buildBackdrop(dcfg);
    this.clearSpits();

    // Crates: count + gold-cache ratio scale with the population you picked.
    // Dispose the prior run's crate meshes (not just remove) to avoid a leak.
    for (const c of this.crates) {
      this.clearGroup(c.group);
      this.group.remove(c.group);
    }
    this.crates = [];
    for (let i = 0; i < dcfg.crates; i++) {
      const s = this.freeSpot(AREA.minZ + 3, AREA.maxZ - 10);
      this.crates.push(this.makeCrate(s.x, s.z, i < dcfg.gold, false));
    }
    for (let i = 0; i < dcfg.kits; i++) {
      const s = this.freeSpot(AREA.minZ + 3, AREA.maxZ - 14);
      this.crates.push(this.makeCrate(s.x, s.z, false, true));
    }
    // A weapon-case crate only when this run actually offers one (decided by
    // main.ts) — a new gun is earned by FINDING it, not handed out every run.
    // Placed deep in the lot so it's a real detour past the guards.
    if (opts?.weaponInCrate) {
      const s = this.freeSpot(AREA.minZ + 3, AREA.maxZ - 22);
      this.crates.push(this.makeCrate(s.x, s.z, false, false, opts.weaponInCrate));
    }

    const night = this.ctx.run.night;
    const pressure = curLevel.act * 1.2 + curLevel.levelInAct;

    // Survivors are rare to find now (allies should accrue slowly): never on the
    // first night, never once the squad is full, and only sometimes otherwise.
    if (this.survivor) {
      this.clearGroup(this.survivor.group);
      this.group.remove(this.survivor.group);
      this.survivor = null;
    }
    let sv: { x: number; z: number } | null = null;
    // Survivors are rare and tied to the district you risk: a crowded block has
    // more people to pull out (and far more between you and them).
    const svChance = 0.32 + (density === "high" ? 0.12 : density === "low" ? -0.06 : 0);
    if (night >= 2 && this.ctx.run.companions.length < 4 && this.ctx.rng.chance(svChance)) {
      sv = this.freeSpot(AREA.minZ + 4, AREA.minZ + 24);
      this.survivor = this.makeSurvivor(sv.x, sv.z);
    }

    // Guard mix scales with the night AND the chosen population: more guards, and
    // a richer roster — runners/spitters climb, brutes and screamers start showing
    // up on the tougher runs — so a crowded district is a real gamble.
    for (const g of this.guards) {
      this.clearGroup(g.group); // dispose body geo/mats (cone geo is cloned per guard, safe)
      this.group.remove(g.group);
    }
    this.guards = [];
    const patrols = Math.max(3, Math.round((5 + pressure) * dcfg.guardMul));
    const types: GType[] = ["shambler", "runner", "spitter", "brute", "screamer"];
    const weights = [
      5,
      2 + pressure * 0.5,
      1 + pressure * 0.45,
      Math.max(0, pressure - 2) * 0.4,
      Math.max(0, pressure - 1.5) * 0.35,
    ];
    const rollType = (): GType => this.ctx.rng.weighted(types, weights) as GType;
    for (let i = 0; i < patrols; i++) this.guards.push(this.makeGuard(rollType()));
    // A cluster of defenders only when there's actually a survivor to guard.
    if (sv) {
      const defenders: GType[] = night >= 4 ? ["runner", "spitter", "brute"] : night >= 2 ? ["shambler", "runner", "spitter"] : ["shambler", "shambler", "runner"];
      for (const t of defenders) this.guards.push(this.makeGuard(t, sv));
    }
    for (const g of this.guards) g.group.position.set(g.x, 0, g.z);

    this.ctx.cam.mode = "topdown";
    this.ctx.cam.target.set(this.ax, 0, this.az);
    this.ctx.cam.snap();
  }

  update(dt: number): void {
    if (!this.active || this.done) return;
    this.t += dt;
    this.timeLeft -= dt;
    if (this.startGrace > 0) this.startGrace -= dt;
    this.promptText = "";

    // Flashlight toggle (F) — off = harder to be seen, but you see far less.
    if (this.ctx.input.pressed("KeyF")) {
      this.lightOn = !this.lightOn;
      this.light.intensity = this.lightOn ? this.lightDefault : 3.5;
      this.ctx.events.emit("SFX", { id: "ui_click" });
    }

    // Move (sneak, or sprint while stamina holds). Once stamina bottoms out the
    // legs lock until it recovers past a clear threshold — so "out of breath"
    // actually stops you sprinting instead of stutter-sprinting on every tick.
    const a = this.ctx.input.axis(this.tmp);
    const moving = a.x !== 0 || a.y !== 0;
    if (this.stamina <= 0.001) this.exhausted = true;
    else if (this.stamina > 0.35) this.exhausted = false;
    const sprint = this.ctx.input.down("ShiftLeft") && !this.exhausted && moving;
    this.stamina = sprint ? Math.max(0, this.stamina - dt * 0.72) : Math.min(1, this.stamina + dt * 0.26);
    const sp = sprint ? SPRINT : SNEAK;
    let nx = this.ax + a.x * sp * dt;
    let nz = this.az + a.y * sp * dt;
    nx = clamp(nx, AREA.minX, AREA.maxX);
    nz = clamp(nz, AREA.minZ, AREA.maxZ);
    for (const w of this.walls) [nx, nz] = pushOutAABB(nx, nz, AV_R, w);
    this.ax = nx;
    this.az = nz;
    this.avatar.position.set(this.ax, 0, this.az);
    if (moving) {
      this.avatar.rotation.y = Math.atan2(a.x, a.y);
    }

    // Hidden when tucked into an alcove — guards can't see you there.
    this.hidden = false;
    for (const h of this.hideZones) {
      if ((h.x - this.ax) ** 2 + (h.z - this.az) ** 2 < HIDE_R * HIDE_R) {
        this.hidden = true;
        break;
      }
    }
    if (this.hidden) this.promptText = "HIDDEN";

    // Sprinting is loud: nearby patrolling guards investigate the sound.
    if (sprint && moving) {
      for (const g of this.guards) {
        if (g.dead || g.state === "chase") continue;
        if ((g.x - this.ax) ** 2 + (g.z - this.az) ** 2 < NOISE_SPRINT * NOISE_SPRINT) {
          // Pop a "?" the first time a guard turns to the noise — a visible "you
          // were heard" tell that teaches sprinting is loud.
          if (g.state !== "investigate") this.ctx.floaters.spawn(g.x, 2.4, g.z, "?", "crit");
          g.state = "investigate";
          g.invX = this.ax;
          g.invZ = this.az;
          g.alertT = 3;
        }
      }
    }

    // Guards
    let anyChase = false;
    for (const g of this.guards) {
      this.updateGuard(g, dt);
      if (this.done) return; // a catch ended the run mid-loop — stop here
    }
    this.updateSpits(dt);
    if (this.done) return; // a spit-hit ended the run mid-loop
    for (const g of this.guards) if (!g.dead && g.state === "chase") anyChase = true;
    if (anyChase && !this.spotted) {
      this.spotted = true;
      this.ctx.events.emit("SFX", { id: "scream" });
      this.ctx.stage.punch(0.3);
      this.ctx.cam.addTrauma(0.3);
    } else if (!anyChase) {
      this.spotted = false;
    }
    // Debug: hold the spotted alarm + re-emit the "!"/"?" telegraphs so a capture
    // can frame the in-run feedback layer (the alarm vignette is driven by this).
    if (this.debugAlert) {
      this.spotted = true;
      this.dbgTeleT -= dt;
      if (this.dbgTeleT <= 0) {
        this.dbgTeleT = 0.5;
        const a = this.guards[0];
        if (a) this.ctx.floaters.spawn(a.x, 2.4, a.z, "!", "warn");
        const b = this.guards[1];
        if (b) this.ctx.floaters.spawn(b.x, 2.4, b.z, "?", "crit");
      }
    }

    // Ambient dread — distant groans
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 3 + this.ctx.rng.next() * 5;
      this.ctx.events.emit("SFX", { id: "groan", pan: this.ctx.rng.range(-1, 1) });
    }
    // Pulsing red emergency lights
    for (const r of this.redLights) {
      const n = 0.5 + 0.5 * Math.sin(this.t * 3 + r.phase);
      r.light.intensity = 1 + n * 4;
      r.glow.material.opacity = 0.25 + n * 0.45;
    }
    // Failing neon signs — a stuttering flicker.
    for (const s of this.signs) {
      const f = Math.sin(this.t * 17 + s.phase) * Math.sin(this.t * 4.3 + s.phase * 2);
      const on = f > -0.4;
      const lvl = on ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 40)) : 0.05;
      s.mat.opacity = lvl;
      s.glow.material.opacity = lvl * 0.7;
    }
    // Sweeping watch-searchlight — a slow lateral rake across the lot. Animating
    // the target.position re-aims the SpotLight automatically; the glow trails the
    // pool where the beam lands.
    {
      const sx = Math.sin(this.t * 0.42) * 40;
      const sz = -44 + Math.cos(this.t * 0.31) * 12;
      this.sweep.position.set(sx * 0.45, 28, -26);
      this.sweep.target.position.set(sx, 0, sz);
    }
    // Time pressure — heartbeat in the final stretch
    if (this.timeLeft < 12 && Math.floor(this.timeLeft) !== Math.floor(this.timeLeft + dt)) {
      this.ctx.events.emit("SFX", { id: "heartbeat" });
    }

    // Grab crates (supply, gold, or repair-kit)
    for (const c of this.crates) {
      if (c.got) continue;
      c.group.rotation.y += dt * 0.5;
      // Gentle beacon breathing — the loot glints in the dark.
      const pulse = c.haloBase * (0.84 + 0.16 * Math.sin(this.t * 2.4 + c.x));
      c.halo.scale.set(pulse, pulse, 1);
      const dx = c.x - this.ax;
      const dz = c.z - this.az;
      if (dx * dx + dz * dz >= 2.4) continue;
      c.got = true;
      c.group.visible = false;
      if (c.weapon) {
        // A real find — recorded now, granted (or offered as a dusk swap) at day's
        // end. Doesn't count toward the supply rating; it's a bonus objective.
        this.collectedWeapons.push(c.weapon);
        this.ctx.floaters.spawn(c.x, 1.8, c.z, "⚔ WEAPON RECOVERED", "crit");
        this.ctx.fx.burst(c.x, 1.0, c.z, 24, 0xff8a2a, { speed: 9, up: 7, life: 0.7, size: 8 });
        this.ctx.events.emit("SFX", { id: "meter_full" });
        continue;
      }
      if (c.kit) {
        const skin = ACT_SKINS[this.skinId];
        this.ctx.run.repairKits++;
        this.ctx.floaters.spawn(c.x, 1.6, c.z, "+REPAIR KIT", "crit");
        this.ctx.fx.burst(c.x, 1.0, c.z, 18, skin.kit, { speed: 8, up: 6, life: 0.6, size: 7 });
        this.ctx.events.emit("SFX", { id: "pickup" });
        continue;
      }
      const skin = ACT_SKINS[this.skinId];
      this.got++;
      if (c.gold) {
        // (cratesGrabbed is tallied once from `got` in finish() — don't add here
        // too, or gold crates get double-counted on the ending screen.)
        this.ctx.run.addAmmo(80); // ammo cache
        this.ctx.floaters.spawn(c.x, 1.6, c.z, "+AMMO CACHE", "crit");
        this.ctx.fx.burst(c.x, 1.0, c.z, 22, skin.gold, { speed: 8, up: 6, life: 0.6, size: 7 });
      } else {
        this.ctx.run.addAmmo(35);
        this.ctx.floaters.spawn(c.x, 1.5, c.z, "+AMMO", "heal");
        this.ctx.fx.burst(c.x, 0.9, c.z, 12, skin.accent, { speed: 6, up: 5, life: 0.5 });
      }
      this.ctx.events.emit("CRATE_GRABBED", { got: this.got, total: this.total });
      this.ctx.events.emit("SFX", { id: "pickup" });
    }

    // Rescue the survivor (recruit a new ally). Surface a hint unless something
    // more urgent (hiding / the open exit) already owns the prompt.
    if (this.survivor && !this.survivor.taken) {
      if (!this.promptText && !this.extractOpen) this.promptText = "⚑ RESCUE THE SURVIVOR — follow the green beacon";
      const dx = this.survivor.x - this.ax;
      const dz = this.survivor.z - this.az;
      if (dx * dx + dz * dz < 3.0) {
        this.survivor.taken = true;
        this.survivor.group.visible = false;
        const name = SURVIVOR_NAMES.find((n) => !this.ctx.run.companions.includes(n));
        if (name && this.ctx.run.companions.length < 4) {
          const trait = this.ctx.run.recruit(name);
          const t = TRAITS[trait];
          this.ctx.floaters.spawn(this.survivor.x, 2.2, this.survivor.z, `RESCUED ${name} · ${t.label.toUpperCase()}`, "crit");
          this.ctx.events.emit("NOTICE", { text: `${name} joins you`, sub: `${t.label} — "${t.recruitLine}"` });
        } else {
          this.ctx.floaters.spawn(this.survivor.x, 2, this.survivor.z, "RESCUED!", "heal");
        }
        this.ctx.fx.burst(this.survivor.x, 1.2, this.survivor.z, 24, 0x7dffb0, { speed: 9, up: 7, life: 0.7, size: 8 });
        this.ctx.events.emit("SFX", { id: "meter_full" });
      }
    }

    // Extraction beat: once the supplies are secured an exit opens near the road
    // — reach it before the clock for a clean-getaway bonus.
    if (!this.extractOpen && this.got >= this.total) {
      this.extractOpen = true;
      this.extractMarker.visible = true;
      this.ctx.floaters.spawn(this.extractZone.x, 2.6, this.extractZone.z, "SUPPLIES SECURED — REACH THE EXIT", "crit");
      this.ctx.events.emit("SFX", { id: "meter_full" });
    }
    if (this.extractOpen) {
      this.extractMarker.rotation.y += dt * 1.5;
      this.promptText = "↑ REACH THE EXIT";
      const edx = this.extractZone.x - this.ax;
      const edz = this.extractZone.z - this.az;
      if (edx * edx + edz * edz < 6.25) {
        this.ctx.run.addAmmo(60);
        this.ctx.floaters.spawn(this.ax, 2.4, this.az, "CLEAN EXTRACTION  +AMMO", "crit");
        this.finish();
        return;
      }
    }

    this.ctx.cam.target.set(this.ax, 0, this.az);
    if (this.timeLeft <= 0) this.finish();
  }

  /** Caught by a chaser — the run ends immediately. */
  private onCaught(): void {
    if (this.debugAlert) return; // held debug-alert frame never ends the run
    this.ctx.floaters.spawn(this.ax, 2.2, this.az, "CAUGHT!", "warn");
    this.ctx.events.emit("SFX", { id: "player_hurt" });
    this.ctx.cam.addTrauma(0.5);
    this.ctx.stage.punch(0.45);
    this.finish();
  }

  private losBlocked(ax: number, az: number, bx: number, bz: number): boolean {
    for (const w of this.walls) if (segAABB(ax, az, bx, bz, w)) return true;
    return false;
  }

  /** Distance to the first wall along `facing`, up to `maxR` (so the cone stops at
   * cover and reflects each guard's own sight range). */
  private coneDist(gx: number, gz: number, facing: number, maxR: number): number {
    const bx = gx + Math.sin(facing) * maxR;
    const bz = gz + Math.cos(facing) * maxR;
    let best = maxR;
    for (const w of this.walls) {
      const t = segEntryT(gx, gz, bx, bz, w);
      if (t !== Infinity) best = Math.min(best, t * maxR);
    }
    return Math.max(2, best);
  }

  /** Screamer shriek: every other live guard nearby breaks toward your position. */
  private triggerScream(screamer: Guard): void {
    this.ctx.events.emit("SFX", { id: "scream" });
    this.ctx.events.emit("NOTICE", { text: "⚠ SCREAMER", sub: "It's calling them onto you — break line!" });
    this.ctx.stage.punch(0.25);
    for (const g of this.guards) {
      if (g === screamer || g.dead || g.state === "chase") continue;
      if ((g.x - this.ax) ** 2 + (g.z - this.az) ** 2 < 30 * 30) {
        g.state = "investigate";
        g.invX = this.ax;
        g.invZ = this.az;
        g.alertT = 4;
      }
    }
  }

  private updateGuard(g: Guard, dt: number): void {
    if (g.dead) {
      g.cone.visible = false;
      return;
    }
    // Detection: in range, within the cone, not behind a wall — and not while
    // you're hidden in an alcove or in the brief grace window after a grab. The
    // flashlight gives you away: with it off, guards spot you only up close.
    const dx = this.ax - g.x;
    const dz = this.az - g.z;
    const dist = Math.hypot(dx, dz);
    const range = (this.lightOn ? VISION_RANGE : VISION_RANGE * 0.5) * g.vision;
    let sees = false;
    if (dist < range && !this.hidden && this.startGrace <= 0) {
      const toAvatar = Math.atan2(dx, dz);
      let diff = toAvatar - g.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < CONE_HALF && !this.losBlocked(g.x, g.z, this.ax, this.az)) sees = true;
    }

    if (sees) {
      // The moment a guard first locks on, pop a "!" above it so the chase has a
      // visible source in the top-down scrum (a screamer also shrieks the block).
      if (g.state !== "chase") {
        this.ctx.floaters.spawn(g.x, 2.4, g.z, "!", "warn");
        if (g.scream) this.triggerScream(g);
      }
      g.state = "chase";
      g.alertT = 2.5;
    } else if (g.state === "chase") {
      // Lose the chase faster while you're tucked out of sight.
      g.alertT -= dt * (this.hidden ? 4 : 1);
      if (g.alertT <= 0) g.state = "patrol";
    } else if (g.state === "investigate") {
      g.alertT -= dt;
      if (g.alertT <= 0 || Math.hypot(g.invX - g.x, g.invZ - g.z) < 1.6) g.state = "patrol";
    }

    let tx: number;
    let tz: number;
    let speed: number;
    if (g.state === "chase") {
      tx = this.ax;
      tz = this.az;
      speed = g.chase;
      // Caught — the run ends right here.
      if (dist < 1.4) {
        this.onCaught();
        return;
      }
      // Spitters hang back and lob acid instead of closing all the way.
      if (g.type === "spitter") {
        g.spitCd -= dt;
        if (dist > 6) speed *= 0.45; // keep their distance to pelt you
        if (g.spitCd <= 0 && dist < VISION_RANGE && !this.losBlocked(g.x, g.z, this.ax, this.az)) {
          g.spitCd = 1.8;
          this.spawnSpit(g);
        }
      }
    } else if (g.state === "investigate") {
      tx = g.invX;
      tz = g.invZ;
      speed = g.speed * 1.3;
    } else {
      const p = g.patrol[g.pIdx];
      tx = p.x;
      tz = p.z;
      speed = g.speed;
      if (Math.hypot(p.x - g.x, p.z - g.z) < 1.5) g.pIdx = (g.pIdx + 1) % g.patrol.length;
    }

    const mdx = tx - g.x;
    const mdz = tz - g.z;
    const md = Math.hypot(mdx, mdz) || 1;
    g.x += (mdx / md) * speed * dt;
    g.z += (mdz / md) * speed * dt;
    g.x = clamp(g.x, AREA.minX, AREA.maxX);
    g.z = clamp(g.z, AREA.minZ, AREA.maxZ);
    // Guards collide with walls too (no walking through cover).
    for (const w of this.walls) [g.x, g.z] = pushOutAABB(g.x, g.z, 0.55, w);

    // Stuck recovery: if a patrolling guard hasn't progressed (wedged on a wall),
    // pick a fresh patrol target so it never jams (e.g. around the survivor).
    if (g.state === "patrol") {
      const moved = Math.hypot(g.x - g.px, g.z - g.pz);
      g.stuckT = moved < 0.04 ? g.stuckT + dt : 0;
      if (g.stuckT > 1.3) {
        g.patrol[g.pIdx] = this.freeSpot(AREA.minZ + 2, AREA.maxZ - 6);
        g.stuckT = 0;
      }
    } else {
      g.stuckT = 0;
    }
    g.px = g.x;
    g.pz = g.z;

    g.facing = Math.atan2(mdx, mdz);
    g.group.position.set(g.x, 0, g.z);
    g.group.rotation.y = g.facing;

    // Cone visual: amber when patrolling, red + brighter when hunting; clipped
    // to the nearest wall so it visibly stops at cover (matches the LoS check).
    const hunting = g.state === "chase";
    const cd = this.coneDist(g.x, g.z, g.facing, VISION_RANGE * g.vision);
    g.cone.scale.set(1, 1, cd / VISION_RANGE);
    const skin = ACT_SKINS[this.skinId];
    g.coneMat.color.set(hunting ? THREAT : skin.guard);
    g.coneMat.opacity = hunting ? 0.28 : 0.14;
    g.eyeMat.color.set(hunting ? THREAT : skin.guard);
  }

  /** A spitter lobs an acid bolt that leads the avatar. Hitting you ends the run. */
  private spawnSpit(g: Guard): void {
    let mesh = this.spitPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.spitGeo, this.spitMat);
      this.group.add(mesh);
    }
    mesh.visible = true;
    const sx = g.x;
    const sz = g.z;
    const SPEED = 13;
    const dx = this.ax - sx;
    const dz = this.az - sz;
    const d = Math.hypot(dx, dz) || 1;
    mesh.position.set(sx, 1.3, sz);
    this.spits.push({ x: sx, z: sz, vx: (dx / d) * SPEED, vz: (dz / d) * SPEED, life: 2.2, mesh });
    this.ctx.events.emit("SFX", { id: "spit" });
  }

  private updateSpits(dt: number): void {
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      s.mesh.position.set(s.x, 1.3, s.z);
      const dx = s.x - this.ax;
      const dz = s.z - this.az;
      let hitWall = false;
      for (const w of this.walls) {
        if (s.x > w.x - w.w / 2 && s.x < w.x + w.w / 2 && s.z > w.z - w.d / 2 && s.z < w.z + w.d / 2) {
          hitWall = true;
          break;
        }
      }
      const offMap = s.x < AREA.minX || s.x > AREA.maxX || s.z < AREA.minZ || s.z > AREA.maxZ;
      if (dx * dx + dz * dz < 1.0) {
        this.retireSpit(i);
        if (!this.done) this.onCaught();
        return;
      }
      if (s.life <= 0 || hitWall || offMap) this.retireSpit(i);
    }
  }

  private retireSpit(i: number): void {
    const s = this.spits[i];
    s.mesh.visible = false;
    this.spitPool.push(s.mesh);
    this.spits.splice(i, 1);
  }

  private clearSpits(): void {
    for (const s of this.spits) {
      s.mesh.visible = false;
      this.spitPool.push(s.mesh);
    }
    this.spits.length = 0;
  }

  private nearestCrate(): Crate | null {
    let best: Crate | null = null;
    let bestD = Infinity;
    for (const c of this.crates) {
      if (c.got || c.kit) continue; // lead to supplies, not bonus kits
      const d = (c.x - this.ax) ** 2 + (c.z - this.az) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  nearestCratePos(): THREE.Vector3 | null {
    const c = this.nearestCrate();
    return c ? this.nearest.set(c.x, 1, c.z) : null;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.active = false;
    this.timeLeft = Math.max(0, this.timeLeft);
    this.ctx.stats.cratesGrabbed += this.got;
    const frac = this.got / this.total;
    this.ctx.events.emit("DAY_DONE", { tier: tierFromFrac(frac), frac, weapons: this.collectedWeapons.slice() });
  }

  /** Debug: force a held "spotted" state (alarm vignette + a chasing guard with a
   * red cone + "!"/"?" telegraphs) so a capture can frame the in-run feedback. */
  debugSpotted(): void {
    this.debugAlert = true;
    this.spotted = true;
    const a = this.guards[0];
    if (a) {
      a.state = "chase";
      a.alertT = 999;
      a.x = this.ax + 3.2;
      a.z = this.az;
    }
    const b = this.guards[1];
    if (b) {
      b.state = "investigate";
      b.alertT = 999;
      b.x = this.ax - 4;
      b.z = this.az - 2;
    }
  }

  debugComplete(): void {
    if (!this.active) return;
    this.got = this.total;
    // Also auto-collect any weapon case so the find→grant path stays exercised.
    for (const c of this.crates) if (c.weapon && !c.got) this.collectedWeapons.push(c.weapon);
    this.finish();
  }

  getResult(): { tier: Tier; frac: number } {
    const frac = this.got / this.total;
    return { tier: tierFromFrac(frac), frac };
  }

  /** Debug: drop the avatar at a spot so a capture can frame the lot interior. */
  debugTeleport(x: number, z: number): void {
    this.ax = x;
    this.az = z;
    this.avatar.position.set(x, 0, z);
  }

  hide(): void {
    this.group.visible = false;
    this.active = false;
    this.ctx.stage.fog.density = this.fogPrev;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Object count in the run scene — a coarse regression guard that the floor,
   * walls, dressing, backdrop, guards and crates all built. */
  get objectCount(): number {
    return (
      this.group.children.length +
      this.dressGroup.children.length +
      this.backdropGroup.children.length +
      this.wallGroup.children.length
    );
  }
}
