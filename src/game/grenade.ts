import * as THREE from "three";
import type { Ctx } from "./ctx";

const G = 22;
const RADIUS = 12;
const POOL = 4;

interface Nade {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mesh: THREE.Group;
  blink: THREE.Mesh;
}

/**
 * The Last Stand payoff: a thrown frag grenade. It arcs from the defender to the
 * aim point, lands, and detonates — a radial blast that damages and knocks back
 * everything nearby, with a light flash + expanding shockwave ring. Spending the
 * Adrenaline meter is what lets you cook one off (see main.ts doLastStand).
 */
export class GrenadeManager {
  private pool: Nade[] = [];
  private group = new THREE.Group();
  private flash: THREE.PointLight;
  private flashT = 0;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private ringT = 0;
  private t = 0;

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    scene.add(this.group);
    const geo = new THREE.SphereGeometry(0.22, 10, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0x20241c, roughness: 0.6, metalness: 0.4, flatShading: true });
    for (let i = 0; i < POOL; i++) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(geo, mat);
      const blink = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3030, fog: false }));
      blink.position.set(0, 0.2, 0);
      g.add(ball, blink);
      g.visible = false;
      this.group.add(g);
      this.pool.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mesh: g, blink });
    }
    this.flash = new THREE.PointLight(0xffa040, 0, 34, 2);
    this.group.add(this.flash);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.12;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  /** Lob a grenade from (sx,sz) to land near (tx,tz). Returns false if none free. */
  throwTo(sx: number, sz: number, tx: number, tz: number): boolean {
    const n = this.pool.find((p) => !p.active);
    if (!n) return false;
    const y0 = 1.7;
    const T = 0.85;
    n.active = true;
    n.x = sx;
    n.y = y0;
    n.z = sz;
    n.vx = (tx - sx) / T;
    n.vz = (tz - sz) / T;
    n.vy = (0.5 * G * T * T - y0) / T;
    n.mesh.visible = true;
    n.mesh.position.set(sx, y0, sz);
    return true;
  }

  private explode(x: number, z: number): void {
    this.flash.position.set(x, 2, z);
    this.flash.intensity = 42;
    this.flashT = 0.35;
    this.ring.position.set(x, 0.12, z);
    this.ring.scale.setScalar(1);
    this.ring.visible = true;
    this.ringMat.opacity = 0.9;
    this.ringT = 0.45;

    this.ctx.fx.burst(x, 0.6, z, 70, 0xffb24a, { speed: 30, up: 14, life: 0.8, size: 10 });
    this.ctx.fx.burst(x, 0.7, z, 40, 0xffffff, { speed: 18, up: 10, life: 0.4, size: 8 });
    this.ctx.fx.burst(x, 0.4, z, 30, 0x3a3a3a, { speed: 8, up: 6, life: 1.1, size: 9, drag: 0.8 });

    for (const zb of [...this.ctx.enemies.alive]) {
      const d = Math.hypot(zb.x - x, zb.z - z);
      if (d < RADIUS) {
        const dmg = 90 - (d / RADIUS) * 60; // 90 at center → 30 at the edge
        this.ctx.combat.damageZombie(zb, dmg, false, false);
        zb.repel(2 + 7 * (1 - d / RADIUS));
      }
    }

    this.ctx.cam.addTrauma(0.7);
    this.ctx.stage.punch(0.6);
    this.ctx.cam.pulseFov(0.8);
    this.ctx.events.emit("SFX", { id: "explosion" });
  }

  update(dt: number): void {
    this.t += dt;
    const blinkOn = Math.sin(this.t * 30) > 0;
    for (const n of this.pool) {
      if (!n.active) continue;
      n.blink.visible = blinkOn;
      n.vy -= G * dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.z += n.vz * dt;
      n.mesh.position.set(n.x, n.y, n.z);
      n.mesh.rotation.x += dt * 8;
      n.mesh.rotation.z += dt * 6;
      if (Math.random() < 0.6) this.ctx.fx.burst(n.x, n.y, n.z, 1, 0x555555, { speed: 0.5, up: 0.5, life: 0.4, size: 4, drag: 1 });
      if (n.y <= 0.12) {
        n.active = false;
        n.mesh.visible = false;
        this.explode(n.x, n.z);
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.intensity = Math.max(0, this.flashT / 0.35) * 42;
    }
    if (this.ringT > 0) {
      this.ringT -= dt;
      const p = 1 - this.ringT / 0.45;
      this.ring.scale.setScalar(1 + p * RADIUS);
      this.ringMat.opacity = 0.9 * (1 - p);
      if (this.ringT <= 0) this.ring.visible = false;
    }
  }

  clear(): void {
    for (const n of this.pool) {
      n.active = false;
      n.mesh.visible = false;
    }
    this.flashT = 0;
    this.flash.intensity = 0;
    this.ringT = 0;
    this.ring.visible = false;
  }
}
