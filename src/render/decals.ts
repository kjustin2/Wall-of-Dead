import * as THREE from "three";

const CAP = 48;

/**
 * Pooled flat ground splats (blood / scorch). They fade over time and recycle,
 * so the kill zone in front of the wall reads as a battlefield without leaking
 * meshes. One shared circle geometry; per-decal material for fade.
 */
export class Decals {
  private group = new THREE.Group();
  private pool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number }[] = [];
  private cursor = 0;
  private geo = new THREE.CircleGeometry(1, 14);

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < CAP; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x4a0708, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.03;
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, life: 0, max: 1 });
    }
    scene.add(this.group);
  }

  spawn(x: number, z: number, color = 0x4a0708, size = 1.2, life = 9): void {
    const d = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % CAP;
    d.life = life;
    d.max = life;
    d.mat.color.set(color);
    const s = size * (0.7 + Math.random() * 0.7);
    d.mesh.scale.set(s, s, s);
    d.mesh.position.set(x + (Math.random() - 0.5) * 0.5, 0.03 + Math.random() * 0.01, z + (Math.random() - 0.5) * 0.5);
    d.mesh.rotation.z = Math.random() * Math.PI;
    d.mesh.visible = true;
  }

  update(dt: number): void {
    for (const d of this.pool) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        continue;
      }
      d.mat.opacity = Math.min(0.6, (d.life / d.max) * 0.7 + 0.05);
    }
  }

  clear(): void {
    for (const d of this.pool) {
      d.life = 0;
      d.mesh.visible = false;
    }
  }
}
