import * as THREE from "three";

const CAP = 28;

/**
 * Pooled ground markers that warn before a big enemy move (brute slam, acid
 * lob, runner lunge). A ring outline + a fill disc that grows toward the moment
 * of impact, so attacks are always telegraphed. Purely visual — the damage is
 * applied by the owning system; this just promises fairness.
 */
export class Telegraphs {
  private group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private fills: THREE.Mesh[] = [];
  private life = new Float32Array(CAP);
  private maxLife = new Float32Array(CAP);
  private cursor = 0;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const ringGeo = new THREE.RingGeometry(0.86, 1, 36);
    const fillGeo = new THREE.CircleGeometry(0.82, 32);
    for (let i = 0; i < CAP; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      const fill = new THREE.Mesh(fillGeo, fillMat);
      ring.rotation.x = -Math.PI / 2;
      fill.rotation.x = -Math.PI / 2;
      ring.visible = false;
      fill.visible = false;
      ring.frustumCulled = false;
      fill.frustumCulled = false;
      this.rings.push(ring);
      this.fills.push(fill);
      this.group.add(ring, fill);
    }
    scene.add(this.group);
  }

  warn(x: number, z: number, radius: number, color: number, duration: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % CAP;
    this.life[i] = duration;
    this.maxLife[i] = duration;
    const ring = this.rings[i];
    const fill = this.fills[i];
    ring.position.set(x, 0.06, z);
    fill.position.set(x, 0.05, z);
    ring.scale.set(radius, radius, radius);
    fill.scale.set(0.001, 0.001, 0.001);
    (ring.material as THREE.MeshBasicMaterial).color.set(color);
    (fill.material as THREE.MeshBasicMaterial).color.set(color);
    ring.visible = true;
    fill.visible = true;
    (ring as THREE.Mesh & { _radius?: number })._radius = radius;
  }

  update(dt: number): void {
    this.t += dt;
    const pulse = 0.55 + Math.sin(this.t * 12) * 0.3;
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const ring = this.rings[i];
      const fill = this.fills[i];
      if (this.life[i] <= 0) {
        ring.visible = false;
        fill.visible = false;
        continue;
      }
      const progress = 1 - this.life[i] / this.maxLife[i];
      const radius = (ring as THREE.Mesh & { _radius?: number })._radius ?? 1;
      const fillScale = radius * progress;
      fill.scale.set(fillScale, fillScale, fillScale);
      (ring.material as THREE.MeshBasicMaterial).opacity = pulse;
      (fill.material as THREE.MeshBasicMaterial).opacity = 0.35 * progress;
    }
  }

  clear(): void {
    for (let i = 0; i < CAP; i++) {
      this.life[i] = 0;
      this.rings[i].visible = false;
      this.fills[i].visible = false;
    }
  }
}
