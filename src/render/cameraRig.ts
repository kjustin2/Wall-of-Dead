import * as THREE from "three";
import { clamp, damp, lerp } from "../core/math";
import { FIELD } from "../config";

export type CamMode = "menu" | "rampart" | "topdown" | "cutscene";

/**
 * Trauma-based camera. Shake intensity is trauma², so small hits whisper and
 * big hits roar. Three rigs:
 *  - menu:    slow cinematic drift looking down the wall
 *  - rampart: night defense — sits behind/above the defender, tracks their X,
 *             looks out over the wall into the field
 *  - topdown: day scavenge — high overhead follow of the avatar
 */
export class CameraRig {
  mode: CamMode = "menu";
  shakeScale = 1;
  /** Player/avatar world position the rig chases. */
  readonly target = new THREE.Vector3();
  /** Aim X used for a little look-lead on the rampart. */
  aimX = 0;

  private trauma = 0;
  private kickOffset = new THREE.Vector3();
  private kickVel = new THREE.Vector3();
  private fovPulse = 0;
  private baseFov: number;
  private t = 0;
  private smoothedX = 0;
  private smoothedZ = 0;
  private lookX = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.baseFov = camera.fov;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  setBaseFov(f: number): void {
    this.baseFov = f;
    this.camera.fov = f;
    this.camera.updateProjectionMatrix();
  }

  kick(dirX: number, dirZ: number, strength: number): void {
    this.kickVel.x += dirX * strength;
    this.kickVel.z += dirZ * strength;
  }

  pulseFov(amount: number): void {
    this.fovPulse = Math.max(this.fovPulse, amount);
  }

  snap(): void {
    this.smoothedX = this.target.x;
    this.smoothedZ = this.target.z;
  }

  update(dt: number): void {
    this.t += dt;

    // Kick spring + trauma shake (shared by all modes)
    this.kickVel.multiplyScalar(Math.exp(-9 * dt));
    this.kickOffset.addScaledVector(this.kickVel, dt);
    this.kickOffset.multiplyScalar(Math.exp(-7 * dt));
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * this.shakeScale;
    const sx = (Math.sin(this.t * 47.3) + Math.sin(this.t * 29.7) * 0.6) * sh * 0.5;
    const sy = (Math.sin(this.t * 41.1 + 2.1) + Math.sin(this.t * 33.9 + 0.7) * 0.6) * sh * 0.36;
    const sz = Math.sin(this.t * 53.7 + 4.2) * sh * 0.4;

    if (this.mode === "menu") {
      const x = Math.sin(this.t * 0.16) * 10;
      this.camera.position.set(x + sx, 7.5 + Math.sin(this.t * 0.22) * 0.8 + sy, 17 + sz);
      this.camera.lookAt(x * 0.4, 2.2, -22);
      this.fovDecay(dt);
      return;
    }

    if (this.mode === "cutscene") {
      // Slow, low dolly along the barrier looking out into the dark field.
      const x = Math.sin(this.t * 0.13) * 17;
      this.camera.position.set(x + sx, 3.8 + Math.sin(this.t * 0.3) * 0.4 + sy, FIELD.rampartZ + 9 + sz);
      this.camera.lookAt(x * 0.25, 1.3, -16);
      this.fovDecay(dt);
      return;
    }

    if (this.mode === "topdown") {
      this.smoothedX = damp(this.smoothedX, this.target.x, 7, dt);
      this.smoothedZ = damp(this.smoothedZ, this.target.z, 7, dt);
      this.camera.position.set(
        this.smoothedX + this.kickOffset.x + sx,
        30 + sy,
        this.smoothedZ + 13 + this.kickOffset.z + sz
      );
      this.camera.lookAt(this.smoothedX, 0, this.smoothedZ - 2);
      this.fovDecay(dt);
      return;
    }

    // rampart: follow the defender's X loosely so the field stays in frame
    const desiredX = this.target.x * 0.55;
    const desiredLook = this.target.x * 0.72 + clamp(this.aimX - this.target.x, -10, 10) * 0.18;
    this.smoothedX = damp(this.smoothedX, desiredX, 6, dt);
    this.lookX = damp(this.lookX, desiredLook, 6, dt);
    this.camera.position.set(
      this.smoothedX + this.kickOffset.x + sx,
      9 + Math.sin(this.t * 0.9) * 0.18 + sy,
      FIELD.rampartZ + 11.5 + this.kickOffset.z + sz
    );
    this.camera.lookAt(this.lookX + sx * 0.5, 1.5 + Math.sin(this.t * 0.7) * 0.12, -18 + sz * 0.5);
    this.fovDecay(dt);
  }

  private fovDecay(dt: number): void {
    this.fovPulse = Math.max(0, this.fovPulse - dt * 3.2);
    this.camera.fov = lerp(this.baseFov, this.baseFov + 8, this.fovPulse);
    this.camera.updateProjectionMatrix();
  }
}
