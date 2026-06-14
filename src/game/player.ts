import * as THREE from "three";
import type { Ctx } from "./ctx";
import type { Loadout } from "./weapons";
import { makeGlow } from "../render/textures";
import { FIELD, RUN } from "../config";
import { clamp } from "../core/math";

const MOVE_SPEED = 9.5;
const GUN_REACH = 1.3;
const FLY_Y = FIELD.fireY;

/**
 * The defender. Strafes the rampart (A/D), aims with the mouse, fires the
 * current weapon, reloads, swaps. Carries the flashlight (a real SpotLight) and
 * a warm lantern glow; muzzle flashes punch a point light. Reads its loadout
 * from run state so weapons persist across the run.
 */
export class Player {
  group = new THREE.Group();
  x = 0;
  z = FIELD.rampartZ;
  hp: number = RUN.playerMaxHp;
  maxHp: number = RUN.playerMaxHp;
  alive = true;

  private aimRig = new THREE.Group();
  private flashlight: THREE.SpotLight;
  private lantern: THREE.PointLight;
  private muzzleLight: THREE.PointLight;
  private muzzleGlow: THREE.Sprite;
  private muzzle = 0; // 0..1 flash
  private fireCd = 0;
  private reloadTimer = 0;
  private yaw = Math.PI;
  private t = 0;

  constructor(private ctx: Ctx, scene: THREE.Scene) {
    const y = FIELD.rampartHeight;
    this.group.position.set(0, y, this.z);

    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7350, roughness: 1, flatShading: true });
    const coat = new THREE.MeshStandardMaterial({ color: 0x35404d, roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x232a31, roughness: 1, flatShading: true });
    const olive = new THREE.MeshStandardMaterial({ color: 0x3f4a30, roughness: 1, flatShading: true });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.74, 1.02, 0.46), coat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    this.group.add(torso);
    // Chest vest
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.5), dark);
    vest.position.y = 1.08;
    this.group.add(vest);
    // Backpack
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.32), olive);
    pack.position.set(0, 1.05, 0.36);
    pack.castShadow = true;
    this.group.add(pack);
    // Head + helmet
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    this.group.add(head);
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.48), dark);
    helmet.position.y = 1.96;
    helmet.castShadow = true;
    this.group.add(helmet);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.16), dark);
    brim.position.set(0, 1.86, -0.28);
    this.group.add(brim);
    // Shoulders
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.22, 0.46), coat);
    shoulders.position.y = 1.46;
    this.group.add(shoulders);
    for (const lx of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.88, 0.26), dark);
      leg.position.set(lx, 0.44, 0);
      leg.castShadow = true;
      this.group.add(leg);
    }

    // Aim rig — yaws toward the cursor. Holds the rifle, arms, flashlight, muzzle.
    this.aimRig.position.y = 1.4;
    this.group.add(this.aimRig);

    const gunMat = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.6, metalness: 0.5 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 1.05), gunMat);
    gun.position.set(0.12, 0, -0.62);
    this.aimRig.add(gun);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.34), gunMat);
    stock.position.set(0.12, -0.04, 0.0);
    this.aimRig.add(stock);
    // Arms reaching to the rifle
    const armMat = coat;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.62), armMat);
    armR.position.set(0.12, 0.02, -0.42);
    this.aimRig.add(armR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.5), armMat);
    armL.position.set(-0.06, -0.02, -0.2);
    armL.rotation.y = -0.5;
    this.aimRig.add(armL);

    this.flashlight = new THREE.SpotLight(0xfff0d0, 14, 90, 0.5, 0.45, 1.2);
    this.flashlight.position.set(0.16, 0.1, -0.5);
    this.flashlight.target.position.set(0.16, -0.3, -40);
    this.aimRig.add(this.flashlight);
    this.aimRig.add(this.flashlight.target);

    this.lantern = new THREE.PointLight(0xffb060, 1.6, 11, 2);
    this.lantern.position.set(0, 1.4, 0.3);
    this.group.add(this.lantern);

    this.muzzleLight = new THREE.PointLight(0xffd27a, 0, 12, 2);
    this.muzzleLight.position.set(0.16, 0, -1.1);
    this.aimRig.add(this.muzzleLight);

    this.muzzleGlow = makeGlow(0xffd27a, 2.2, 0);
    this.muzzleGlow.position.set(0.16, 0, -1.15);
    this.aimRig.add(this.muzzleGlow);

    scene.add(this.group);
  }

  private get loadout(): Loadout | undefined {
    return this.ctx.run.weapons[this.ctx.run.weaponIndex];
  }

  reset(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.x = 0;
    this.fireCd = 0;
    this.reloadTimer = 0;
    this.group.position.set(0, FIELD.rampartHeight, this.z);
  }

  hurt(dmg: number): void {
    this.hp = clamp(this.hp - dmg, 0, this.maxHp);
    if (this.hp <= 0) this.alive = false;
  }

  heal(n: number): void {
    this.hp = clamp(this.hp + n, 0, this.maxHp);
  }

  update(dt: number): void {
    this.t += dt;
    const input = this.ctx.input;

    // Move along the wall
    if (this.alive) {
      const mv = input.moveX() * MOVE_SPEED * this.ctx.adrenaline.moveMult();
      this.x = clamp(this.x + mv * dt, -FIELD.playerHalf, FIELD.playerHalf);
    }
    this.group.position.x = this.x;

    // Aim the rig at the cursor
    const dx = input.aimWorld.x - this.x;
    const dz = input.aimWorld.z - this.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.aimRig.rotation.y = this.yaw;

    // Flashlight intensity tracks the meter + muzzle flash
    this.flashlight.intensity = (12 + this.muzzle * 30) * this.ctx.adrenaline.lightMult();
    this.lantern.intensity = 1.5 + Math.sin(this.t * 7) * 0.15;

    // Weapon handling
    this.fireCd -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    if (this.alive) this.handleInput(dt);

    // Muzzle flash decay
    if (this.muzzle > 0) {
      this.muzzle = Math.max(0, this.muzzle - dt * 12);
      this.muzzleLight.intensity = this.muzzle * 7;
      this.muzzleGlow.material.opacity = this.muzzle;
    }

    // Drive the camera
    this.ctx.cam.target.set(this.x, 0, this.z);
    this.ctx.cam.aimX = input.aimWorld.x;
  }

  private handleInput(dt: number): void {
    void dt;
    const input = this.ctx.input;
    const lo = this.loadout;
    if (!lo) return;
    const def = lo.def;

    // Weapon swap (number keys + Q to cycle)
    for (let i = 0; i < this.ctx.run.weapons.length && i < 4; i++) {
      if (input.pressed(`Digit${i + 1}`)) this.swapTo(i);
    }
    if (input.pressed("KeyQ")) this.swapTo((this.ctx.run.weaponIndex + 1) % this.ctx.run.weapons.length);

    if (input.pressed("KeyR")) this.startReload();

    const wantFire = def.auto ? input.mouseDown : input.mouseJustDown;
    if (wantFire && this.fireCd <= 0 && this.reloadTimer <= 0) {
      if (lo.ammo > 0) {
        this.fire(lo);
      } else {
        this.ctx.events.emit("DRY_FIRE", {});
        this.ctx.events.emit("SFX", { id: "dry_fire" });
        this.startReload();
      }
    }
  }

  private fire(lo: Loadout): void {
    const def = lo.def;
    this.fireCd = def.fireRate / this.ctx.adrenaline.fireRateMult();
    lo.ammo--;

    const dx = this.ctx.input.aimWorld.x - this.x;
    const dz = this.ctx.input.aimWorld.z - this.z;
    const base = Math.atan2(dx, dz);
    const sx = Math.sin(base);
    const sz = Math.cos(base);
    const mx = this.x + sx * GUN_REACH;
    const mz = this.z + sz * GUN_REACH;

    for (let p = 0; p < def.pellets; p++) {
      const a = base + (this.ctx.rng.next() - 0.5) * def.spread * 2;
      this.ctx.bullets.spawn(mx, mz, Math.sin(a), Math.cos(a), def, def.damage, true);
    }
    this.ctx.fx.cone(mx, FLY_Y, mz, sx, sz, 6, def.color, 20);
    this.muzzle = 1;
    this.ctx.cam.addTrauma(def.shake);
    this.ctx.cam.kick(-sx, -sz, def.shake * 8);
    this.ctx.events.emit("SHOOT", { weapon: def.id, x: mx, y: FLY_Y, z: mz });
    this.ctx.events.emit("SFX", { id: def.sfx });

    if (lo.ammo <= 0) this.startReload();
  }

  private startReload(): void {
    const lo = this.loadout;
    if (!lo || this.reloadTimer > 0) return;
    if (lo.ammo >= lo.def.mag || lo.reserve <= 0) return;
    this.reloadTimer = lo.def.reload * this.ctx.adrenaline.reloadMult();
    this.ctx.events.emit("RELOAD", { weapon: lo.def.id });
    this.ctx.events.emit("SFX", { id: "reload" });
  }

  private finishReload(): void {
    const lo = this.loadout;
    if (!lo) return;
    const need = lo.def.mag - lo.ammo;
    const take = Math.min(need, lo.reserve);
    lo.ammo += take;
    lo.reserve -= take;
  }

  private swapTo(i: number): void {
    if (i === this.ctx.run.weaponIndex || i >= this.ctx.run.weapons.length) return;
    this.ctx.run.weaponIndex = i;
    this.reloadTimer = 0;
    this.ctx.events.emit("WEAPON_SWAP", { weapon: this.ctx.run.weapons[i].def.id, index: i });
    this.ctx.events.emit("SFX", { id: "swap" });
  }

  /** True if the current mag is reloading (for the HUD). */
  get reloading(): boolean {
    return this.reloadTimer > 0;
  }
}
