import * as THREE from "three";
import type { Ctx } from "./ctx";
import type { WeaponDef } from "./weapons";

const CAP = 180;
const FLY_Y = 1.5;

interface Bullet {
  active: boolean;
  x: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  dmg: number;
  pierce: number;
  life: number;
  fromPlayer: boolean;
  hit: Set<number>;
  mesh: THREE.Mesh;
}

function pointSegDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1e-6;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  const ex = px - cx;
  const ez = pz - cz;
  return ex * ex + ez * ez;
}

/** Pooled tracer projectiles. Swept XZ collision against live zombies; routes
 * every confirmed hit through ctx.combat. */
export class Bullets {
  private pool: Bullet[] = [];
  private geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    for (let i = 0; i < CAP; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd47a, fog: false });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({
        active: false,
        x: 0,
        z: 0,
        px: 0,
        pz: 0,
        vx: 0,
        vz: 0,
        dmg: 0,
        pierce: 0,
        life: 0,
        fromPlayer: true,
        hit: new Set(),
        mesh,
      });
    }
  }

  spawn(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    def: WeaponDef,
    dmg: number,
    fromPlayer: boolean
  ): void {
    const b = this.pool.find((p) => !p.active);
    if (!b) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    b.active = true;
    b.x = x;
    b.z = z;
    b.px = x;
    b.pz = z;
    b.vx = (dirX / len) * def.speed;
    b.vz = (dirZ / len) * def.speed;
    b.dmg = dmg;
    b.pierce = def.pierce;
    b.life = 1.2;
    b.fromPlayer = fromPlayer;
    b.hit.clear();
    const mat = b.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(def.color);
    b.mesh.scale.set(1, def.tracer, 1);
    b.mesh.visible = true;
  }

  update(dt: number): void {
    const zs = this.ctx.enemies.alive;
    for (const b of this.pool) {
      if (!b.active) continue;
      b.px = b.x;
      b.pz = b.z;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.life -= dt;

      // Collision (swept segment px→x) against zombies
      for (const z of zs) {
        if (!z.killable || b.hit.has(z.id)) continue;
        const rr = z.radius + 0.35;
        if (pointSegDist2(z.x, z.z, b.px, b.pz, b.x, b.z) <= rr * rr) {
          b.hit.add(z.id);
          const headshot = this.ctx.rng.chance(z.headshotChance);
          this.ctx.combat.damageZombie(z, b.dmg, headshot, b.fromPlayer);
          if (b.pierce <= 0) {
            b.life = 0;
            break;
          }
          b.pierce--;
        }
      }

      if (b.life <= 0 || b.z < -90 || b.z > 16 || Math.abs(b.x) > 60) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }

      // Orient the tracer along velocity (cylinder local +Y → dir)
      b.mesh.position.set(b.x, FLY_Y, b.z);
      const ang = Math.atan2(b.vx, b.vz);
      b.mesh.rotation.set(Math.PI / 2, 0, -ang);
    }
  }

  clear(): void {
    for (const b of this.pool) {
      b.active = false;
      b.mesh.visible = false;
    }
  }
}
