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
  mesh: THREE.Group;
  x: number;
  z: number;
  got: boolean;
}
interface Chaser {
  mesh: THREE.Group;
  x: number;
  z: number;
  speed: number;
}

/**
 * The day "Supply Run": a top-down dash through the foggy field grabbing crates
 * under a clock while a few zombies prowl. Self-contained — its own avatar,
 * crates and chasers; returns a { tier, frac } the day flow turns into loot.
 */
export class Scavenge {
  active = false;
  done = false;
  got = 0;
  total = CRATES;
  timeLeft = DURATION;

  private group = new THREE.Group();
  private avatar = new THREE.Group();
  private ax = 0;
  private az = -8;
  private crates: Crate[] = [];
  private chasers: Chaser[] = [];
  private invuln = 0;
  private tmp = new THREE.Vector2();

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    // Avatar
    const coat = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 1, flatShading: true });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.45), coat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 1, flatShading: true })
    );
    head.position.y = 1.7;
    this.avatar.add(torso, head, makeGlow(0x6fc3ff, 3, 0.5));
    this.group.add(this.avatar);
    this.group.visible = false;
    scene.add(this.group);
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

    // Crates
    for (const c of this.crates) this.group.remove(c.mesh);
    this.crates = [];
    for (let i = 0; i < CRATES; i++) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x8a5a1a, roughness: 0.8, emissive: new THREE.Color(0x3a2400), flatShading: true })
      );
      box.position.y = 0.5;
      box.castShadow = true;
      g.add(box, makeGlow(0xffb24a, 2.4, 0.6));
      const x = this.ctx.rng.range(AREA.minX + 3, AREA.maxX - 3);
      const z = this.ctx.rng.range(AREA.minZ + 3, AREA.maxZ - 6);
      g.position.set(x, 0, z);
      this.group.add(g);
      this.crates.push({ mesh: g, x, z, got: false });
    }

    // Chasers
    for (const c of this.chasers) this.group.remove(c.mesh);
    this.chasers = [];
    const n = 3;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.3, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 1, flatShading: true })
      );
      body.position.y = 0.9;
      body.castShadow = true;
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xff5a3c, fog: false })
      );
      eye.position.set(0, 1.5, 0.25);
      g.add(body, eye);
      const x = this.ctx.rng.range(AREA.minX + 2, AREA.maxX - 2);
      g.position.set(x, 0, AREA.minZ - 2);
      this.group.add(g);
      this.chasers.push({ mesh: g, x, z: AREA.minZ - 2, speed: 6.5 + i * 0.6 });
    }

    this.ctx.cam.mode = "topdown";
    this.ctx.cam.target.set(this.ax, 0, this.az);
    this.ctx.cam.snap();
  }

  update(dt: number): void {
    if (!this.active || this.done) return;
    this.timeLeft -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    // Move avatar
    const a = this.ctx.input.axis(this.tmp);
    this.ax = clamp(this.ax + a.x * AV_SPEED * dt, AREA.minX, AREA.maxX);
    this.az = clamp(this.az + a.y * AV_SPEED * dt, AREA.minZ, AREA.maxZ);
    this.avatar.position.set(this.ax, 0, this.az);
    if (a.x || a.y) this.avatar.rotation.y = Math.atan2(a.x, a.y);

    // Grab crates
    for (const c of this.crates) {
      if (c.got) continue;
      const dx = c.x - this.ax;
      const dz = c.z - this.az;
      if (dx * dx + dz * dz < 2.6) {
        c.got = true;
        c.mesh.visible = false;
        this.got++;
        this.ctx.floaters.spawn(c.x, 1.5, c.z, "+SUPPLY", "heal");
        this.ctx.fx.burst(c.x, 0.8, c.z, 14, 0xffb24a, { speed: 6, up: 5, life: 0.5 });
        this.ctx.events.emit("CRATE_GRABBED", { got: this.got, total: this.total });
        this.ctx.events.emit("SFX", { id: "crate" });
      }
    }

    // Chasers seek the avatar
    for (const c of this.chasers) {
      const dx = this.ax - c.x;
      const dz = this.az - c.z;
      const d = Math.hypot(dx, dz) || 1;
      c.x += (dx / d) * c.speed * dt;
      c.z += (dz / d) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = Math.atan2(dx, dz);
      if (d < 1.5 && this.invuln <= 0) {
        // Caught — drop a supply, get shoved back.
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
