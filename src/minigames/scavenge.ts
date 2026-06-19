import * as THREE from "three";
import type { Ctx } from "../game/ctx";
import { makeGlow, makeLabel, concreteTexture, stencilTexture, glowTexture } from "../render/textures";
import { clamp } from "../core/math";
import { TRAITS } from "../game/traits";
import { levelInfo, type SupplyTheme } from "../game/acts";

const SURVIVOR_NAMES = ["Cole", "Reyes", "Tess", "Vance", "Okafor", "Lin", "Brenner"];

const DURATION = 62;
const AREA = { minX: -40, maxX: 40, minZ: -66, maxZ: -3 };
const SNEAK = 6.4;
const SPRINT = 12;
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
    floor: 0x332f2b,
    wall: 0x35302b,
    cap: 0x514137,
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
    floor: 0x34383d,
    wall: 0x343d46,
    cap: 0x64707c,
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
}
interface Survivor {
  group: THREE.Group;
  x: number;
  z: number;
  taken: boolean;
}
type GType = "shambler" | "runner" | "spitter";
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
const GUARD_CFG: Record<GType, { flesh: number; coat: number; scale: number; speed: number; chase: number }> = {
  shambler: { flesh: 0x35402c, coat: 0x232a1c, scale: 1.0, speed: 3.0, chase: 7.4 },
  runner: { flesh: 0x5a3020, coat: 0x331a12, scale: 0.84, speed: 4.6, chase: 10.5 },
  spitter: { flesh: 0x2f4a26, coat: 0x1c3018, scale: 1.1, speed: 2.3, chase: 5.6 },
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
  private lightDefault = 19;
  private avatar = new THREE.Group();
  private light: THREE.SpotLight;
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
    tex.repeat.set(11, 9);
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0x2b323a, map: tex, roughness: 0.85, metalness: 0.08 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 76), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, (AREA.minZ + AREA.maxZ) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
    // Faded yellow parking/lane lines — toggled off in the rural outskirts.
    this.group.add(this.laneGroup);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x6a5a22, transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 9), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-30 + i * 12, 0.03, -20);
      this.laneGroup.add(line);
    }
  }

  private buildWalls(): void {
    // Rebuildable: clear any prior layout's meshes, then build the active one.
    this.wallGroup.clear();
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

  /** Free a rebuildable group's children (geometry + materials + maps) so the
   * per-run dressing/backdrop don't leak across runs. */
  private clearGroup(g: THREE.Group): void {
    const sharedGlow = glowTexture();
    g.traverse((o) => {
      const m = o as THREE.Mesh & { material?: THREE.Material | THREE.Material[]; isMesh?: boolean };
      if (!m.isMesh) return;
      m.geometry?.dispose?.();
      const mat = m.material;
      const free = (x: THREE.Material) => {
        const map = (x as THREE.Material & { map?: THREE.Texture | null }).map;
        if (map && map !== sharedGlow) map.dispose();
        x.dispose();
      };
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
    } else if (this.skinId === "flood") {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(88, 68),
        new THREE.MeshStandardMaterial({
          color: skin.floor,
          transparent: true,
          opacity: 0.48,
          roughness: 0.16,
          metalness: 0.55,
          depthWrite: false,
        })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.045, -34);
      G.add(water);
      const rippleMat = new THREE.MeshBasicMaterial({ color: skin.accent, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      for (let i = 0; i < 8; i++) {
        const r = new THREE.Mesh(new THREE.RingGeometry(rng.range(0.8, 1.4), rng.range(1.8, 3.3), 20), rippleMat);
        const p = spot();
        r.rotation.x = -Math.PI / 2;
        r.position.set(p.x, 0.065, p.z);
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
      [-32, -12],
      [30, -30],
      [-4, -38],
      [22, -56],
      [-26, -60],
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

  private makeCrate(x: number, z: number, gold: boolean, kit: boolean): Crate {
    const g = new THREE.Group();
    const skin = ACT_SKINS[this.skinId];
    const beacon = kit ? skin.kit : gold ? skin.gold : skin.accent;
    const tint = kit ? skin.kit : gold ? skin.gold : skin.crate;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.72, 0.72),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, emissive: new THREE.Color(tint).multiplyScalar(0.28), flatShading: true })
    );
    box.position.y = 0.4;
    box.castShadow = true;
    g.add(box);

    if (kit) {
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

    g.add(makeGlow(beacon, gold || kit ? 2.2 : 1.7, 0.6));
    g.position.set(x, 0, z);
    this.group.add(g);
    return { group: g, x, z, got: false, gold, kit };
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
    const cone = new THREE.Mesh(this.coneGeo, coneMat);
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
      spitCd: this.ctx.rng.range(1.2, 2.6), stuckT: 0, px: patrol[0].x, pz: patrol[0].z,
      invX: 0, invZ: 0, dead: false,
    };
  }

  start(opts?: { density?: Density }): void {
    const density = opts?.density ?? "med";
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

    // Apply the environment skin (floor + lane lines), then pick a layout that
    // matches the district and (re)build its walls, dressing, and backdrop.
    this.floorMat.color.setHex(dcfg.floor);
    this.laneGroup.visible = dcfg.lanes;
    const pool = dcfg.layouts;
    this.walls = MAPS[pool[Math.floor(this.ctx.rng.next() * pool.length)]];
    this.buildWalls();
    this.buildDressing(dcfg);
    this.buildBackdrop(dcfg);
    this.clearSpits();

    // Crates: count + gold-cache ratio scale with the population you picked.
    for (const c of this.crates) this.group.remove(c.group);
    this.crates = [];
    for (let i = 0; i < dcfg.crates; i++) {
      const s = this.freeSpot(AREA.minZ + 3, AREA.maxZ - 10);
      this.crates.push(this.makeCrate(s.x, s.z, i < dcfg.gold, false));
    }
    for (let i = 0; i < dcfg.kits; i++) {
      const s = this.freeSpot(AREA.minZ + 3, AREA.maxZ - 14);
      this.crates.push(this.makeCrate(s.x, s.z, false, true));
    }

    const night = this.ctx.run.night;
    const pressure = curLevel.act * 1.2 + curLevel.levelInAct;

    // Survivors are rare to find now (allies should accrue slowly): never on the
    // first night, never once the squad is full, and only sometimes otherwise.
    if (this.survivor) {
      this.group.remove(this.survivor.group);
      this.survivor = null;
    }
    let sv: { x: number; z: number } | null = null;
    if (night >= 2 && this.ctx.run.companions.length < 4 && this.ctx.rng.chance(0.4)) {
      sv = this.freeSpot(AREA.minZ + 4, AREA.minZ + 20);
      this.survivor = this.makeSurvivor(sv.x, sv.z);
    }

    // Guard mix scales with the night AND the chosen population: more guards, and
    // more runners/spitters, so a crowded district is a real gamble.
    for (const g of this.guards) this.group.remove(g.group);
    this.guards = [];
    const patrols = Math.max(2, Math.round((4 + pressure) * dcfg.guardMul));
    const spitterChance = Math.min(0.42, 0.08 + pressure * 0.055);
    const runnerChance = Math.min(0.52, 0.2 + pressure * 0.045);
    const rollType = (): GType => {
      const r = this.ctx.rng.next();
      if (r < spitterChance) return "spitter";
      if (r < spitterChance + runnerChance) return "runner";
      return "shambler";
    };
    for (let i = 0; i < patrols; i++) this.guards.push(this.makeGuard(rollType()));
    // A cluster of defenders only when there's actually a survivor to guard.
    if (sv) {
      const defenders: GType[] = night >= 2 ? ["shambler", "runner", "spitter"] : ["shambler", "shambler", "runner"];
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
    // Time pressure — heartbeat in the final stretch
    if (this.timeLeft < 12 && Math.floor(this.timeLeft) !== Math.floor(this.timeLeft + dt)) {
      this.ctx.events.emit("SFX", { id: "heartbeat" });
    }

    // Grab crates (supply, gold, or repair-kit)
    for (const c of this.crates) {
      if (c.got) continue;
      c.group.rotation.y += dt * 0.5;
      const dx = c.x - this.ax;
      const dz = c.z - this.az;
      if (dx * dx + dz * dz >= 2.4) continue;
      c.got = true;
      c.group.visible = false;
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

    // Rescue the survivor (recruit a new ally)
    if (this.survivor && !this.survivor.taken) {
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

  /** Distance to the first wall along `facing` (so the cone stops at cover). */
  private coneDist(gx: number, gz: number, facing: number): number {
    const bx = gx + Math.sin(facing) * VISION_RANGE;
    const bz = gz + Math.cos(facing) * VISION_RANGE;
    let best = VISION_RANGE;
    for (const w of this.walls) {
      const t = segEntryT(gx, gz, bx, bz, w);
      if (t !== Infinity) best = Math.min(best, t * VISION_RANGE);
    }
    return Math.max(2, best);
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
    const range = this.lightOn ? VISION_RANGE : VISION_RANGE * 0.5;
    let sees = false;
    if (dist < range && !this.hidden && this.startGrace <= 0) {
      const toAvatar = Math.atan2(dx, dz);
      let diff = toAvatar - g.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < CONE_HALF && !this.losBlocked(g.x, g.z, this.ax, this.az)) sees = true;
    }

    if (sees) {
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
    const cd = this.coneDist(g.x, g.z, g.facing);
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
    this.ctx.events.emit("DAY_DONE", { tier: tierFromFrac(frac), frac });
  }

  debugComplete(): void {
    if (!this.active) return;
    this.got = this.total;
    this.finish();
  }

  getResult(): { tier: Tier; frac: number } {
    const frac = this.got / this.total;
    return { tier: tierFromFrac(frac), frac };
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
