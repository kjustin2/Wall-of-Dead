import * as THREE from "three";

export type FloaterKind = "hit" | "crit" | "heal" | "warn";

const CAP = 40;

/**
 * Damage/feedback numbers projected from 3D world points onto DOM nodes in the
 * #floaters layer. CSS animates the rise + fade (see ui/style.css). Pooled.
 */
export class Floaters {
  enabled = true;
  private root: HTMLElement;
  private nodes: HTMLDivElement[] = [];
  private life = new Float32Array(CAP);
  private wx = new Float32Array(CAP);
  private wy = new Float32Array(CAP);
  private wz = new Float32Array(CAP);
  private cursor = 0;
  private v = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {
    this.root = document.getElementById("floaters") as HTMLElement;
    for (let i = 0; i < CAP; i++) {
      const el = document.createElement("div");
      el.className = "floater";
      el.style.display = "none";
      this.root.appendChild(el);
      this.nodes.push(el);
    }
  }

  spawn(x: number, y: number, z: number, text: string, kind: FloaterKind = "hit"): void {
    if (!this.enabled) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % CAP;
    this.life[i] = 0.85;
    this.wx[i] = x + (Math.random() - 0.5) * 0.6;
    this.wy[i] = y;
    this.wz[i] = z;
    const el = this.nodes[i];
    el.textContent = text;
    el.className = `floater floater--${kind}`;
    el.style.display = "block";
    // Restart the CSS animation
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  update(dt: number): void {
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const el = this.nodes[i];
      if (this.life[i] <= 0) {
        el.style.display = "none";
        continue;
      }
      this.v.set(this.wx[i], this.wy[i], this.wz[i]);
      this.v.project(this.camera);
      if (this.v.z > 1) {
        el.style.display = "none";
        continue;
      }
      const sx = (this.v.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
    }
  }

  clear(): void {
    for (let i = 0; i < CAP; i++) {
      this.life[i] = 0;
      this.nodes[i].style.display = "none";
    }
  }
}
