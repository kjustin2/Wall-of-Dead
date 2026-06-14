import * as THREE from "three";
import type { EventBus } from "../core/events";
import { FIELD, RUN } from "../config";
import { clamp } from "../core/math";
import { Rng } from "../core/rng";

const SEG = FIELD.segments;
const SEG_W = (FIELD.wallHalf * 2) / SEG;
const MAX_PER = RUN.wallMaxHp / SEG;
const H = FIELD.wallHeight;
const SUNK_Y = -(H * 0.92); // y offset of a fully-broken segment (leaves rubble)

const C_CONCRETE = 0x2c3036;
const C_BAG = 0x6f5d3c;
const C_BAG_DARK = 0x2a2418;
const C_WOOD = 0x47361f;

/**
 * A chest-high defensive barricade you fire over: SEG segments of stacked
 * sandbags on a concrete base, wooden posts between, barbed wire on top.
 * Damage localizes to the segment under the attacker; at 0 HP the segment sinks
 * to rubble, opening a gap zombies cross. Integrity persists as one run number,
 * redistributed via setTotal().
 */
export class Wall {
  group = new THREE.Group();
  private hp = new Float32Array(SEG);
  private segGroup: THREE.Group[] = [];
  private baseMat: THREE.MeshStandardMaterial[] = [];
  private bagMat: THREE.MeshStandardMaterial[] = [];
  private rng = new Rng(7);

  constructor(scene: THREE.Scene, private events: EventBus) {
    for (let i = 0; i < SEG; i++) this.buildSegment(i);
    this.buildPosts();
    this.buildWire();
    scene.add(this.group);
    this.refreshAll();
  }

  private centerX(i: number): number {
    return -FIELD.wallHalf + (i + 0.5) * SEG_W;
  }

  private buildSegment(i: number): void {
    const g = new THREE.Group();
    g.position.set(this.centerX(i), 0, FIELD.wallZ);

    const baseMat = new THREE.MeshStandardMaterial({ color: C_CONCRETE, roughness: 1, flatShading: true, emissive: new THREE.Color(0) });
    const bagMat = new THREE.MeshStandardMaterial({ color: C_BAG, roughness: 1, flatShading: true });
    this.baseMat.push(baseMat);
    this.bagMat.push(bagMat);

    const base = new THREE.Mesh(new THREE.BoxGeometry(SEG_W - 0.2, 0.5, FIELD.wallThickness), baseMat);
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    // Three rows of sandbags, staggered, with slight random tilt.
    const rows = [
      { y: 0.62, n: 4, d: 0.0 },
      { y: 0.98, n: 4, d: 0.45 },
      { y: 1.3, n: 3, d: 0.2 },
    ];
    const bagGeo = new THREE.BoxGeometry(0.82, 0.4, FIELD.wallThickness * 0.78);
    for (const row of rows) {
      const span = SEG_W - 1.0;
      for (let b = 0; b < row.n; b++) {
        const bag = new THREE.Mesh(bagGeo, bagMat);
        const fx = row.n > 1 ? (b / (row.n - 1) - 0.5) : 0;
        bag.position.set(fx * span + (row.d - 0.2) + this.rng.range(-0.05, 0.05), row.y, this.rng.range(-0.08, 0.08));
        bag.rotation.set(this.rng.range(-0.06, 0.06), this.rng.range(-0.12, 0.12), this.rng.range(-0.08, 0.08));
        bag.scale.setScalar(this.rng.range(0.92, 1.08));
        bag.castShadow = true;
        g.add(bag);
      }
    }

    // A leaning wooden plank brace for texture.
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(SEG_W - 0.6, 0.14, 0.14),
      new THREE.MeshStandardMaterial({ color: C_WOOD, roughness: 1, flatShading: true })
    );
    plank.position.set(0, 0.7, FIELD.wallThickness * 0.5);
    plank.rotation.z = this.rng.range(-0.04, 0.04);
    g.add(plank);

    this.segGroup.push(g);
    this.group.add(g);
    this.hp[i] = MAX_PER;
  }

  private buildPosts(): void {
    const postGeo = new THREE.BoxGeometry(0.32, H + 0.9, FIELD.wallThickness + 0.4);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x33271a, roughness: 1, flatShading: true });
    for (let i = 0; i <= SEG; i++) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(-FIELD.wallHalf + i * SEG_W, (H + 0.9) / 2, FIELD.wallZ);
      p.castShadow = true;
      this.group.add(p);
    }
  }

  private buildWire(): void {
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.6, metalness: 0.5 });
    for (let k = 0; k < 2; k++) {
      const wire = new THREE.Mesh(new THREE.BoxGeometry(FIELD.wallHalf * 2, 0.05, 0.05), wireMat);
      wire.position.set(0, H + 0.55 + k * 0.22, FIELD.wallZ + (k === 0 ? -0.2 : 0.2));
      this.group.add(wire);
    }
    // A few barbs/coils suggested with small tilted boxes.
    const barbMat = wireMat;
    for (let i = 0; i < 24; i++) {
      const barb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), barbMat);
      barb.position.set(this.rng.range(-FIELD.wallHalf, FIELD.wallHalf), H + 0.62, FIELD.wallZ);
      barb.rotation.z = this.rng.range(-0.8, 0.8);
      this.group.add(barb);
    }
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
    this.hp[i] = Math.max(0, this.hp[i] - dmg);
    this.events.emit("WALL_HIT", { seg: i, x: this.centerX(i), dmg });
    this.refresh(i);
    if (this.hp[i] <= 0) this.events.emit("WALL_BREACH", { seg: i, x: this.centerX(i) });
  }

  setTotal(total: number): void {
    const per = clamp(total / SEG, 0, MAX_PER);
    for (let i = 0; i < SEG; i++) this.hp[i] = per;
    this.refreshAll();
  }

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
    const f = this.hp[i] / MAX_PER;
    this.segGroup[i].position.y = SUNK_Y * (1 - f);
    this.bagMat[i].color.copy(new THREE.Color(C_BAG_DARK)).lerp(new THREE.Color(C_BAG), f);
    const danger = f < 0.4 && f > 0 ? (0.4 - f) / 0.4 : 0;
    this.baseMat[i].emissive.setRGB(0.02 + 0.5 * danger, 0.03 + 0.02 * danger, 0.045 + 0.02 * danger);
  }

  private refreshAll(): void {
    for (let i = 0; i < SEG; i++) this.refresh(i);
  }
}
