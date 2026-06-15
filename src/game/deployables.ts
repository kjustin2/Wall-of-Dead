import * as THREE from "three";
import type { Ctx } from "./ctx";
import { makeGlow } from "../render/textures";
import { FIELD } from "../config";

const TRAP_R = 2.6;

interface Trap {
  x: number;
  z: number;
  group: THREE.Group;
  cd: number;
}

/**
 * Night-time tactics you place in the field:
 *  - Spike traps (limited, persistent): hurt + slow zombies that wander onto them.
 */
export class Deployables {
  private group = new THREE.Group();
  private traps: Trap[] = [];

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
  }

  clear(): void {
    for (const t of this.traps) this.group.remove(t.group);
    this.traps.length = 0;
  }

  /** A sensible drop point just in front of the wall at column x. */
  static dropZ(): number {
    return FIELD.wallZ - 3;
  }
}
