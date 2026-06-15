import * as THREE from "three";
import { FIELD } from "../config";

/**
 * Keyboard + mouse. The cursor is raycast onto a horizontal plane at body
 * height to produce a world-space aim point, so aiming reads naturally as
 * "point into the field". Key edges (justPressed) distinguish tap vs hold.
 */
export class Input {
  enabled = true;
  mouseDown = false;
  mouseJustDown = false;
  readonly aimWorld = new THREE.Vector3(0, FIELD.aimPlaneY, FIELD.spawnZ * 0.4);
  /** Pointer in pixels, relative to the canvas. */
  private px = 0;
  private py = 0;

  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private wheel = 0;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FIELD.aimPlaneY);
  private ndc = new THREE.Vector2();

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    canvas.addEventListener("pointermove", (e) => {
      this.px = e.clientX;
      this.py = e.clientY;
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.px = e.clientX;
      this.py = e.clientY;
      this.mouseDown = true;
      this.mouseJustDown = true;
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.enabled) return;
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false }
    );
  }

  /** -1 / 0 / +1 scroll step this frame (for weapon cycling). */
  wheelStep(): number {
    return this.enabled ? Math.sign(this.wheel) : 0;
  }

  down(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  pressed(code: string): boolean {
    return this.enabled && this.justPressed.has(code);
  }

  /** Movement axis from A/D (and arrows). -1 = toward -X, +1 = toward +X. */
  moveX(): number {
    let x = 0;
    if (this.down("KeyA") || this.down("ArrowLeft")) x -= 1;
    if (this.down("KeyD") || this.down("ArrowRight")) x += 1;
    return x;
  }

  /** Free 2D axes for the top-down day minigame (WASD). */
  axis(out: THREE.Vector2): THREE.Vector2 {
    let x = 0;
    let y = 0;
    if (this.down("KeyA") || this.down("ArrowLeft")) x -= 1;
    if (this.down("KeyD") || this.down("ArrowRight")) x += 1;
    if (this.down("KeyW") || this.down("ArrowUp")) y -= 1;
    if (this.down("KeyS") || this.down("ArrowDown")) y += 1;
    out.set(x, y);
    if (x || y) out.normalize();
    return out;
  }

  updateAim(camera: THREE.Camera): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((this.px - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((this.py - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.aimWorld);
    if (!hit) {
      // Ray parallel to plane — fall back to a point straight ahead.
      this.aimWorld.set(0, FIELD.aimPlaneY, -20);
    }
  }

  endFrame(): void {
    this.justPressed.clear();
    this.mouseJustDown = false;
    this.wheel = 0;
  }
}
