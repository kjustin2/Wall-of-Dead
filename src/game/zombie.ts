import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Ctx } from "./ctx";
import { FIELD, PAL } from "../config";
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
}

export const TYPES: Record<string, ZType> = {
  shambler: {
    key: "shambler",
    hp: 30,
    speed: 3.0,
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
};

type State = "advancing" | "attacking" | "standoff" | "crossing" | "dying" | "fleeing";

let NEXT_ID = 1;

// Per-type geometry is built once and shared across all zombies of that type:
// the whole body is merged into a single BufferGeometry (one draw call) + a tiny
// eyes geometry. This slashes draw calls (~24 meshes → 2) and per-spawn GC.
const bodyGeoCache: Record<string, THREE.BufferGeometry> = {};
const eyeGeoCache: Record<string, THREE.BufferGeometry> = {};
const eyeMatCache: Record<string, THREE.MeshBasicMaterial> = {};

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

function buildZombieGeo(t: ZType): { body: THREE.BufferGeometry; eyes: THREE.BufferGeometry } {
  if (bodyGeoCache[t.key]) return { body: bodyGeoCache[t.key], eyes: eyeGeoCache[t.key] };
  const s = t.scale;
  const lean = t.key === "runner" ? 0.32 : t.key === "brute" ? 0.1 : 0.2;
  const p: THREE.BufferGeometry[] = [
    box(0.78 * s, 1.15 * s, 0.5 * s, 0, 0.95 * s, 0, lean),
    box(0.92 * s, 0.34 * s, 0.5 * s, 0, 1.42 * s, 0.12 * s, lean),
    box(0.46 * s, 0.46 * s, 0.48 * s, 0, 1.62 * s, 0.18 * s),
    box(0.34 * s, 0.16 * s, 0.3 * s, 0, 1.45 * s, 0.34 * s),
    box(0.72 * s, 0.5 * s, 0.06 * s, 0, 0.5 * s, 0.28 * s, 0.3),
  ];
  for (const ax of [-0.52, 0.52]) {
    p.push(box(0.2 * s, 0.92 * s, 0.2 * s, ax * s, 1.0 * s, 0.42 * s, -1.1));
    p.push(box(0.2 * s, 0.2 * s, 0.24 * s, ax * s, 0.58 * s, 0.92 * s));
    for (const fx of [-0.06, 0, 0.06]) p.push(box(0.04 * s, 0.04 * s, 0.18 * s, (ax + fx) * s, 0.56 * s, 1.08 * s, 0.5));
  }
  for (const lx of [-0.22, 0.22]) {
    p.push(box(0.24 * s, 0.85 * s, 0.24 * s, lx * s, 0.42 * s, 0));
    p.push(box(0.26 * s, 0.14 * s, 0.42 * s, lx * s, 0.07 * s, 0.12 * s));
  }
  if (t.key === "brute") {
    for (const sx of [-0.6, 0.6]) p.push(box(0.42 * s, 0.42 * s, 0.6 * s, sx * s, 1.5 * s, 0.1 * s));
    p.push(box(0.7 * s, 0.7 * s, 0.25 * s, 0, 1.2 * s, -0.3 * s));
  } else if (t.key === "spitter") {
    p.push(ball(0.42 * s, 0, 1.1 * s, -0.34 * s));
  }
  const body = mergeGeometries(p, false) as THREE.BufferGeometry;
  for (const g of p) g.dispose();
  const eyes = mergeGeometries([ball(0.1 * s, -0.12 * s, 1.66 * s, 0.42 * s), ball(0.1 * s, 0.12 * s, 1.66 * s, 0.42 * s)], false) as THREE.BufferGeometry;
  bodyGeoCache[t.key] = body;
  eyeGeoCache[t.key] = eyes;
  eyeMatCache[t.key] = new THREE.MeshBasicMaterial({ color: t.eye, fog: false });
  return { body, eyes };
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
  private targetX: number;
  private clawTimer = 0;
  private touchTimer = 0;
  private spitTimer: number;
  private winding = 0; // brute slam / spit wind-up remaining
  private dieTimer = 0;
  private fleeFade = 1;
  private bob: number;
  private hitFlash = 0;

  constructor(t: ZType, x: number, ctx: Ctx) {
    this.t = t;
    this.kind = t.key;
    this.hp = t.hp;
    this.maxHp = t.hp;
    this.radius = t.radius;
    this.heavy = t.heavy;
    this.headshotChance = t.headshotChance;
    this.x = x;
    this.z = FIELD.spawnZ + ctx.rng.range(-FIELD.spawnZJitter, 0);
    this.targetX = x;
    this.spitTimer = t.spitCD ?? 2.5;
    this.bob = ctx.rng.range(0, Math.PI * 2);
    this.headY = 1.7 * t.scale;

    const s = t.scale;
    const geo = buildZombieGeo(t);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: t.body,
      roughness: 1,
      flatShading: true,
      emissive: new THREE.Color(0x000000),
    });
    this.body = new THREE.Mesh(geo.body, this.bodyMat);
    this.body.castShadow = true;
    this.group.add(this.body);
    const eyes = new THREE.Mesh(geo.eyes, eyeMatCache[t.key]);
    this.group.add(eyes);
    this.glow = makeGlow(t.eye, 1.7 * s, 0.6);
    this.glow.position.set(0, 1.66 * s, 0.4 * s);
    this.group.add(this.glow);

    this.group.position.set(this.x, 0, this.z);
  }

  get killable(): boolean {
    return this.state !== "dying" && this.hp > 0;
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
  }

  flee(): void {
    if (this.state === "dying") return;
    this.state = "fleeing";
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
    // Hit flash decay
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = Math.max(0, this.hitFlash) / 0.12;
      this.bodyMat.emissive.setRGB(f, f, f);
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
  }

  private faceTravel(dx: number, dz: number): void {
    if (dx || dz) this.group.rotation.y = Math.atan2(dx, dz);
  }

  private advance(dt: number, ctx: Ctx): void {
    if (this.t.targetsPlayer && ctx.player.alive) {
      this.targetX = clamp(ctx.player.x, -FIELD.wallHalf + 1, FIELD.wallHalf - 1);
    }
    const goalZ = this.t.standoff ? this.t.standoffZ! : FIELD.attackZ;
    const dx = clamp(this.targetX - this.x, -1, 1);
    const dz = 1;
    this.x += dx * this.t.speed * 0.5 * dt;
    this.z += dz * this.t.speed * dt;
    this.faceTravel(dx, dz);

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

    if (this.t.slam) {
      // Telegraphed heavy slam
      if (this.winding > 0) {
        this.winding -= dt;
        if (this.winding <= 0) {
          ctx.wall.damageAt(this.x, this.t.claw * 1.4);
          ctx.fx.burst(this.x, 1.2, FIELD.wallZ, 14, 0x8899aa, { speed: 9, up: 6, life: 0.5 });
          ctx.cam.addTrauma(0.18);
          ctx.events.emit("SFX", { id: "brute_slam", pan: clamp(this.x / FIELD.wallHalf, -1, 1) });
          this.clawTimer = this.t.clawCD;
        }
        return;
      }
      this.clawTimer -= dt;
      if (this.clawTimer <= 0) {
        this.winding = 0.7;
        ctx.tele.warn(this.x, FIELD.wallZ - 0.5, 2.4, 0xff3030, 0.7);
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
        ctx.events.emit("SFX", { id: "spit", pan: clamp(this.x / FIELD.wallHalf, -1, 1) });
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
    const px = ctx.player.x;
    const pz = ctx.player.z;
    const dx = px - this.x;
    const dz = pz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > this.radius + 0.7) {
      const nx = dx / (d || 1);
      const nz = dz / (d || 1);
      this.x += nx * this.t.speed * 1.05 * dt;
      this.z += nz * this.t.speed * 1.05 * dt;
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
    this.group.rotation.z = (1 - f) * 1.3;
    this.group.scale.setScalar(0.6 + f * 0.4);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    // Geometry + eye material are shared/cached; only free per-instance bits.
    this.bodyMat.dispose();
    this.glow.material.dispose();
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
export class EnemyManager {
  alive: Zombie[] = [];
  private acids: Acid[] = [];
  private group = new THREE.Group();

  constructor(private ctx: Ctx, private scene: THREE.Scene) {
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

  spawn(typeKey: string, x: number): void {
    const t = TYPES[typeKey];
    if (!t) return;
    const z = new Zombie(t, x, this.ctx);
    this.group.add(z.group);
    this.alive.push(z);
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
    for (const z of this.alive) z.update(dt, this.ctx);
    // Reap
    for (let i = this.alive.length - 1; i >= 0; i--) {
      if (this.alive[i].gone) {
        this.alive[i].dispose(this.scene);
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

  clear(): void {
    for (const z of this.alive) z.dispose(this.scene);
    this.alive.length = 0;
    for (const a of this.acids) {
      a.active = false;
      a.mesh.visible = false;
    }
  }
}
