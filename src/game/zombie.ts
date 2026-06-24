import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Ctx } from "./ctx";
import { FIELD, PAL, CHOKES } from "../config";
import { clamp } from "../core/math";
import { makeGlow } from "../render/textures";

export interface ZType {
  key: string;
  hp: number;
  speed: number;
  radius: number;
  claw: number;
  clawCD: number;
  touch: number;
  touchCD: number;
  body: number;
  head: number;
  eye: number;
  scale: number;
  heavy: boolean;
  headshotChance: number;
  groan: string;
  targetsPlayer?: boolean;
  slam?: boolean;
  standoff?: boolean;
  standoffZ?: number;
  spitDmg?: number;
  spitCD?: number;
  vaults?: boolean; // can climb/vault the barricade instead of waiting for a breach
  leaper?: boolean; // vaults almost instantly on reaching the wall
  screamer?: boolean; // periodically buffs the horde's speed
  lunges?: boolean; // telegraphs then bursts forward (runner)
  explodes?: boolean; // bursts a damaging gas cloud on death
  shield?: number; // frontal riot shield: absorbs body shots until broken
  miniboss?: boolean;
  boss?: boolean; // act finale: phases, wide slam, spawns adds
  bossTitle?: string;
}

export const TYPES: Record<string, ZType> = {
  shambler: {
    key: "shambler",
    hp: 32,
    speed: 4.2,
    radius: 0.85,
    claw: 5,
    clawCD: 1.1,
    touch: 9,
    touchCD: 1.0,
    body: 0x3a4a30,
    head: 0x495a3c,
    eye: 0xff5a3c,
    scale: 1,
    heavy: false,
    headshotChance: 0.22,
    groan: "groan_low",
  },
  runner: {
    key: "runner",
    hp: 14,
    speed: 8.6,
    radius: 0.62,
    claw: 6,
    clawCD: 0.85,
    touch: 7,
    touchCD: 0.8,
    body: 0x5a3220,
    head: 0x6a4026,
    eye: 0xffb13c,
    scale: 0.92,
    heavy: false,
    headshotChance: 0.3,
    groan: "groan_high",
    targetsPlayer: true,
    lunges: true,
  },
  brute: {
    key: "brute",
    hp: 135,
    speed: 2.1,
    radius: 1.4,
    claw: 22,
    clawCD: 1.8,
    touch: 22,
    touchCD: 1.4,
    body: 0x2b2b33,
    head: 0x35353f,
    eye: 0xff3030,
    scale: 1.6,
    heavy: true,
    headshotChance: 0.12,
    groan: "groan_brute",
    slam: true,
  },
  spitter: {
    key: "spitter",
    hp: 22,
    speed: 3.2,
    radius: 0.78,
    claw: 0,
    clawCD: 1,
    touch: 6,
    touchCD: 1,
    body: 0x2f4a26,
    head: 0x3a5a2e,
    eye: 0x9bd83a,
    scale: 1.02,
    heavy: false,
    headshotChance: 0.25,
    groan: "groan_spit",
    standoff: true,
    standoffZ: -13,
    spitDmg: 9,
    spitCD: 2.7,
  },
  crawler: {
    key: "crawler",
    hp: 12,
    speed: 5.4,
    radius: 0.5,
    claw: 6,
    clawCD: 0.9,
    touch: 7,
    touchCD: 0.85,
    body: 0x402f1f,
    head: 0x4c3a26,
    eye: 0xff8a3c,
    scale: 0.66,
    heavy: false,
    headshotChance: 0.16,
    groan: "groan_low",
    targetsPlayer: true,
    vaults: true,
  },
  armored: {
    key: "armored",
    hp: 70,
    speed: 2.4,
    radius: 0.95,
    claw: 8,
    clawCD: 1.2,
    touch: 12,
    touchCD: 1.1,
    body: 0x3a3f46,
    head: 0x4a4f56,
    eye: 0xff5a3c,
    scale: 1.12,
    heavy: true,
    headshotChance: 0.1,
    groan: "groan_brute",
  },
  screamer: {
    key: "screamer",
    hp: 26,
    speed: 4.0,
    radius: 0.75,
    claw: 5,
    clawCD: 1.1,
    touch: 8,
    touchCD: 1.0,
    body: 0x5a2a4a,
    head: 0x6a345a,
    eye: 0xff3cf0,
    scale: 1.0,
    heavy: false,
    headshotChance: 0.24,
    groan: "groan_high",
    screamer: true,
  },
  exploder: {
    key: "exploder",
    hp: 24,
    speed: 3.4,
    radius: 0.82,
    claw: 4,
    clawCD: 1.2,
    touch: 8,
    touchCD: 1.0,
    body: 0x6a6a1e,
    head: 0x7a7a2a,
    eye: 0xc6ff3a,
    scale: 1.04,
    heavy: false,
    headshotChance: 0.2,
    groan: "groan_spit",
    explodes: true,
  },
  shielded: {
    key: "shielded",
    hp: 55,
    speed: 2.3,
    radius: 0.95,
    claw: 10,
    clawCD: 1.2,
    touch: 12,
    touchCD: 1.1,
    body: 0x3c4248,
    head: 0x4a5056,
    eye: 0xff7a3a,
    scale: 1.14,
    heavy: true,
    headshotChance: 0.12,
    groan: "groan_brute",
    shield: 60,
  },
  roadblock: {
    key: "roadblock",
    hp: 980,
    speed: 2.25,
    radius: 2.2,
    claw: 28,
    clawCD: 2.0,
    touch: 34,
    touchCD: 1.45,
    body: 0x20242a,
    head: 0x303840,
    eye: 0xff482c,
    scale: 2.45,
    heavy: true,
    headshotChance: 0.08,
    groan: "groan_brute",
    slam: true,
    boss: true,
    bossTitle: "THE ROADBLOCK",
  },
  drowned: {
    key: "drowned",
    hp: 1450,
    speed: 1.95,
    radius: 2.45,
    claw: 24,
    clawCD: 2.15,
    touch: 36,
    touchCD: 1.55,
    body: 0x10242a,
    head: 0x18343a,
    eye: 0x7fe8ff,
    scale: 2.75,
    heavy: true,
    headshotChance: 0.07,
    groan: "groan_brute",
    slam: true,
    boss: true,
    bossTitle: "THE DROWNED TITAN",
  },
  leaper: {
    key: "leaper",
    hp: 16,
    speed: 6.0,
    radius: 0.6,
    claw: 7,
    clawCD: 0.9,
    touch: 9,
    touchCD: 0.85,
    body: 0x4a2a1a,
    head: 0x5a3624,
    eye: 0xffd23a,
    scale: 0.86,
    heavy: false,
    headshotChance: 0.22,
    groan: "groan_high",
    targetsPlayer: true,
    vaults: true,
    leaper: true,
  },
  behemoth: {
    key: "behemoth",
    hp: 2100,
    speed: 2.0,
    radius: 2.6,
    claw: 26,
    clawCD: 2.3,
    touch: 38,
    touchCD: 1.6,
    body: 0x190f14,
    head: 0x241820,
    eye: 0xff1414,
    scale: 3.0,
    heavy: true,
    headshotChance: 0.06,
    groan: "groan_brute",
    slam: true,
    boss: true,
    bossTitle: "THE BEHEMOTH",
  },
  tank: {
    key: "tank",
    hp: 720,
    speed: 2.4,
    radius: 2.0,
    claw: 30,
    clawCD: 2.0,
    touch: 34,
    touchCD: 1.6,
    body: 0x23252b,
    head: 0x2e3138,
    eye: 0xff2020,
    scale: 2.3,
    heavy: true,
    headshotChance: 0.08,
    groan: "groan_brute",
    slam: true,
    miniboss: true,
  },
};

type State = "advancing" | "attacking" | "standoff" | "crossing" | "dying" | "fleeing";

/** Distance attenuation for enemy sounds: full at the wall (z≈0), fainter deep
 * in the field (z≈-82). */
function distGain(z: number): number {
  return clamp(1 + z / 110, 0.32, 1);
}

let NEXT_ID = 1;

// Per-type geometry is built once and shared across all zombies of that type:
// the whole body is merged into a single BufferGeometry (one draw call) + a tiny
// eyes geometry. This slashes draw calls (~24 meshes → 2) and per-spawn GC.
const bodyGeoCache: Record<string, THREE.BufferGeometry> = {};
const eyeGeoCache: Record<string, THREE.BufferGeometry> = {};
const boneGeoCache: Record<string, THREE.BufferGeometry> = {};
const eyeMatCache: Record<string, THREE.MeshBasicMaterial> = {};
const BONE_MAT = new THREE.MeshStandardMaterial({ color: 0xd8d0bd, roughness: 1, flatShading: true });

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}
function ball(r: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 8, 8);
  g.translate(x, y, z);
  return g;
}

function buildZombieGeo(t: ZType): { body: THREE.BufferGeometry; eyes: THREE.BufferGeometry; bone: THREE.BufferGeometry } {
  if (bodyGeoCache[t.key]) return { body: bodyGeoCache[t.key], eyes: eyeGeoCache[t.key], bone: boneGeoCache[t.key] };
  const s = t.scale;
  const lean = t.key === "runner" ? 0.32 : t.key === "brute" ? 0.1 : 0.2;
  const p: THREE.BufferGeometry[] = [
    box(0.74 * s, 1.12 * s, 0.46 * s, 0, 0.95 * s, 0, lean), // gaunt torso
    box(0.9 * s, 0.32 * s, 0.48 * s, 0, 1.42 * s, 0.12 * s, lean), // shoulders
    box(0.34 * s, 0.5 * s, 0.36 * s, 0, 1.2 * s, -0.12 * s, lean + 0.25), // hunched spine hump
    box(0.42 * s, 0.42 * s, 0.44 * s, 0, 1.62 * s, 0.2 * s), // head
    box(0.3 * s, 0.12 * s, 0.28 * s, 0, 1.5 * s, 0.36 * s), // upper jaw
    box(0.28 * s, 0.12 * s, 0.26 * s, 0, 1.36 * s, 0.42 * s, 0.5), // hanging open lower jaw
    box(0.7 * s, 0.5 * s, 0.06 * s, 0, 0.5 * s, 0.28 * s, 0.3), // torn cloth
    // Tattered, hanging rag strips (baked into the merged mesh — no extra draws).
    box(0.14 * s, 0.6 * s, 0.04 * s, -0.26 * s, 0.45 * s, 0.26 * s, 0.12),
    box(0.12 * s, 0.5 * s, 0.04 * s, 0.22 * s, 0.5 * s, 0.27 * s, -0.1),
    box(0.1 * s, 0.42 * s, 0.04 * s, 0.05 * s, 0.38 * s, 0.3 * s, 0.05),
  ];
  // Sinewy neck + a heavy brow ridge over the eyes — reads as a skull at distance.
  p.push(box(0.22 * s, 0.24 * s, 0.22 * s, 0, 1.48 * s, 0.08 * s, lean)); // neck
  p.push(box(0.44 * s, 0.09 * s, 0.12 * s, 0, 1.76 * s, 0.4 * s)); // brow ridge
  p.push(box(0.18 * s, 0.16 * s, 0.16 * s, 0, 1.58 * s, 0.46 * s)); // nose/snout stub
  // Exposed ribs
  for (const ry of [0.78, 0.62, 0.46]) p.push(box(0.5 * s, 0.05 * s, 0.48 * s, 0, ry * s, 0.04 * s, lean));
  // Gaunt reaching arms + long gnarled claws
  for (const ax of [-0.5, 0.5]) {
    p.push(box(0.16 * s, 0.98 * s, 0.16 * s, ax * s, 1.0 * s, 0.44 * s, -1.15));
    p.push(box(0.18 * s, 0.18 * s, 0.22 * s, ax * s, 0.5 * s, 0.95 * s));
    for (const fx of [-0.07, 0, 0.07]) p.push(box(0.035 * s, 0.035 * s, 0.28 * s, (ax + fx) * s, 0.48 * s, 1.2 * s, 0.55));
  }
  for (const lx of [-0.2, 0.2]) {
    p.push(box(0.22 * s, 0.85 * s, 0.22 * s, lx * s, 0.42 * s, 0));
    p.push(box(0.24 * s, 0.14 * s, 0.42 * s, lx * s, 0.07 * s, 0.12 * s));
  }
  if (t.key === "brute" || t.boss) {
    for (const sx of [-0.6, 0.6]) p.push(box(0.42 * s, 0.42 * s, 0.6 * s, sx * s, 1.5 * s, 0.1 * s));
    p.push(box(0.7 * s, 0.7 * s, 0.25 * s, 0, 1.2 * s, -0.3 * s));
  }
  if (t.boss) {
    // jagged horns, a heavy back hump, and slab forearms
    for (const hx of [-0.24, 0.24]) p.push(box(0.12 * s, 0.55 * s, 0.12 * s, hx * s, 1.96 * s, 0.16 * s, -0.45));
    p.push(ball(0.55 * s, 0, 1.05 * s, -0.26 * s)); // spine hump
    for (const ax of [-0.62, 0.62]) p.push(box(0.34 * s, 0.34 * s, 0.7 * s, ax * s, 0.7 * s, 0.5 * s, -0.5));
  }
  if (t.key === "roadblock") {
    // ripped car-door armor and an engine block embedded in the chest
    p.push(box(0.95 * s, 0.12 * s, 0.65 * s, -0.52 * s, 1.12 * s, 0.42 * s, 0.18));
    p.push(box(0.95 * s, 0.12 * s, 0.65 * s, 0.52 * s, 1.1 * s, 0.42 * s, -0.18));
    p.push(box(0.62 * s, 0.46 * s, 0.2 * s, 0, 0.92 * s, 0.5 * s));
  } else if (t.key === "drowned") {
    // swollen waterlogged silhouette with hanging weeds
    p.push(ball(0.72 * s, 0, 0.92 * s, 0.12 * s));
    for (const sx of [-0.34, 0, 0.34]) p.push(box(0.08 * s, 0.72 * s, 0.06 * s, sx * s, 0.55 * s, 0.52 * s, 0.25));
  }
  if (t.key === "spitter") {
    p.push(ball(0.42 * s, 0, 1.1 * s, -0.34 * s)); // acid sac on the back
    p.push(ball(0.3 * s, 0, 1.34 * s, 0.18 * s)); // swollen, distended throat
  } else if (t.key === "exploder") {
    p.push(ball(0.56 * s, 0, 0.82 * s, 0.22 * s)); // bloated, gas-filled belly
    // pustules straining over the belly
    for (const [px, py, pz] of [[-0.3, 0.92, 0.5], [0.32, 0.7, 0.56], [0.0, 1.04, 0.6], [0.22, 0.5, 0.5]] as [number, number, number][])
      p.push(ball(0.14 * s, px * s, py * s, pz * s));
  }
  // Armored/tank: bolted-on plate, shoulder pauldrons, a helmet dome + cheek
  // guards that frame the glowing eyes (body colour reads as battered steel).
  if (t.key === "armored" || t.key === "tank" || t.key === "roadblock") {
    p.push(box(0.64 * s, 0.62 * s, 0.18 * s, 0, 1.0 * s, 0.3 * s)); // chest plate
    for (const sx of [-0.46, 0.46]) p.push(box(0.36 * s, 0.24 * s, 0.48 * s, sx * s, 1.46 * s, 0.1 * s)); // pauldrons
    p.push(box(0.5 * s, 0.26 * s, 0.5 * s, 0, 1.84 * s, 0.18 * s)); // helmet dome
    for (const cx of [-0.27, 0.27]) p.push(box(0.1 * s, 0.32 * s, 0.32 * s, cx * s, 1.55 * s, 0.3 * s)); // cheek guards
  }
  if (t.key === "tank" || t.key === "roadblock") {
    p.push(box(0.82 * s, 0.5 * s, 0.2 * s, 0, 0.58 * s, 0.32 * s)); // heavy belly plate
    for (const ax of [-0.6, 0.6]) p.push(box(0.32 * s, 0.5 * s, 0.5 * s, ax * s, 0.78 * s, 0.42 * s, -0.4)); // forearm guards
  }
  // Screamer: a distended, gaping maw + swollen throat (it howls the horde on).
  if (t.key === "screamer") {
    p.push(box(0.4 * s, 0.16 * s, 0.34 * s, 0, 1.46 * s, 0.5 * s)); // upper gape
    p.push(box(0.38 * s, 0.18 * s, 0.32 * s, 0, 1.18 * s, 0.5 * s, 0.55)); // dropped lower jaw
    p.push(ball(0.2 * s, 0, 1.1 * s, 0.36 * s)); // bulging throat
  }
  // Leaper: a coiled, crouched stance — extra bent shins ready to spring.
  if (t.key === "leaper") {
    for (const lx of [-0.2, 0.2]) p.push(box(0.2 * s, 0.42 * s, 0.3 * s, lx * s, 0.32 * s, 0.16 * s, 0.7));
  }
  const body = mergeGeometries(p, false) as THREE.BufferGeometry;
  for (const g of p) g.dispose();
  const eyes = mergeGeometries([ball(0.12 * s, -0.12 * s, 1.66 * s, 0.42 * s), ball(0.12 * s, 0.12 * s, 1.66 * s, 0.42 * s)], false) as THREE.BufferGeometry;
  // Exposed bone accents: collarbone, jutting rib tips, a row of teeth.
  const bp: THREE.BufferGeometry[] = [
    box(0.5 * s, 0.06 * s, 0.06 * s, 0, 1.34 * s, 0.24 * s), // collarbone
    box(0.26 * s, 0.04 * s, 0.05 * s, 0, 1.34 * s, 0.5 * s), // teeth row
  ];
  for (const rx of [-0.18, 0.18]) {
    bp.push(box(0.05 * s, 0.05 * s, 0.05 * s, rx * s, 0.72 * s, 0.26 * s));
    bp.push(box(0.05 * s, 0.05 * s, 0.05 * s, rx * s * 0.7, 0.58 * s, 0.27 * s));
  }
  const bone = mergeGeometries(bp, false) as THREE.BufferGeometry;
  for (const g of bp) g.dispose();
  bodyGeoCache[t.key] = body;
  eyeGeoCache[t.key] = eyes;
  boneGeoCache[t.key] = bone;
  eyeMatCache[t.key] = new THREE.MeshBasicMaterial({ color: t.eye, fog: false });
  return { body, eyes, bone };
}

export class Zombie {
  id = NEXT_ID++;
  kind: string;
  group = new THREE.Group();
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  radius: number;
  heavy: boolean;
  headshotChance: number;
  headY: number;
  state: State = "advancing";

  private t: ZType;
  private body: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private glow!: THREE.Sprite;
  private bellyGlow?: THREE.Sprite;
  /** Boss-only: hot eye-point sprites + the ember hue for the body pulse. */
  private bossGlows: THREE.Sprite[] = [];
  private emberColor: THREE.Color | null = null;
  private targetX: number;
  private clawTimer = 0;
  private touchTimer = 0;
  private spitTimer: number;
  private winding = 0; // brute slam / spit wind-up remaining
  private screamTimer = 4;
  private vaultT = -1;
  private vault = 0;
  private crippled = false;
  private slowT = 0;
  shield = 0;
  private maxShield = 0;
  private shieldMesh?: THREE.Mesh;
  private seeksWeak: boolean;
  private lungeCd: number;
  private lungeWind = 0;
  private lungeBoost = 0;
  private bossPhase = 0;
  private enrageMul = 1;
  private dieTimer = 0;
  private dieRoll = 0;
  private diePitch = 1.3;
  private fleeFade = 1;
  private bob: number;
  private hitFlash = 0;

  constructor(t: ZType, x: number, ctx: Ctx, z?: number) {
    this.t = t;
    this.kind = t.key;
    this.hp = t.hp * ctx.tuning.zHp;
    this.maxHp = this.hp;
    this.radius = t.radius;
    this.heavy = t.heavy;
    this.headshotChance = t.headshotChance;
    this.x = x;
    this.z = z ?? FIELD.spawnZ + ctx.rng.range(-FIELD.spawnZJitter, 0);
    this.targetX = x;
    this.spitTimer = t.spitCD ?? 2.5;
    this.bob = ctx.rng.range(0, Math.PI * 2);
    this.headY = 1.7 * t.scale;
    this.shield = t.shield ?? 0;
    this.maxShield = this.shield;
    this.seeksWeak = ctx.rng.chance(0.55);
    this.lungeCd = ctx.rng.range(1.5, 3.5);

    const s = t.scale;
    const geo = buildZombieGeo(t);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: t.body,
      roughness: 1,
      flatShading: true,
      emissive: new THREE.Color(0x000000),
    });
    // Per-instance skin-tone jitter so a horde never looks like clones. A boss is
    // a singular landmark, not a horde member — keep it near its authored dark tone
    // (the full lightness jitter washed the near-black Behemoth into a pale mauve
    // blob). Three rng draws either way so the run's RNG stream stays in lockstep.
    const jit = t.boss ? 0.08 : 1;
    this.bodyMat.color.offsetHSL((ctx.rng.next() - 0.5) * 0.06 * jit, (ctx.rng.next() - 0.5) * 0.18 * jit, (ctx.rng.next() - 0.5) * 0.12 * jit);
    this.body = new THREE.Mesh(geo.body, this.bodyMat);
    this.body.castShadow = true;
    this.group.add(this.body);
    const eyes = new THREE.Mesh(geo.eyes, eyeMatCache[t.key]);
    this.group.add(eyes);
    const bones = new THREE.Mesh(geo.bone, BONE_MAT);
    this.group.add(bones);
    // Head glow. For a normal zombie a soft eye-glow that scales with its size;
    // for the big heavies (boss/miniboss) the full-scale sprite became a screen-
    // filling additive disc that bloomed into a featureless blob — the chief
    // "glitchy" read on the Behemoth. So the heavies get a CONTAINED halo, and a
    // real boss gets two tight, hot eye-points so it reads as a pair of burning
    // eyes in a dark silhouette rather than a sun.
    const big = t.boss || !!t.miniboss;
    this.glow = makeGlow(t.eye, big ? 2.0 : 1.7 * s, big ? 0.36 : 0.6);
    this.glow.position.set(0, 1.66 * s, 0.4 * s);
    this.group.add(this.glow);
    if (t.boss) {
      this.emberColor = new THREE.Color(t.eye);
      for (const ex of [-0.13, 0.13]) {
        const eye = makeGlow(t.eye, 0.5 * s, 0.85);
        eye.position.set(ex * s, 1.66 * s, 0.52 * s);
        this.group.add(eye);
        this.bossGlows.push(eye);
      }
    }

    // Exploder: a sickly green glow on the swollen, gas-filled belly.
    if (t.key === "exploder") {
      this.bellyGlow = makeGlow(0xc6ff3a, 2.2 * s, 0.7);
      this.bellyGlow.position.set(0, 0.82 * s, 0.5 * s);
      this.group.add(this.bellyGlow);
    }

    // Riot shield: a battered steel plate held out front (toward the wall, +Z).
    if (t.shield) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(1.0 * s, 1.4 * s, 0.12 * s),
        new THREE.MeshStandardMaterial({ color: 0x6a7480, roughness: 0.5, metalness: 0.6, flatShading: true })
      );
      plate.position.set(0, 1.0 * s, 0.62 * s);
      plate.castShadow = true;
      this.shieldMesh = plate;
      this.group.add(plate);
    }

    this.group.position.set(this.x, 0, this.z);
  }

  /** Reset a pooled actor for reuse (same type → same cached geometry/meshes).
   * Mirrors the dynamic state set in the constructor. */
  reinit(ctx: Ctx, x: number, z?: number): void {
    this.id = NEXT_ID++;
    this.hp = this.t.hp * ctx.tuning.zHp;
    this.maxHp = this.hp;
    this.state = "advancing";
    this.x = x;
    this.z = z ?? FIELD.spawnZ + ctx.rng.range(-FIELD.spawnZJitter, 0);
    this.targetX = x;
    this.clawTimer = 0;
    this.touchTimer = 0;
    this.spitTimer = this.t.spitCD ?? 2.5;
    this.winding = 0;
    this.screamTimer = 4;
    this.vaultT = -1;
    this.vault = 0;
    this.crippled = false;
    this.slowT = 0;
    this.dieTimer = 0;
    this.fleeFade = 1;
    this.hitFlash = 0;
    this.bossPhase = 0;
    this.enrageMul = 1;
    this.seeksWeak = ctx.rng.chance(0.55);
    this.lungeCd = ctx.rng.range(1.5, 3.5);
    this.lungeWind = 0;
    this.lungeBoost = 0;
    this.bob = ctx.rng.range(0, Math.PI * 2);
    // Reset visuals the death/flee/cripple states mutate.
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.group.position.set(this.x, 0, this.z);
    this.body.position.y = 0;
    this.bodyMat.transparent = false;
    this.bodyMat.opacity = 1;
    this.bodyMat.emissive.setRGB(0, 0, 0);
    this.group.visible = true;
  }

  get killable(): boolean {
    return this.state !== "dying" && this.hp > 0;
  }

  get title(): string {
    return this.t.bossTitle ?? this.kind.toUpperCase();
  }

  get gone(): boolean {
    return (this.state === "dying" && this.dieTimer <= 0) || (this.state === "fleeing" && this.z < -92);
  }

  /** Returns true if this hit killed it. */
  hurt(dmg: number): boolean {
    if (this.state === "dying") return false;
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (this.hp <= 0) {
      this.startDie();
      return true;
    }
    return false;
  }

  private startDie(): void {
    this.state = "dying";
    this.dieTimer = 0.55;
    // Vary the fall: topple forward/back or crumple on a random axis.
    this.dieRoll = (Math.random() - 0.5) * 2.6;
    this.diePitch = Math.random() < 0.5 ? 1.4 : -0.9;
  }

  flee(): void {
    if (this.state === "dying") return;
    if (this.t.boss) return; // the finale doesn't run from dawn — you must kill it
    this.state = "fleeing";
  }

  /** Limb damage — a crippled zombie limps along at reduced speed. */
  cripple(): void {
    if (this.crippled) return;
    this.crippled = true;
    this.group.rotation.z = 0.18; // a permanent lean/limp
  }

  /** Temporary slow (flares, traps). */
  slow(dur: number): void {
    this.slowT = Math.max(this.slowT, dur);
  }

  get shielded(): boolean {
    return this.shield > 0;
  }

  /** Chip the frontal shield with a body hit; returns the damage that leaks
   * through to HP. While the shield holds, only a little bleeds through; once it
   * shatters, the rest lands and the plate drops. */
  chipShield(dmg: number): number {
    if (this.shield <= 0) return dmg;
    const absorbed = Math.min(this.shield, dmg);
    this.shield -= absorbed;
    const leak = (dmg - absorbed) + absorbed * 0.12;
    if (this.shield <= 0 && this.shieldMesh) {
      this.shieldMesh.removeFromParent();
      this.shieldMesh = undefined;
    } else if (this.shieldMesh) {
      // dim the plate as it takes a beating
      const f = this.shield / this.maxShield;
      (this.shieldMesh.material as THREE.MeshStandardMaterial).color.setRGB(0.42 * (0.5 + f * 0.5), 0.45 * (0.5 + f * 0.5), 0.5 * (0.5 + f * 0.5));
    }
    return leak;
  }

  private speedFactor(): number {
    return (this.crippled ? 0.55 : 1) * (this.slowT > 0 ? 0.5 : 1);
  }

  /** Shove back out into the field (Last Stand shockwave). */
  repel(amount: number): void {
    if (this.state === "dying" || this.state === "fleeing") return;
    this.z -= amount;
    this.winding = 0;
    if (this.state === "attacking" || this.state === "crossing" || this.state === "standoff") {
      this.state = "advancing";
    }
  }

  update(dt: number, ctx: Ctx): void {
    if (this.slowT > 0) this.slowT -= dt;
    if (this.t.boss && this.state !== "dying") this.bossTick(ctx);
    // Hit flash decay
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = Math.max(0, this.hitFlash) / 0.12;
      this.bodyMat.emissive.setRGB(f, f, f);
    } else if (this.emberColor) {
      // A slow ember pulse in the eye hue keeps the boss reading as a LIVING
      // silhouette in the dark — lifting its shadowed faces just enough that the
      // form holds, kept well under the bloom threshold so it never blows out.
      const e = 0.085 + 0.035 * Math.sin(this.bob * 0.9);
      this.bodyMat.emissive.setRGB(this.emberColor.r * e, this.emberColor.g * e, this.emberColor.b * e);
    }

    switch (this.state) {
      case "advancing":
        this.advance(dt, ctx);
        break;
      case "attacking":
        this.attack(dt, ctx);
        break;
      case "standoff":
        this.standoff(dt, ctx);
        break;
      case "crossing":
        this.cross(dt, ctx);
        break;
      case "fleeing":
        this.fleeStep(dt);
        break;
      case "dying":
        this.dieStep(dt);
        break;
    }

    this.group.position.set(this.x, this.group.position.y, this.z);
    // Walk bob (skip while dying)
    if (this.state !== "dying") {
      this.bob += dt * this.t.speed * 1.4;
      this.body.position.y = Math.sin(this.bob) * 0.05;
    }
    // Exploder belly pulses like it's about to burst.
    if (this.bellyGlow) {
      const p = 0.5 + 0.5 * Math.sin(this.bob * 2.2);
      this.bellyGlow.material.opacity = 0.45 + p * 0.45;
      const s = (2.0 + p * 0.5) * this.t.scale;
      this.bellyGlow.scale.set(s, s, 1);
    }
  }

  private faceTravel(dx: number, dz: number): void {
    if (dx || dz) this.group.rotation.y = Math.atan2(dx, dz);
  }

  /** Boss phase transitions: at 66% and 33% HP it enrages (faster, harder slams)
   * and vomits a wave of adds. */
  private bossTick(ctx: Ctx): void {
    const frac = this.hp / this.maxHp;
    const phase = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    if (phase <= this.bossPhase) return;
    this.bossPhase = phase;
    this.enrageMul = 1 + phase * 0.32; // 1 → 1.32 → 1.64
    const title = this.title;
    ctx.events.emit("NOTICE", {
      text: phase === 1 ? `${title} RAGES` : `${title} IS DESPERATE`,
      sub: "It's calling more down on you!",
    });
    ctx.events.emit("SFX", { id: "boss_roar", pan: clamp(this.x / FIELD.wallHalf, -1, 1) });
    ctx.cam.addTrauma(0.5);
    for (let k = 0; k < 2 + phase; k++) {
      ctx.enemies.spawn(ctx.rng.chance(0.5) ? "runner" : "shambler", clamp(this.x + ctx.rng.range(-14, 14), -FIELD.wallHalf + 2, FIELD.wallHalf - 2));
    }
  }

  private advance(dt: number, ctx: Ctx): void {
    const spd = this.t.speed * ctx.enemies.speedMul() * this.speedFactor() * this.enrageMul;
    if (this.t.screamer) {
      this.screamTimer -= dt;
      if (this.screamTimer <= 0) {
        this.screamTimer = 6;
        ctx.enemies.triggerScream(this.x, this.z);
      }
    }
    // Steer toward the nearest breach if one is open, else the player (for the
    // hunters), else pile onto the weakest segment, else hold the spawn lane.
    if (!this.t.standoff) {
      const breach = ctx.wall.anyBreached() ? ctx.wall.nearestBreachX(this.x) : null;
      if (breach !== null) this.targetX = breach;
      else if (this.t.targetsPlayer && ctx.player.alive)
        this.targetX = clamp(ctx.player.x, -FIELD.wallHalf + 1, FIELD.wallHalf - 1);
      else if (this.seeksWeak) {
        const weak = ctx.wall.weakestX(0.5);
        if (weak !== null) this.targetX = weak;
      }
    }

    // Runner lunge: brief brace (telegraphed) then a forward burst.
    let fwd = 1;
    if (this.t.lunges) {
      if (this.lungeBoost > 0) {
        this.lungeBoost -= dt;
        fwd = 2.6;
      } else if (this.lungeWind > 0) {
        this.lungeWind -= dt;
        fwd = 0.15; // braced, almost still — the tell
        if (this.lungeWind <= 0) {
          this.lungeBoost = 0.55;
          this.lungeCd = ctx.rng.range(2.8, 4.2);
          ctx.events.emit("SFX", { id: this.t.groan, pan: clamp(this.x / FIELD.wallHalf, -1, 1) });
        }
      } else {
        this.lungeCd -= dt;
        if (this.lungeCd <= 0 && this.z > -32 && this.z < FIELD.attackZ - 3) {
          this.lungeWind = 0.4;
          ctx.tele.warn(this.x, this.z + 7, 1.3, 0xffb13c, 0.4);
        }
      }
    }

    const goalZ = this.t.standoff ? this.t.standoffZ! : FIELD.attackZ;
    // Funnel around static field wrecks: if a wreck blocks the lane ahead, slide
    // toward the nearer gap before reaching it.
    let aimX = this.targetX;
    for (const c of CHOKES) {
      if (this.z > c.z + c.halfD) continue; // already behind it
      if (this.z < c.z - c.halfD - 6) continue; // still far out — no need to steer yet
      const half = c.halfW + this.radius + 0.4;
      if (Math.abs(this.x - c.x) < half) {
        aimX = this.x < c.x ? c.x - half : c.x + half;
      }
    }
    aimX = clamp(aimX, -FIELD.fieldHalf + 1, FIELD.fieldHalf - 1);
    const dx = clamp(aimX - this.x, -1, 1);
    this.x += dx * spd * 0.5 * dt;
    this.z += spd * fwd * dt;
    this.faceTravel(dx, 1);

    if (this.t.standoff) {
      if (this.z >= goalZ) {
        this.z = goalZ;
        this.state = "standoff";
      }
      return;
    }
    if (this.z >= FIELD.attackZ) {
      this.z = FIELD.attackZ;
      this.state = ctx.wall.isBrokenAt(this.x) ? "crossing" : "attacking";
    }
  }

  private attack(dt: number, ctx: Ctx): void {
    if (ctx.wall.isBrokenAt(this.x)) {
      this.state = "crossing";
      return;
    }
    this.faceTravel(0, 1);

    // Vaulters claw a couple of times then climb over the barricade. Leapers
    // barely pause — they vault almost on contact.
    if (this.t.vaults) {
      if (this.vaultT < 0) this.vaultT = this.t.leaper ? 0.2 : 1.2;
      this.vaultT -= dt;
      if (this.vaultT <= 0) {
        this.state = "crossing";
        this.vault = 0.45;
        ctx.events.emit("SFX", { id: "zombie_claw", pan: clamp(this.x / FIELD.wallHalf, -1, 1) });
        return;
      }
    }

    if (this.t.slam) {
      const boss = this.t.boss;
      // Telegraphed heavy slam
      if (this.winding > 0) {
        this.winding -= dt;
        if (this.winding <= 0) {
          if (boss) {
            // Wide slam — rips three segments at once.
            const W = (FIELD.wallHalf * 2) / FIELD.segments;
            for (const off of [-W, 0, W]) ctx.wall.damageAt(this.x + off, this.t.claw * 1.3);
            ctx.fx.burst(this.x, 1.6, FIELD.wallZ, 28, 0x8899aa, { speed: 13, up: 9, life: 0.6, size: 9 });
            ctx.cam.addTrauma(0.4);
            ctx.events.emit("SFX", { id: "wall_breach", pan: clamp(this.x / FIELD.wallHalf, -1, 1) });
          } else {
            ctx.wall.damageAt(this.x, this.t.claw * 1.4);
            ctx.fx.burst(this.x, 1.2, FIELD.wallZ, 14, 0x8899aa, { speed: 9, up: 6, life: 0.5 });
            ctx.cam.addTrauma(0.18);
            ctx.events.emit("SFX", { id: "brute_slam", pan: clamp(this.x / FIELD.wallHalf, -1, 1) });
          }
          this.clawTimer = this.t.clawCD / this.enrageMul;
        }
        return;
      }
      this.clawTimer -= dt;
      if (this.clawTimer <= 0) {
        this.winding = 0.7 / this.enrageMul;
        ctx.tele.warn(this.x, FIELD.wallZ - 0.5, boss ? 4.2 : 2.4, 0xff3030, 0.7 / this.enrageMul);
      }
      return;
    }

    this.clawTimer -= dt;
    if (this.clawTimer <= 0) {
      this.clawTimer = this.t.clawCD;
      ctx.wall.damageAt(this.x, this.t.claw);
      ctx.fx.burst(this.x, 1.0, FIELD.wallZ, 5, 0x6b7280, { speed: 4, up: 3, life: 0.35 });
      ctx.events.emit("SFX", { id: "zombie_claw", pan: clamp(this.x / FIELD.wallHalf, -1, 1) });
    }
  }

  private standoff(dt: number, ctx: Ctx): void {
    this.faceTravel(0, 1);
    if (this.winding > 0) {
      this.winding -= dt;
      if (this.winding <= 0) {
        const tx = clamp(this.x, -FIELD.wallHalf + 1, FIELD.wallHalf - 1);
        ctx.enemies.spawnAcid(this.x, 1.5 * this.t.scale, this.z, tx, FIELD.wallZ, this.t.spitDmg ?? 9);
        ctx.events.emit("SFX", { id: "spit", pan: clamp(this.x / FIELD.wallHalf, -1, 1), gain: distGain(this.z) });
        this.spitTimer = this.t.spitCD ?? 2.7;
      }
      return;
    }
    this.spitTimer -= dt;
    if (this.spitTimer <= 0) {
      this.winding = 0.8;
      ctx.tele.warn(clamp(this.x, -FIELD.wallHalf + 1, FIELD.wallHalf - 1), FIELD.wallZ, 1.7, PAL.acid, 0.8);
    }
  }

  private cross(dt: number, ctx: Ctx): void {
    const spd = this.t.speed * 1.05 * ctx.enemies.speedMul() * this.speedFactor() * this.enrageMul;
    // Vault hop arc as they come over the barricade.
    if (this.vault > 0) {
      this.vault -= dt;
      this.group.position.y = Math.sin((1 - Math.max(0, this.vault) / 0.45) * Math.PI) * 1.2;
    } else if (this.group.position.y !== 0) {
      this.group.position.y = 0;
    }
    const px = ctx.player.x;
    const pz = ctx.player.z;
    const dx = px - this.x;
    const dz = pz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > this.radius + 0.7) {
      const nx = dx / (d || 1);
      const nz = dz / (d || 1);
      this.x += nx * spd * dt;
      this.z += nz * spd * dt;
      this.faceTravel(nx, nz);
    } else {
      this.touchTimer -= dt;
      if (this.touchTimer <= 0 && ctx.player.alive) {
        this.touchTimer = this.t.touchCD;
        const n = d || 1;
        ctx.combat.damagePlayer(this.t.touch, dx / n, dz / n);
        ctx.events.emit("SFX", { id: "zombie_claw" });
      }
    }
  }

  private fleeStep(dt: number): void {
    this.z -= this.t.speed * 1.6 * dt;
    this.faceTravel(0, -1);
    this.fleeFade = Math.max(0, this.fleeFade - dt * 0.6);
    this.bodyMat.transparent = true;
    this.bodyMat.opacity = this.fleeFade;
  }

  private dieStep(dt: number): void {
    this.dieTimer -= dt;
    const f = clamp(this.dieTimer / 0.55, 0, 1);
    this.group.position.y = -1.4 * (1 - f);
    this.group.rotation.z = (1 - f) * this.dieRoll;
    this.group.rotation.x = (1 - f) * this.diePitch;
    this.group.scale.setScalar(0.6 + f * 0.4);
  }

  dispose(): void {
    // The group is a child of the EnemyManager group — remove from its actual
    // parent (scene.remove would be a no-op and leak the meshes).
    this.group.removeFromParent();
    // Geometry + eye material are shared/cached; only free per-instance bits.
    this.bodyMat.dispose();
    this.glow.material.dispose();
    this.bellyGlow?.material.dispose();
    for (const g of this.bossGlows) g.material.dispose();
  }
}

interface Acid {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  tx: number;
  tz: number;
  dmg: number;
  mesh: THREE.Mesh;
}

const ACID_CAP = 24;
const ACID_G = 22;

/** Spawns, ticks and reaps zombies; also owns spitter acid projectiles. */
// Per-instance meshes/state make these awkward to recycle — never pool them.
function poolable(kind: string): boolean {
  // Shielded actors build a per-instance plate; bosses build per-instance eye
  // glows + are singular landmarks — neither should be recycled into the pool
  // (reuse would resurrect a half-built actor / leak the extra sprites).
  return kind !== "shielded" && !TYPES[kind]?.boss;
}
const POOL_CAP = 40;

export class EnemyManager {
  alive: Zombie[] = [];
  boss: Zombie | null = null;
  private acids: Acid[] = [];
  private group = new THREE.Group();
  private screamBuffT = 0;
  /** Recycled actors per type — reused instead of rebuilt to cut GC. */
  private pool: Record<string, Zombie[]> = {};

  /** Total recycled actors across all type pools (smoke/perf introspection). */
  poolSize(): number {
    let n = 0;
    for (const k in this.pool) n += this.pool[k].length;
    return n;
  }

  /** 0..1 boss health, or 0 if no boss is alive. */
  bossFrac(): number {
    return this.boss ? Math.max(0, this.boss.hp / this.boss.maxHp) : 0;
  }
  bossName(): string {
    return this.boss?.title ?? "";
  }
  get bossAlive(): boolean {
    return this.boss !== null && this.boss.killable;
  }

  /** Horde speed multiplier — raised briefly when a screamer screams. */
  speedMul(): number {
    return this.screamBuffT > 0 ? 1.45 : 1;
  }

  triggerScream(x: number, z: number): void {
    this.screamBuffT = 2.5;
    this.ctx.events.emit("SFX", { id: "scream", pan: clamp(x / FIELD.wallHalf, -1, 1), gain: distGain(z) });
    this.ctx.tele.warn(x, z, 4, 0xff3cf0, 0.5);
    this.ctx.fx.burst(x, 1.6, z, 18, 0xff3cf0, { speed: 11, up: 4, life: 0.5, size: 7 });
  }

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    scene.add(this.group);
    const geo = new THREE.SphereGeometry(0.32, 8, 8);
    for (let i = 0; i < ACID_CAP; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: PAL.acid, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.acids.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        tx: 0,
        tz: 0,
        dmg: 0,
        mesh,
      });
    }
  }

  get count(): number {
    return this.alive.length;
  }

  primeTypes(typeKeys: string[]): void {
    for (let i = 0; i < typeKeys.length; i++) {
      this.spawnOne(typeKeys[i], -18 + i * 4, FIELD.spawnZ, true);
    }
  }

  spawn(typeKey: string, x: number, atZ?: number): void {
    this.spawnOne(typeKey, x, atZ, false);
  }

  private spawnOne(typeKey: string, x: number, atZ: number | undefined, quiet: boolean): void {
    const t = TYPES[typeKey];
    if (!t) return;
    let z: Zombie;
    const free = this.pool[typeKey];
    if (free && free.length) {
      z = free.pop() as Zombie;
      z.reinit(this.ctx, x, atZ);
    } else {
      z = new Zombie(t, x, this.ctx, atZ);
    }
    this.group.add(z.group);
    this.alive.push(z);
    if (t.boss) this.boss = z;
    // Spawn tell: a distant groan from the dark — quieter the further out it is.
    if (!quiet && this.ctx.rng.chance(0.35)) {
      this.ctx.events.emit("SFX", { id: "groan", pan: clamp(x / FIELD.wallHalf, -1, 1), gain: distGain(z.z) });
    }
  }

  spawnAcid(x: number, y: number, z: number, tx: number, tz: number, dmg: number): void {
    const a = this.acids.find((p) => !p.active);
    if (!a) return;
    const T = 0.95;
    a.active = true;
    a.x = x;
    a.y = y;
    a.z = z;
    a.tx = tx;
    a.tz = tz;
    a.dmg = dmg;
    a.vx = (tx - x) / T;
    a.vz = (tz - z) / T;
    a.vy = (0.5 * ACID_G * T * T - y) / T;
    a.mesh.visible = true;
    a.mesh.position.set(x, y, z);
  }

  forceFlee(): void {
    for (const z of this.alive) z.flee();
  }

  update(dt: number): void {
    if (this.screamBuffT > 0) this.screamBuffT -= dt;
    // Snapshot the count: a boss can spawn adds mid-update (bossTick → spawn →
    // alive.push); they must wait for next frame, not get an extra update now.
    const n = this.alive.length;
    for (let i = 0; i < n; i++) this.alive[i].update(dt, this.ctx);
    // Reap
    for (let i = this.alive.length - 1; i >= 0; i--) {
      if (this.alive[i].gone) {
        if (this.alive[i] === this.boss) this.boss = null;
        this.release(this.alive[i]);
        this.alive.splice(i, 1);
      }
    }
    this.updateAcids(dt);
  }

  private updateAcids(dt: number): void {
    for (const a of this.acids) {
      if (!a.active) continue;
      a.vy -= ACID_G * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.z += a.vz * dt;
      a.mesh.position.set(a.x, a.y, a.z);
      this.ctx.fx.burst(a.x, a.y, a.z, 1, PAL.acid, { speed: 1, up: 0.5, life: 0.3, size: 4 });
      if (a.y <= 0.1) {
        a.active = false;
        a.mesh.visible = false;
        this.ctx.fx.burst(a.x, 0.2, a.z, 16, PAL.acid, { speed: 7, up: 4, life: 0.5, size: 6 });
        this.ctx.events.emit("SFX", { id: "acid_hit", pan: clamp(a.x / FIELD.wallHalf, -1, 1) });
        if (this.ctx.wall.isBrokenAt(a.x)) {
          // No wall here — splash the defender if they're close.
          const p = this.ctx.player;
          const d = Math.hypot(p.x - a.x, p.z - a.z);
          if (d < 2.4 && p.alive) this.ctx.combat.damagePlayer(a.dmg, 0, 1);
        } else {
          this.ctx.wall.damageAt(a.x, a.dmg);
        }
      }
    }
  }

  /** Recycle a dead/gone actor into its type pool, or dispose if the pool is
   * full or the type isn't poolable. */
  private release(z: Zombie): void {
    z.group.removeFromParent();
    const list = (this.pool[z.kind] ??= []);
    if (poolable(z.kind) && list.length < POOL_CAP) {
      z.group.visible = false;
      list.push(z);
    } else {
      z.dispose();
    }
  }

  clear(): void {
    for (const z of this.alive) this.release(z);
    this.alive.length = 0;
    this.boss = null;
    for (const a of this.acids) {
      a.active = false;
      a.mesh.visible = false;
    }
  }
}
