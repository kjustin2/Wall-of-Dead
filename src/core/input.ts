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

  // --- Gamepad (twin-stick) ---
  /** True for the current frame if a gamepad is actively driving input. */
  padActive = false;
  padFire = false;
  private padMoveX = 0;
  private padMoveY = 0;
  private padPrev: boolean[] = [];
  // Standard-mapping button → game key code.
  private static PAD_KEYS: Record<number, string> = {
    0: "Space", // A — shove
    1: "KeyE", // B — interact (repair/revive)
    2: "KeyR", // X — reload
    3: "KeyF", // Y — flashlight / last-stand
    9: "Escape", // Start — pause
    12: "KeyT", // dpad up — trap
  };

  /** Optional accessibility re-binds: physical code → canonical code (additive). */
  private remap: Record<string, string> = {};
  setRebinds(m: Record<string, string>): void {
    this.remap = m || {};
  }

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const code = this.remap[e.code] ?? e.code;
      this.keys.add(code);
      this.justPressed.add(code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(this.remap[e.code] ?? e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    canvas.addEventListener("pointermove", (e) => {
      this.px = e.clientX;
      this.py = e.clientY;
      if (e.movementX || e.movementY) this.padActive = false; // mouse takes over
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.px = e.clientX;
      this.py = e.clientY;
      this.mouseDown = true;
      this.mouseJustDown = true;
      this.padActive = false;
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

  /** Poll a connected gamepad: left stick → move, right stick → aim cursor,
   * buttons → mapped keys, RT → fire. Mouse/keyboard keep working alongside. */
  poll(dt: number): void {
    this.padFire = false;
    this.padFireJust = false;
    this.padMoveX = 0;
    this.padMoveY = 0;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav || !nav.getGamepads) return;
    const pads = nav.getGamepads();
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    if (!pad) {
      // No gamepad: release any keys the pad was holding so they don't stick.
      if (this.padHeld.size) {
        for (const c of this.padHeld) this.keys.delete(c);
        this.padHeld.clear();
      }
      return;
    }
    const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const lx = dead(pad.axes[0] ?? 0);
    const ly = dead(pad.axes[1] ?? 0);
    const rx = dead(pad.axes[2] ?? 0);
    const ry = dead(pad.axes[3] ?? 0);
    this.padMoveX = lx;
    this.padMoveY = ly;

    // Right stick steers a virtual cursor (drives the same aim raycast).
    if (rx || ry) {
      this.padActive = true;
      const rect = this.canvas.getBoundingClientRect();
      const speed = 900 * dt;
      this.px = Math.min(rect.right, Math.max(rect.left, this.px + rx * speed));
      this.py = Math.min(rect.bottom, Math.max(rect.top, this.py + ry * speed));
    } else if (lx || ly) {
      this.padActive = true;
    }

    // Buttons → mapped key edges. CRUCIAL: only release keys the GAMEPAD pressed
    // (tracked in padHeld) — never blindly delete the mapped code, or a key the
    // player is holding on the keyboard (F/E/R/Space…) gets clobbered every frame.
    const btns = pad.buttons;
    for (let i = 0; i < btns.length; i++) {
      const pressed = btns[i]?.pressed ?? false;
      const was = this.padPrev[i] ?? false;
      const code = Input.PAD_KEYS[i];
      if (code) {
        if (pressed) {
          this.keys.add(code);
          this.padHeld.add(code);
          if (!was) {
            this.justPressed.add(code);
            this.padActive = true;
          }
        } else if (this.padHeld.has(code)) {
          this.keys.delete(code);
          this.padHeld.delete(code);
        }
      }
      this.padPrev[i] = pressed;
    }
    // Weapon cycle on the bumpers (edge-triggered).
    if ((btns[5]?.pressed ?? false) && !(this.padPrev5 ?? false)) this.wheel += 1;
    if ((btns[4]?.pressed ?? false) && !(this.padPrev4 ?? false)) this.wheel -= 1;
    this.padPrev5 = btns[5]?.pressed ?? false;
    this.padPrev4 = btns[4]?.pressed ?? false;
    // Fire on the right trigger (button 7).
    const fireNow = (btns[7]?.pressed ?? false) || (btns[7]?.value ?? 0) > 0.4;
    this.padFireJust = fireNow && !this.padFirePrev;
    this.padFire = fireNow;
    this.padFirePrev = fireNow;
  }

  padFireJust = false;
  private padFirePrev = false;
  private padHeld = new Set<string>();
  private padPrev4 = false;
  private padPrev5 = false;

  down(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  pressed(code: string): boolean {
    return this.enabled && this.justPressed.has(code);
  }

  /** Movement axis from A/D (and arrows). -1 = toward -X, +1 = toward +X. */
  moveX(): number {
    if (!this.enabled) return 0;
    let x = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (x === 0 && this.padMoveX) x = this.padMoveX;
    return x;
  }

  /** Free 2D axes for the top-down day minigame (WASD or left stick). */
  axis(out: THREE.Vector2): THREE.Vector2 {
    let x = 0;
    let y = 0;
    if (this.enabled) {
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y -= 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y += 1;
      if (x === 0 && y === 0 && (this.padMoveX || this.padMoveY)) {
        x = this.padMoveX;
        y = this.padMoveY;
      }
    }
    out.set(x, y);
    if (Math.abs(x) > 1 || Math.abs(y) > 1 || (out.lengthSq() > 1.0001)) out.normalize();
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
