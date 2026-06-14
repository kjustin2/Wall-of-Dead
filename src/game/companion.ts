import * as THREE from "three";
import type { Ctx } from "./ctx";
import { WEAPONS } from "./weapons";
import { FIELD } from "../config";
import { makeGlow, makeLabel } from "../render/textures";

const FIRE_CD = 0.55;
const RANGE = 64;
const ALLY = 0x52e0a0;

/** A rescued survivor holding the wall beside you: stands on the firing step,
 * auto-targets the nearest threat in front and fires. Marked clearly as an ally
 * — friendly teal, a hovering green chevron + glow, and a floating nameplate. */
class Companion {
  group = new THREE.Group();
  hp = 60;
  down = false;
  private cd = 0;
  private muzzle: THREE.PointLight;
  private marker = new THREE.Group();
  private t = 0;
  private aimRig = new THREE.Group();

  constructor(public name: string, public x: number, scene: THREE.Scene) {
    this.group.position.set(x, FIELD.rampartHeight, FIELD.rampartZ + 0.4);
    const coat = new THREE.MeshStandardMaterial({ color: 0x2f7d6c, roughness: 1, flatShading: true });
    const vest = new THREE.MeshStandardMaterial({ color: 0x1f4f45, roughness: 1, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 1, flatShading: true });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.98, 0.42), coat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.5, 0.46), vest);
    chest.position.y = 1.02;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.42), vest);
    cap.position.y = 1.84;
    for (const lx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), vest);
      leg.position.set(lx, 0.4, 0);
      this.group.add(leg);
    }
    this.group.add(torso, chest, head, cap);

    // Rifle on a small aim rig (points into the field by default)
    this.aimRig.position.y = 1.25;
    this.aimRig.rotation.y = Math.PI; // face -Z (the field)
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.14, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.6, metalness: 0.5 })
    );
    gun.position.set(0.1, 0, 0.5);
    this.aimRig.add(gun);
    this.group.add(this.aimRig);

    this.muzzle = new THREE.PointLight(0xffd27a, 0, 8, 2);
    this.muzzle.position.set(0, 1.25, -0.7);
    this.group.add(this.muzzle);

    // Ally marker: glow + downward chevron + nameplate
    const glow = makeGlow(ALLY, 2.4, 0.45);
    glow.position.y = 2.5;
    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.44, 4),
      new THREE.MeshBasicMaterial({ color: ALLY, fog: false })
    );
    chevron.rotation.x = Math.PI;
    chevron.position.y = 2.55;
    const label = makeLabel(`${name}  ·  ALLY`, "#9dffd0");
    label.position.y = 3.05;
    this.marker.add(glow, chevron, label);
    this.group.add(this.marker);

    scene.add(this.group);
  }

  update(dt: number, ctx: Ctx): void {
    this.t += dt;
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 24);
    this.marker.position.y = Math.sin(this.t * 3) * 0.12;
    this.marker.rotation.y = this.t * 0.8;
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
    if (best) {
      this.aimRig.rotation.y = Math.atan2(-(best.x - this.x), -(best.z - this.group.position.z));
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
