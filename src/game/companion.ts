import * as THREE from "three";
import type { Ctx } from "./ctx";
import { WEAPONS } from "./weapons";
import { FIELD } from "../config";

const FIRE_CD = 0.55;
const RANGE = 64;

/** A rescued survivor holding the wall beside you: stands on the rampart,
 * auto-targets the nearest threat in front and fires. Minimal for the slice. */
class Companion {
  group = new THREE.Group();
  hp = 60;
  down = false;
  private cd = 0;
  private muzzle: THREE.PointLight;
  private t = 0;

  constructor(public name: string, public x: number, scene: THREE.Scene) {
    this.group.position.set(x, FIELD.rampartHeight, FIELD.rampartZ + 0.4);
    const coat = new THREE.MeshStandardMaterial({ color: 0x4a4030, roughness: 1, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 1, flatShading: true });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.4), coat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
    head.position.y = 1.6;
    this.group.add(torso, head);
    this.muzzle = new THREE.PointLight(0xffd27a, 0, 8, 2);
    this.muzzle.position.set(0, 1.2, -0.6);
    this.group.add(this.muzzle);
    scene.add(this.group);
  }

  update(dt: number, ctx: Ctx): void {
    this.t += dt;
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 24);
    if (this.down) return;
    this.cd -= dt;

    // Nearest live zombie in front
    let best: { x: number; z: number } | null = null;
    let bestD = RANGE * RANGE;
    for (const z of ctx.enemies.alive) {
      if (!z.killable || z.z > this.group.position.z) continue;
      const dx = z.x - this.x;
      const dz = z.z - this.group.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = { x: z.x, z: z.z };
      }
    }
    if (best && this.cd <= 0) {
      this.cd = FIRE_CD;
      const def = WEAPONS.pistol;
      const dx = best.x - this.x;
      const dz = best.z - this.group.position.z;
      ctx.bullets.spawn(this.x, this.group.position.z, dx, dz, def, 11, false);
      this.muzzle.intensity = 4;
      ctx.events.emit("SFX", { id: "shot_pistol" });
    }
  }

  hurt(dmg: number, ctx: Ctx): void {
    if (this.down) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.down = true;
      this.group.rotation.z = 1.4;
      this.group.position.y = 0.3 + FIELD.rampartHeight;
      ctx.events.emit("COMPANION_DOWN", { name: this.name });
    }
  }
}

export class CompanionManager {
  list: Companion[] = [];

  constructor(private ctx: Ctx, private scene: THREE.Scene) {}

  /** Build companion actors from the run's roster, spread along the rampart. */
  spawnFromRun(): void {
    this.clear();
    const names = this.ctx.run.companions;
    const n = names.length;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? -8 : -14 + (28 / (n - 1)) * i;
      this.list.push(new Companion(names[i], x, this.scene));
    }
  }

  get aliveCount(): number {
    return this.list.filter((c) => !c.down).length;
  }

  update(dt: number): void {
    for (const c of this.list) c.update(dt, this.ctx);
    // Crossed zombies maul a nearby companion
    for (const z of this.ctx.enemies.alive) {
      if (z.state !== "crossing") continue;
      for (const c of this.list) {
        if (c.down) continue;
        const dx = z.x - c.x;
        const dz = z.z - c.group.position.z;
        if (dx * dx + dz * dz < 1.6) c.hurt(8 * dt * 6, this.ctx);
      }
    }
  }

  clear(): void {
    for (const c of this.list) this.scene.remove(c.group);
    this.list.length = 0;
  }
}
