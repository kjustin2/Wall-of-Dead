import * as THREE from "three";
import type { Ctx } from "../game/ctx";
import { makeGlow } from "../render/textures";
import { clamp } from "../core/math";

const DURATION = 55;
const AREA = { minX: -28, maxX: 28, minZ: -46, maxZ: -3 };
const SNEAK = 6.2;
const SPRINT = 11.5;
const CRATES = 7;
const AV_R = 0.6;
const VISION_RANGE = 15;
const CONE_HALF = 0.52; // radians, half-angle of a guard's sight cone

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
}
interface Guard {
  group: THREE.Group;
  cone: THREE.Mesh;
  coneMat: THREE.MeshBasicMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  facing: number;
  patrol: { x: number; z: number }[];
  pIdx: number;
  state: "patrol" | "chase";
  alertT: number;
  speed: number;
}

const AMBER = 0xffb24a;
const THREAT = 0xff4030;

// Static maze-ish layout (corners to break line of sight). Concrete barriers
// plus a couple of wrecked cars — all solid cover.
const WALLS: Wall[] = [
  { x: -10, z: -15, w: 16, d: 1.4 },
  { x: 9, z: -13, w: 1.4, d: 12 },
  { x: -2, z: -28, w: 18, d: 1.4 },
  { x: 16, z: -30, w: 1.4, d: 20 },
  { x: -17, z: -27, w: 1.4, d: 18 },
  { x: 3, z: -41, w: 14, d: 1.4 },
  { x: -22, z: -40, w: 10, d: 1.4 },
  { x: -6, z: -21, w: 2.4, d: 4.6, car: true },
  { x: 12, z: -38, w: 4.6, d: 2.4, car: true },
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
  spotted = false;

  private group = new THREE.Group();
  private avatar = new THREE.Group();
  private light: THREE.SpotLight;
  private ax = 0;
  private az = -7;
  private crates: Crate[] = [];
  private guards: Guard[] = [];
  private t = 0;
  private tmp = new THREE.Vector2();
  private coneGeo: THREE.BufferGeometry;
  private nearest = new THREE.Vector3();

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    this.buildAvatar();
    this.light = new THREE.SpotLight(0xfff0d0, 18, 26, 0.62, 0.5, 1.0);
    this.light.position.set(0, 3.5, 0);
    this.light.target.position.set(0, -1, 10); // local +Z = the way the avatar faces
    this.avatar.add(this.light);
    this.avatar.add(this.light.target);
    this.avatar.add(makeGlow(0x6fc3ff, 2.4, 0.5));
    this.group.add(this.avatar);

    this.buildWalls();
    this.buildBoundary();

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

  private buildWalls(): void {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 1, flatShading: true });
    const cap = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 1, flatShading: true });
    const rust = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.8, metalness: 0.3, flatShading: true });
    const tire = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1 });
    for (const w of WALLS) {
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
        this.group.add(car);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, 1.8, w.d), concrete);
        m.position.set(w.x, 0.9, w.z);
        m.castShadow = true;
        m.receiveShadow = true;
        const top = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.1, 0.25, w.d + 0.1), cap);
        top.position.set(w.x, 1.85, w.z);
        this.group.add(m, top);
      }
    }
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
    for (const w of WALLS) {
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

  private makeCrate(x: number, z: number, gold: boolean): Crate {
    const g = new THREE.Group();
    const tint = gold ? 0xc8961e : 0x8a5a1a;
    const beacon = gold ? 0xffd84a : AMBER;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, emissive: new THREE.Color(gold ? 0x4a3000 : 0x2a1c00), flatShading: true })
    );
    box.position.y = 0.45;
    box.castShadow = true;
    g.add(box, makeGlow(beacon, gold ? 2.2 : 1.7, 0.6));
    g.position.set(x, 0, z);
    this.group.add(g);
    return { group: g, x, z, got: false, gold };
  }

  private makeGuard(): Guard {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 1, flatShading: true })
    );
    body.position.y = 0.9;
    body.rotation.x = 0.18;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.44, 0.44),
      new THREE.MeshStandardMaterial({ color: 0x495a3c, roughness: 1, flatShading: true })
    );
    head.position.set(0, 1.55, 0.15);
    const eyeMat = new THREE.MeshBasicMaterial({ color: AMBER, fog: false });
    for (const ex of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
      eye.position.set(ex, 1.58, 0.36);
      g.add(eye);
    }
    g.add(body, head);
    const coneMat = new THREE.MeshBasicMaterial({
      color: AMBER,
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
    for (let i = 0; i < 3; i++) patrol.push(this.freeSpot(AREA.minZ + 2, AREA.maxZ - 8));
    return { group: g, cone, coneMat, eyeMat, x: patrol[0].x, z: patrol[0].z, facing: 0, patrol, pIdx: 1, state: "patrol", alertT: 0, speed: 3 };
  }

  start(): void {
    this.active = true;
    this.done = false;
    this.got = 0;
    this.timeLeft = DURATION;
    this.stamina = 1;
    this.spotted = false;
    this.ax = 0;
    this.az = -7;
    this.group.visible = true;
    this.ctx.world.setDawn(0.12); // dark, moody — not the bright dawn

    for (const c of this.crates) this.group.remove(c.group);
    this.crates = [];
    for (let i = 0; i < CRATES; i++) {
      const s = this.freeSpot(AREA.minZ + 3, AREA.maxZ - 10);
      this.crates.push(this.makeCrate(s.x, s.z, i < 2));
    }

    for (const g of this.guards) this.group.remove(g.group);
    this.guards = [];
    for (let i = 0; i < 4; i++) {
      const g = this.makeGuard();
      g.group.position.set(g.x, 0, g.z);
      this.guards.push(g);
    }

    this.ctx.cam.mode = "topdown";
    this.ctx.cam.target.set(this.ax, 0, this.az);
    this.ctx.cam.snap();
  }

  update(dt: number): void {
    if (!this.active || this.done) return;
    this.t += dt;
    this.timeLeft -= dt;

    // Move (sneak, or sprint while stamina holds)
    const a = this.ctx.input.axis(this.tmp);
    const moving = a.x !== 0 || a.y !== 0;
    const sprint = this.ctx.input.down("ShiftLeft") && this.stamina > 0.05 && moving;
    this.stamina = sprint ? Math.max(0, this.stamina - dt * 0.55) : Math.min(1, this.stamina + dt * 0.3);
    const sp = sprint ? SPRINT : SNEAK;
    let nx = this.ax + a.x * sp * dt;
    let nz = this.az + a.y * sp * dt;
    nx = clamp(nx, AREA.minX, AREA.maxX);
    nz = clamp(nz, AREA.minZ, AREA.maxZ);
    for (const w of WALLS) [nx, nz] = pushOutAABB(nx, nz, AV_R, w);
    this.ax = nx;
    this.az = nz;
    this.avatar.position.set(this.ax, 0, this.az);
    if (moving) {
      this.avatar.rotation.y = Math.atan2(a.x, a.y);
    }

    // Guards
    let anyChase = false;
    for (const g of this.guards) this.updateGuard(g, dt);
    for (const g of this.guards) if (g.state === "chase") anyChase = true;
    if (anyChase && !this.spotted) {
      this.spotted = true;
      this.ctx.events.emit("SFX", { id: "scream" });
      this.ctx.stage.punch(0.3);
      this.ctx.cam.addTrauma(0.3);
    } else if (!anyChase) {
      this.spotted = false;
    }

    // Grab crates
    for (const c of this.crates) {
      if (c.got) continue;
      c.group.rotation.y += dt * 0.5;
      const dx = c.x - this.ax;
      const dz = c.z - this.az;
      if (dx * dx + dz * dz < 2.4) {
        c.got = true;
        c.group.visible = false;
        this.got++;
        if (c.gold) {
          this.ctx.stats.cratesGrabbed += 1;
          this.ctx.floaters.spawn(c.x, 1.6, c.z, "+2 SUPPLY", "crit");
          this.ctx.fx.burst(c.x, 1.0, c.z, 22, 0xffd84a, { speed: 8, up: 6, life: 0.6, size: 7 });
        } else {
          this.ctx.floaters.spawn(c.x, 1.5, c.z, "+SUPPLY", "heal");
          this.ctx.fx.burst(c.x, 0.9, c.z, 12, AMBER, { speed: 6, up: 5, life: 0.5 });
        }
        this.ctx.events.emit("CRATE_GRABBED", { got: this.got, total: this.total });
        this.ctx.events.emit("SFX", { id: "pickup" });
      }
    }

    this.ctx.cam.target.set(this.ax, 0, this.az);
    if (this.timeLeft <= 0 || this.got >= this.total) this.finish();
  }

  private losBlocked(ax: number, az: number, bx: number, bz: number): boolean {
    for (const w of WALLS) if (segAABB(ax, az, bx, bz, w)) return true;
    return false;
  }

  /** Distance to the first wall along `facing` (so the cone stops at cover). */
  private coneDist(gx: number, gz: number, facing: number): number {
    const bx = gx + Math.sin(facing) * VISION_RANGE;
    const bz = gz + Math.cos(facing) * VISION_RANGE;
    let best = VISION_RANGE;
    for (const w of WALLS) {
      const t = segEntryT(gx, gz, bx, bz, w);
      if (t !== Infinity) best = Math.min(best, t * VISION_RANGE);
    }
    return Math.max(2, best);
  }

  private updateGuard(g: Guard, dt: number): void {
    // Detection: in range, within the cone, and not behind a wall
    const dx = this.ax - g.x;
    const dz = this.az - g.z;
    const dist = Math.hypot(dx, dz);
    let sees = false;
    if (dist < VISION_RANGE) {
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
      g.alertT -= dt;
      if (g.alertT <= 0) g.state = "patrol";
    }

    let tx: number;
    let tz: number;
    let speed: number;
    if (g.state === "chase") {
      tx = this.ax;
      tz = this.az;
      speed = 8.2;
      // Caught — the run ends right here.
      if (dist < 1.4) {
        this.ctx.floaters.spawn(this.ax, 2, this.az, "CAUGHT!", "warn");
        this.ctx.events.emit("SFX", { id: "player_hurt" });
        this.ctx.cam.addTrauma(0.5);
        this.ctx.stage.punch(0.45);
        this.finish();
        return;
      }
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
    g.facing = Math.atan2(mdx, mdz);
    g.group.position.set(g.x, 0, g.z);
    g.group.rotation.y = g.facing;

    // Cone visual: amber when patrolling, red + brighter when hunting; clipped
    // to the nearest wall so it visibly stops at cover (matches the LoS check).
    const hunting = g.state === "chase";
    const cd = this.coneDist(g.x, g.z, g.facing);
    g.cone.scale.set(1, 1, cd / VISION_RANGE);
    g.coneMat.color.set(hunting ? THREAT : AMBER);
    g.coneMat.opacity = hunting ? 0.28 : 0.14;
    g.eyeMat.color.set(hunting ? THREAT : AMBER);
  }

  private nearestCrate(): Crate | null {
    let best: Crate | null = null;
    let bestD = Infinity;
    for (const c of this.crates) {
      if (c.got) continue;
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
  }

  get visible(): boolean {
    return this.group.visible;
  }
}
