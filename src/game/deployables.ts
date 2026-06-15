import * as THREE from "three";
import type { Ctx } from "./ctx";
import { makeGlow } from "../render/textures";
import { FIELD } from "../config";

const TRAP_R = 2.6;
const FLARE_R = 7;
const FLARE_LIFE = 7;

interface Trap {
  x: number;
  z: number;
  group: THREE.Group;
  cd: number;
}
interface Flare {
  x: number;
  z: number;
  light: THREE.PointLight;
  glow: THREE.Sprite;
  life: number;
}

/**
 * Night-time tactics you place in the field:
 *  - Spike traps (limited, persistent): hurt + slow zombies that wander onto them.
 *  - Flares (cooldown): light an area and slow everything near it for a few sec.
 */
export class Deployables {
  private group = new THREE.Group();
  private traps: Trap[] = [];
  private flares: Flare[] = [];

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    scene.add(this.group);
  }

  placeTrap(x: number, z: number): void {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(TRAP_R, TRAP_R, 0.06, 20),
      new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 1 })
    );
    base.position.y = 0.04;
    g.add(base);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.5, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 5), spikeMat);
      spike.position.set(Math.cos(a) * TRAP_R * 0.55, 0.25, Math.sin(a) * TRAP_R * 0.55);
      g.add(spike);
    }
    g.add(makeGlow(0xff7a3a, 1.8, 0.4));
    g.position.set(x, 0, z);
    this.group.add(g);
    this.traps.push({ x, z, group: g, cd: 0 });
    this.ctx.events.emit("SFX", { id: "reload" });
  }

  placeFlare(x: number, z: number): void {
    const light = new THREE.PointLight(0xff5a2a, 9, FLARE_R * 2.4, 2);
    light.position.set(x, 2.4, z);
    const glow = makeGlow(0xff7a3a, 4, 0.9);
    glow.position.set(x, 1.0, z);
    this.group.add(light, glow);
    this.flares.push({ x, z, light, glow, life: FLARE_LIFE });
    this.ctx.events.emit("SFX", { id: "spit" });
  }

  update(dt: number): void {
    const zs = this.ctx.enemies.alive;
    // Traps: periodic bite on anything standing on them.
    for (const t of this.traps) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      for (const z of zs) {
        if (!z.killable) continue;
        const dx = z.x - t.x;
        const dz = z.z - t.z;
        if (dx * dx + dz * dz < TRAP_R * TRAP_R) {
          this.ctx.combat.damageZombie(z, 14, false, false);
          z.slow(2.5);
          this.ctx.fx.burst(z.x, 0.4, z.z, 4, 0xff7a3a, { speed: 4, up: 3, life: 0.3, size: 5 });
          t.cd = 0.45;
          break;
        }
      }
    }
    // Flares: light + slow nearby; flicker; expire.
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.life -= dt;
      const flick = 0.7 + Math.sin(f.life * 30) * 0.3;
      f.light.intensity = Math.max(0, (f.life / FLARE_LIFE) * 9 * flick);
      f.glow.material.opacity = Math.max(0, (f.life / FLARE_LIFE) * 0.9 * flick);
      for (const z of zs) {
        const dx = z.x - f.x;
        const dz = z.z - f.z;
        if (dx * dx + dz * dz < FLARE_R * FLARE_R) z.slow(0.3);
      }
      if (f.life <= 0) {
        this.group.remove(f.light, f.glow);
        this.flares.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const t of this.traps) this.group.remove(t.group);
    for (const f of this.flares) this.group.remove(f.light, f.glow);
    this.traps.length = 0;
    this.flares.length = 0;
  }

  /** A sensible drop point just in front of the wall at column x. */
  static dropZ(): number {
    return FIELD.wallZ - 3;
  }
}
