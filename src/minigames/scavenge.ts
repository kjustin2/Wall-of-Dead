import * as THREE from "three";
import type { Ctx } from "../game/ctx";
import { makeGlow } from "../render/textures";
import { clamp } from "../core/math";

const DURATION = 26;
const AREA = { minX: -26, maxX: 26, minZ: -44, maxZ: -4 };
const AV_SPEED = 13;
const CRATES = 8;

export type Tier = "S" | "A" | "B" | "C" | "D";

export function tierFromFrac(f: number): Tier {
  if (f >= 0.9) return "S";
  if (f >= 0.72) return "A";
  if (f >= 0.52) return "B";
  if (f >= 0.3) return "C";
  return "D";
}

interface Crate {
  group: THREE.Group;
  x: number;
  z: number;
  got: boolean;
  gold: boolean;
}
interface Chaser {
  group: THREE.Group;
  ring: THREE.Mesh;
  x: number;
  z: number;
  speed: number;
}

const AMBER = 0xffb24a;
const THREAT = 0xff4030;

/**
 * The day "Supply Run": a top-down dash through the field grabbing crates under
 * a clock while zombies prowl. Objective is made obvious — each crate throws a
 * pulsing pillar of light + a ground ring; threats wear red danger rings; the
 * playable area is outlined. Returns { tier, frac } → loot.
 */
export class Scavenge {
  active = false;
  done = false;
  got = 0;
  total = CRATES;
  timeLeft = DURATION;
  stamina = 1;

  private group = new THREE.Group();
  private avatar = new THREE.Group();
  private avatarLight: THREE.PointLight;
  private ax = 0;
  private az = -8;
  private crates: Crate[] = [];
  private chasers: Chaser[] = [];
  private invuln = 0;
  private t = 0;
  private tmp = new THREE.Vector2();

  // Shared pulsing materials
  private beamMat: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private threatMat: THREE.MeshBasicMaterial;
  private beamGeo = new THREE.CylinderGeometry(0.85, 0.22, 7, 10, 1, true);
  private ringGeo = new THREE.RingGeometry(0.85, 1.12, 30);
  private crateGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
  private threatRingGeo = new THREE.RingGeometry(0.9, 1.15, 28);

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    this.beamMat = new THREE.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.threatMat = new THREE.MeshBasicMaterial({
      color: THREAT,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.buildAvatar();
    this.avatarLight = new THREE.PointLight(0x9fd8ff, 4, 16, 2);
    this.avatarLight.position.set(0, 4.5, 0);
    this.avatar.add(this.avatarLight);
    this.group.add(this.avatar);

    this.buildBoundary();

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
    head.castShadow = true;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.46), dark);
    helmet.position.y = 1.95;
    for (const lx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), dark);
      leg.position.set(lx, 0.42, 0);
      this.avatar.add(leg);
    }
    this.avatar.add(torso, pack, head, helmet, makeGlow(0x6fc3ff, 3, 0.5));
  }

  private buildBoundary(): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x5fd0ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const w = AREA.maxX - AREA.minX;
    const d = AREA.maxZ - AREA.minZ;
    const cx = (AREA.minX + AREA.maxX) / 2;
    const cz = (AREA.minZ + AREA.maxZ) / 2;
    const edges: [number, number, number, number][] = [
      [cx, AREA.minZ, w, 0.18],
      [cx, AREA.maxZ, w, 0.18],
      [AREA.minX, cz, 0.18, d],
      [AREA.maxX, cz, 0.18, d],
    ];
    for (const [ex, ez, ew, ed] of edges) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.08, ed), mat);
      bar.position.set(ex, 0.05, ez);
      this.group.add(bar);
    }
    // Corner posts with glow
    for (const px of [AREA.minX, AREA.maxX])
      for (const pz of [AREA.minZ, AREA.maxZ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), mat);
        post.position.set(px, 1, pz);
        this.group.add(post);
        const g = makeGlow(0x5fd0ff, 1.6, 0.5);
        g.position.set(px, 2.2, pz);
        this.group.add(g);
      }
  }

  private makeCrate(x: number, z: number, gold: boolean): Crate {
    const g = new THREE.Group();
    const tint = gold ? 0xc8961e : 0x8a5a1a;
    const beacon = gold ? 0xffd84a : AMBER;
    const box = new THREE.Mesh(
      this.crateGeo,
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, emissive: new THREE.Color(gold ? 0x5a3a00 : 0x3a2400), flatShading: true })
    );
    box.position.y = 0.5;
    box.castShadow = true;
    if (gold) box.scale.setScalar(1.15);
    g.add(box);
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xffcf6a, emissive: new THREE.Color(beacon), emissiveIntensity: 0.9 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.16), crossMat);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.6), crossMat);
    c1.position.y = 1.0;
    c2.position.y = 1.0;
    g.add(c1, c2);
    const beam = new THREE.Mesh(this.beamGeo, gold ? this.beamMat.clone() : this.beamMat);
    if (gold) (beam.material as THREE.MeshBasicMaterial).color.set(beacon);
    beam.position.y = 3.6;
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    const glow = makeGlow(beacon, gold ? 3.4 : 2.6, 0.7);
    glow.position.y = 1.1;
    g.add(beam, ring, glow);
    g.position.set(x, 0, z);
    this.group.add(g);
    return { group: g, x, z, got: false, gold };
  }

  private makeChaser(speed: number): Chaser {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 1, flatShading: true })
    );
    body.position.y = 0.9;
    body.rotation.x = 0.2;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.44, 0.44),
      new THREE.MeshStandardMaterial({ color: 0x495a3c, roughness: 1, flatShading: true })
    );
    head.position.set(0, 1.55, 0.15);
    const eyeMat = new THREE.MeshBasicMaterial({ color: THREAT, fog: false });
    for (const ex of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
      eye.position.set(ex, 1.58, 0.36);
      g.add(eye);
    }
    g.add(body, head, makeGlow(THREAT, 1.5, 0.55));
    const ring = new THREE.Mesh(this.threatRingGeo, this.threatMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    this.group.add(g);
    return { group: g, ring, x: 0, z: AREA.minZ - 2, speed };
  }

  start(): void {
    this.active = true;
    this.done = false;
    this.got = 0;
    this.timeLeft = DURATION;
    this.invuln = 0;
    this.ax = 0;
    this.az = -8;
    this.group.visible = true;

    for (const c of this.crates) this.group.remove(c.group);
    this.crates = [];
    this.stamina = 1;
    for (let i = 0; i < CRATES; i++) {
      const x = this.ctx.rng.range(AREA.minX + 3, AREA.maxX - 3);
      const z = this.ctx.rng.range(AREA.minZ + 3, AREA.maxZ - 6);
      this.crates.push(this.makeCrate(x, z, i < 2)); // first two are gold (bonus)
    }

    for (const c of this.chasers) this.group.remove(c.group);
    this.chasers = [];
    for (let i = 0; i < 3; i++) {
      const c = this.makeChaser(6.5 + i * 0.6);
      c.x = this.ctx.rng.range(AREA.minX + 2, AREA.maxX - 2);
      c.group.position.set(c.x, 0, c.z);
      this.chasers.push(c);
    }

    this.ctx.cam.mode = "topdown";
    this.ctx.cam.target.set(this.ax, 0, this.az);
    this.ctx.cam.snap();
  }

  update(dt: number): void {
    if (!this.active || this.done) return;
    this.t += dt;
    this.timeLeft -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    // Pulse the beacons + threat rings
    const pulse = 0.5 + Math.sin(this.t * 5) * 0.3;
    this.beamMat.opacity = 0.14 + pulse * 0.16;
    this.ringMat.opacity = 0.4 + pulse * 0.35;
    this.threatMat.opacity = 0.35 + (0.5 + Math.sin(this.t * 9) * 0.5) * 0.4;

    // Move avatar (hold Shift to sprint while stamina lasts)
    const a = this.ctx.input.axis(this.tmp);
    const moving = a.x !== 0 || a.y !== 0;
    const sprint = this.ctx.input.down("ShiftLeft") && this.stamina > 0.05 && moving;
    if (sprint) this.stamina = Math.max(0, this.stamina - dt * 0.5);
    else this.stamina = Math.min(1, this.stamina + dt * 0.35);
    const sp = sprint ? AV_SPEED * 1.6 : AV_SPEED;
    this.ax = clamp(this.ax + a.x * sp * dt, AREA.minX, AREA.maxX);
    this.az = clamp(this.az + a.y * sp * dt, AREA.minZ, AREA.maxZ);
    this.avatar.position.set(this.ax, 0, this.az);
    if (a.x || a.y) this.avatar.rotation.y = Math.atan2(a.x, a.y);

    // Grab crates
    for (const c of this.crates) {
      if (c.got) continue;
      // Slow spin of the crate's beacon ring for life
      c.group.rotation.y += dt * 0.6;
      const dx = c.x - this.ax;
      const dz = c.z - this.az;
      if (dx * dx + dz * dz < 2.6) {
        c.got = true;
        c.group.visible = false;
        this.got++;
        if (c.gold) {
          this.ctx.stats.cratesGrabbed += 1; // gold is worth an extra supply
          this.ctx.floaters.spawn(c.x, 1.7, c.z, "+2 SUPPLY", "crit");
          this.ctx.fx.burst(c.x, 1.0, c.z, 26, 0xffd84a, { speed: 9, up: 7, life: 0.6, size: 8 });
        } else {
          this.ctx.floaters.spawn(c.x, 1.6, c.z, "+SUPPLY", "heal");
          this.ctx.fx.burst(c.x, 0.9, c.z, 16, AMBER, { speed: 7, up: 5, life: 0.5 });
        }
        this.ctx.events.emit("CRATE_GRABBED", { got: this.got, total: this.total });
        this.ctx.events.emit("SFX", { id: "pickup" });
      }
    }

    // Chasers seek
    for (const c of this.chasers) {
      const dx = this.ax - c.x;
      const dz = this.az - c.z;
      const d = Math.hypot(dx, dz) || 1;
      c.x += (dx / d) * c.speed * dt;
      c.z += (dz / d) * c.speed * dt;
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = Math.atan2(dx, dz);
      if (d < 1.5 && this.invuln <= 0) {
        this.invuln = 1.0;
        this.got = Math.max(0, this.got - 1);
        this.ax = clamp(this.ax - (dx / d) * 4, AREA.minX, AREA.maxX);
        this.az = clamp(this.az - (dz / d) * 4, AREA.minZ, AREA.maxZ);
        this.ctx.cam.addTrauma(0.4);
        this.ctx.stage.punch(0.3);
        this.ctx.floaters.spawn(this.ax, 2, this.az, "CAUGHT!", "warn");
        this.ctx.events.emit("SFX", { id: "player_hurt" });
      }
    }

    this.ctx.cam.target.set(this.ax, 0, this.az);
    if (this.timeLeft <= 0 || this.got >= this.total) this.finish();
  }

  private finish(): void {
    this.done = true;
    this.active = false;
    this.timeLeft = Math.max(0, this.timeLeft);
    this.ctx.stats.cratesGrabbed += this.got;
    const frac = this.got / this.total;
    this.ctx.events.emit("DAY_DONE", { tier: tierFromFrac(frac), frac });
  }

  private nearest = new THREE.Vector3();
  /** World position of the nearest uncollected crate, or null. (For the compass.) */
  nearestCratePos(): THREE.Vector3 | null {
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
    if (!best) return null;
    return this.nearest.set(best.x, 1, best.z);
  }

  /** Smoke-test helper: instantly finish a successful run. */
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
}
