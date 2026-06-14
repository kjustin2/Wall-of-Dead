import * as THREE from "three";
import type { EventBus } from "../core/events";
import { FIELD, PAL, RUN } from "../config";
import { clamp } from "../core/math";

const SEG = FIELD.segments;
const SEG_W = (FIELD.wallHalf * 2) / SEG;
const MAX_PER = RUN.wallMaxHp / SEG;
const H = FIELD.wallHeight;
const SUNK_Y = -H * 0.62; // y of a fully-broken segment (leaves a low stub)

/**
 * The barrier: SEG independent segments plus fixed pillars between them.
 * Damage localizes to the segment under the attacker; a segment at 0 HP sinks
 * to rubble, opening a gap zombies can cross. Total integrity persists on the
 * run as a single number and is redistributed via setTotal() each night.
 */
export class Wall {
  group = new THREE.Group();
  private hp = new Float32Array(SEG);
  private segMesh: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, private events: EventBus) {
    const segGeo = new THREE.BoxGeometry(SEG_W - 0.18, H, FIELD.wallThickness);
    for (let i = 0; i < SEG; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: PAL.wall,
        roughness: 0.95,
        metalness: 0.05,
        flatShading: true,
        emissive: new THREE.Color(0x000000),
      });
      const m = new THREE.Mesh(segGeo, mat);
      m.position.set(this.centerX(i), H / 2, FIELD.wallZ);
      m.castShadow = true;
      m.receiveShadow = true;
      this.segMesh.push(m);
      this.group.add(m);
      this.hp[i] = MAX_PER;
    }

    // Pillars between/around segments — never break, so gaps read clearly.
    const pillarGeo = new THREE.BoxGeometry(0.5, H + 0.7, FIELD.wallThickness + 0.5);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: PAL.wallDark,
      roughness: 1,
      flatShading: true,
    });
    for (let i = 0; i <= SEG; i++) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(-FIELD.wallHalf + i * SEG_W, (H + 0.7) / 2, FIELD.wallZ);
      p.castShadow = true;
      this.group.add(p);
    }

    scene.add(this.group);
    this.refreshAll();
  }

  private centerX(i: number): number {
    return -FIELD.wallHalf + (i + 0.5) * SEG_W;
  }

  segAt(x: number): number {
    return clamp(Math.floor((x + FIELD.wallHalf) / SEG_W), 0, SEG - 1);
  }

  isBrokenAt(x: number): boolean {
    return this.hp[this.segAt(x)] <= 0;
  }

  anyBreached(): boolean {
    for (let i = 0; i < SEG; i++) if (this.hp[i] <= 0) return true;
    return false;
  }

  fullyOverrun(): boolean {
    for (let i = 0; i < SEG; i++) if (this.hp[i] > 0) return false;
    return true;
  }

  totalHp(): number {
    let t = 0;
    for (let i = 0; i < SEG; i++) t += Math.max(0, this.hp[i]);
    return t;
  }

  integrityFrac(): number {
    return this.totalHp() / RUN.wallMaxHp;
  }

  damageAt(x: number, dmg: number): void {
    const i = this.segAt(x);
    if (this.hp[i] <= 0) return;
    const wasUp = this.hp[i] > 0;
    this.hp[i] = Math.max(0, this.hp[i] - dmg);
    this.events.emit("WALL_HIT", { seg: i, x: this.centerX(i), dmg });
    this.refresh(i);
    if (wasUp && this.hp[i] <= 0) {
      this.events.emit("WALL_BREACH", { seg: i, x: this.centerX(i) });
    }
  }

  /** Spread a persisted total across the segments (night start). */
  setTotal(total: number): void {
    const per = clamp(total / SEG, 0, MAX_PER);
    for (let i = 0; i < SEG; i++) this.hp[i] = per;
    this.refreshAll();
  }

  /** Day repair — pour HP into the weakest segments first. */
  repair(amount: number): void {
    let pool = amount;
    while (pool > 0.01) {
      let lowest = 0;
      for (let i = 1; i < SEG; i++) if (this.hp[i] < this.hp[lowest]) lowest = i;
      if (this.hp[lowest] >= MAX_PER) break;
      const room = MAX_PER - this.hp[lowest];
      const give = Math.min(room, pool, 4);
      this.hp[lowest] += give;
      pool -= give;
    }
    this.refreshAll();
  }

  private refresh(i: number): void {
    const m = this.segMesh[i];
    const mat = m.material as THREE.MeshStandardMaterial;
    const f = this.hp[i] / MAX_PER;
    m.position.y = SUNK_Y + (H / 2 - SUNK_Y) * f;
    mat.color.copy(new THREE.Color(PAL.wallDark)).lerp(new THREE.Color(PAL.wall), f);
    // Faint cool base so the silhouette always reads; glows danger-red near collapse.
    const danger = f < 0.4 && f > 0 ? (0.4 - f) / 0.4 : 0;
    mat.emissive.setRGB(0.02 + 0.5 * danger, 0.03 + 0.02 * danger, 0.045 + 0.02 * danger);
    m.visible = true;
  }

  private refreshAll(): void {
    for (let i = 0; i < SEG; i++) this.refresh(i);
  }
}
