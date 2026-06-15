import * as THREE from "three";
import type { Ctx } from "./ctx";
import type { Loadout } from "./weapons";
import { makeGlow } from "../render/textures";
import { FIELD, RUN } from "../config";
import { clamp } from "../core/math";

const MOVE_SPEED = 9.5;
const GUN_REACH = 1.3;
const FLY_Y = FIELD.fireY;
const SHOVE_TIME = 0.28; // melee swing duration
const REPAIR_TIME = 10; // seconds to fix a breached segment (per kit)

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
  private shoveGlow!: THREE.Sprite;
  private gunGroup = new THREE.Group();
  private gunId = "";
  private aimMarker = new THREE.Group();
  private muzzle = 0; // 0..1 flash
  private fireCd = 0;
  private reloadTimer = 0;
  private reloadTotal = 1;
  private yaw = Math.PI;
  private t = 0;
  private shoveCd = 0;
  private shoveT = 0; // melee swing animation timer
  private heat = 0; // recoil climb on sustained auto fire
  repairing = false;
  repairFrac = 0; // 0..1 progress of the current breach repair (for the HUD)
  atBreach = false; // standing at a broken segment (for the HUD prompt)
  private repairT = 0;

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
    // Scarf
    const scarf = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x7a2e22, roughness: 1, flatShading: true })
    );
    scarf.position.y = 1.52;
    this.group.add(scarf);
    // Shoulder lamp (emissive) + glow
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x223, emissive: new THREE.Color(0x66ffcc), emissiveIntensity: 1 })
    );
    lamp.position.set(-0.44, 1.5, -0.08);
    this.group.add(lamp);
    const lampGlow = makeGlow(0x66ffcc, 0.8, 0.85);
    lampGlow.position.set(-0.44, 1.5, -0.08);
    this.group.add(lampGlow);
    // Holster on the hip
    const holster = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), dark);
    holster.position.set(0.34, 0.72, 0.1);
    this.group.add(holster);
    for (const lx of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.78, 0.26), dark);
      leg.position.set(lx, 0.49, 0);
      leg.castShadow = true;
      this.group.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.4), dark);
      boot.position.set(lx, 0.08, 0.06);
      boot.castShadow = true;
      this.group.add(boot);
    }
    // Goggles across the helmet brow
    const goggles = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x101316, roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(0x1a3a44), emissiveIntensity: 0.5 })
    );
    goggles.position.set(0, 1.79, -0.18);
    this.group.add(goggles);
    // Chest-rig pouches
    for (const px of [-0.2, 0.2]) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.12), olive);
      pouch.position.set(px, 0.95, -0.27);
      this.group.add(pouch);
    }

    // Aim rig — yaws toward the cursor. Holds the rifle, arms, flashlight, muzzle.
    this.aimRig.position.y = 1.4;
    this.group.add(this.aimRig);

    this.aimRig.add(this.gunGroup);
    this.buildGunModel("pistol");
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
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.camera.near = 1;
    this.flashlight.shadow.camera.far = 90;
    this.flashlight.shadow.bias = -0.0009;
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

    // Impact flash for the melee bash, out in front of the swing.
    this.shoveGlow = makeGlow(0xdfe9ff, 3.2, 0);
    this.shoveGlow.position.set(0, 0, -1.7);
    this.aimRig.add(this.shoveGlow);

    // World-space aim reticle on the field — shows exactly where shots land.
    const aimMat = new THREE.MeshBasicMaterial({
      color: 0xff6347,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      depthTest: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28), aimMat);
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), aimMat);
    dot.rotation.x = -Math.PI / 2;
    this.aimMarker.add(ring, dot);
    this.aimMarker.renderOrder = 5;
    this.aimMarker.visible = false;
    scene.add(this.aimMarker);

    scene.add(this.group);
  }

  setAimVisible(b: boolean): void {
    this.aimMarker.visible = b;
  }

  /** Build a distinct silhouette for the held weapon (rebuilt on swap). */
  private buildGunModel(id: string): void {
    if (id === this.gunId) return;
    this.gunId = id;
    for (let i = this.gunGroup.children.length - 1; i >= 0; i--) {
      this.gunGroup.remove(this.gunGroup.children[i]);
    }
    const metal = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.55, metalness: 0.55, flatShading: true });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1, flatShading: true });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.gunGroup.add(m);
      return m;
    };
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const X = 0.12;
    switch (id) {
      case "pistol":
        add(box(0.12, 0.18, 0.42), metal, X, 0.02, -0.42);
        add(box(0.1, 0.22, 0.12), metal, X, -0.16, -0.22); // grip
        break;
      case "smg":
        add(box(0.14, 0.18, 0.7), metal, X, 0.02, -0.5);
        add(box(0.1, 0.28, 0.12), metal, X, -0.18, -0.3); // mag
        add(box(0.1, 0.2, 0.14), metal, X, -0.14, -0.06); // grip
        break;
      case "shotgun":
        add(box(0.16, 0.18, 1.0), metal, X, 0.02, -0.62);
        add(box(0.14, 0.12, 0.5), wood, X, -0.12, -0.4); // pump
        add(box(0.13, 0.16, 0.34), wood, X, -0.02, 0.02); // stock
        break;
      case "rifle":
        add(box(0.14, 0.16, 1.2), metal, X, 0.02, -0.72);
        add(box(0.1, 0.1, 0.3), metal, X, 0.14, -0.55); // scope
        add(box(0.12, 0.16, 0.36), wood, X, -0.02, 0.04); // stock
        break;
      case "lmg":
        add(box(0.2, 0.22, 1.25), metal, X, 0.02, -0.7);
        add(box(0.24, 0.3, 0.34), metal, X, -0.14, -0.4); // box mag
        add(box(0.06, 0.06, 0.5), metal, X, -0.16, -1.0); // bipod-ish barrel
        add(box(0.14, 0.18, 0.36), metal, X, -0.02, 0.06); // stock
        break;
      default:
        add(box(0.14, 0.16, 0.8), metal, X, 0.02, -0.55);
        break;
    }
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
    const lo0 = this.loadout;
    if (lo0) this.buildGunModel(lo0.def.id);

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

    // World aim reticle follows the cursor on the field
    this.aimMarker.position.set(input.aimWorld.x, 0.08, input.aimWorld.z);
    const pulse = 1 + Math.sin(this.t * 8) * 0.08;
    this.aimMarker.scale.set(pulse, pulse, pulse);

    // Flashlight intensity tracks the meter + muzzle flash
    const lightMul = this.ctx.adrenaline.lightMult();
    this.flashlight.intensity = (12 + this.muzzle * 30) * lightMul;
    this.flashlight.castShadow = this.ctx.stage.quality !== "low";
    this.lantern.intensity = 1.5 + Math.sin(this.t * 7) * 0.15;

    // Weapon handling
    this.fireCd -= dt;
    this.shoveCd -= dt;
    this.heat = Math.max(0, this.heat - dt * 0.9);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    // Hold E (context): revive a downed ally nearby, else fix a breach with a kit.
    this.atBreach = this.alive && this.ctx.wall.isBrokenAt(this.x);
    this.repairing = false;
    this.repairFrac = this.repairT / REPAIR_TIME;
    if (this.alive && input.down("KeyE") && this.ctx.companions.reviveTick(this.x, dt)) {
      this.repairing = true;
      this.repairT = 0;
    } else if (
      this.alive &&
      input.down("KeyE") &&
      this.ctx.wall.isBrokenAt(this.x) &&
      this.ctx.run.repairKits > 0
    ) {
      this.repairing = true;
      this.repairT += dt;
      this.repairFrac = clamp(this.repairT / REPAIR_TIME, 0, 1);
      if (Math.random() < 0.4) {
        this.ctx.fx.burst(this.x, 0.6, FIELD.wallZ, 2, 0xffcf6a, { speed: 4, up: 3, life: 0.25, size: 4 });
      }
      if (this.repairT >= REPAIR_TIME) {
        this.ctx.wall.repairSegmentAt(this.x);
        this.ctx.run.repairKits--;
        this.repairT = 0;
        this.repairFrac = 0;
        this.ctx.events.emit("SFX", { id: "pickup" });
      }
    } else {
      this.repairT = 0;
      this.repairFrac = 0;
    }
    if (this.alive && !this.repairing) this.handleInput(dt);

    // Muzzle flash decay
    if (this.muzzle > 0) {
      this.muzzle = Math.max(0, this.muzzle - dt * 12);
      this.muzzleLight.intensity = this.muzzle * 7;
      this.muzzleGlow.material.opacity = this.muzzle;
    }

    // Melee bash swing: pitch the rifle down-and-forward, lunge, flash, recover.
    if (this.shoveT > 0) {
      this.shoveT -= dt;
      const s = Math.sin(clamp(1 - this.shoveT / SHOVE_TIME, 0, 1) * Math.PI);
      this.aimRig.rotation.x = -s * 1.2;
      this.aimRig.position.z = -s * 0.4;
      this.shoveGlow.material.opacity = s * 0.9;
      if (this.shoveT <= 0) {
        this.aimRig.rotation.x = 0;
        this.aimRig.position.z = 0;
        this.shoveGlow.material.opacity = 0;
      }
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

    // Weapon swap: number keys 1–9, Q, or the scroll wheel
    for (let i = 0; i < this.ctx.run.weapons.length && i < 9; i++) {
      if (input.pressed(`Digit${i + 1}`)) this.swapTo(i);
    }
    if (input.pressed("KeyQ")) this.cycleWeapon(1);
    const wheel = input.wheelStep();
    if (wheel !== 0) this.cycleWeapon(wheel);

    if (input.pressed("KeyR")) this.startReload();
    if (input.pressed("Space") && this.shoveCd <= 0) this.shove();

    const wantFire = def.auto ? input.mouseDown : input.mouseJustDown;
    if (wantFire && this.fireCd <= 0 && this.reloadTimer <= 0) {
      if (lo.ammo > 0) {
        this.fire(lo);
      } else if (lo.reserve > 0) {
        this.startReload(); // out of mag but have spare — reload
      } else {
        // Fully empty — a soft throttled click, only on a fresh trigger pull
        this.fireCd = 0.35;
        if (input.mouseJustDown) {
          this.ctx.events.emit("DRY_FIRE", {});
          this.ctx.events.emit("SFX", { id: "dry_fire" });
        }
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

    const spread = def.spread + this.heat;
    for (let p = 0; p < def.pellets; p++) {
      const a = base + (this.ctx.rng.next() - 0.5) * spread * 2;
      this.ctx.bullets.spawn(mx, mz, Math.sin(a), Math.cos(a), def, def.damage, true);
    }
    // Recoil climbs with sustained fire (more on autos), decays when you ease off.
    this.heat = Math.min(0.5, this.heat + (def.auto ? 0.05 : 0.02));
    this.ctx.fx.cone(mx, FLY_Y, mz, sx, sz, 6, def.color, 20);
    // Muzzle smoke puff + an ejected shell casing
    this.ctx.fx.burst(mx, FLY_Y, mz, 2, 0x6a6a6a, { speed: 1.5, up: 1.5, life: 0.5, size: 5, drag: 1.2 });
    this.ctx.fx.burst(this.x + 0.3, 1.5, this.z, 1, 0xc9a24a, { speed: 3, up: 2.5, life: 0.8, size: 4, drag: 1 });
    this.muzzle = 1;
    this.ctx.cam.addTrauma(def.shake);
    this.ctx.cam.kick(-sx, -sz, def.shake * 8);
    this.ctx.events.emit("SHOOT", { weapon: def.id, x: mx, y: FLY_Y, z: mz });
    this.ctx.events.emit("SFX", { id: def.sfx });

    if (lo.ammo <= 0) this.startReload();
  }

  /** Melee bash (Space): a visible swing that knocks attackers off the wall. */
  private shove(): void {
    this.shoveCd = 1.1;
    this.shoveT = SHOVE_TIME;
    this.ctx.events.emit("SFX", { id: "shove" });
    this.ctx.cam.addTrauma(0.18);

    // Swing direction = where you're aiming.
    const dx = this.ctx.input.aimWorld.x - this.x;
    const dz = this.ctx.input.aimWorld.z - this.z;
    const base = Math.atan2(dx, dz);
    const sx = Math.sin(base);
    const sz = Math.cos(base);

    // A fan of debris sweeping across the swing + a bright impact burst.
    for (let i = -2; i <= 2; i++) {
      const a = base + i * 0.32;
      this.ctx.fx.cone(this.x + Math.sin(a) * 1.4, 1.4, this.z + Math.cos(a) * 1.4, Math.sin(a), Math.cos(a), 4, 0xcfe0ff, 14);
    }
    this.ctx.fx.burst(this.x + sx * 2.2, 1.3, this.z + sz * 2.2, 16, 0xeaf2ff, { speed: 11, up: 3, life: 0.3, size: 7 });

    let hit = false;
    for (const z of this.ctx.enemies.alive) {
      if (!z.killable) continue;
      if (Math.abs(z.x - this.x) < 3.4 && z.z > -6) {
        z.repel(8);
        this.ctx.combat.damageZombie(z, 12, false, true);
        hit = true;
      }
    }
    // A tiny crunch on contact sells the bash.
    if (hit) {
      this.ctx.cam.addTrauma(0.15);
      this.ctx.events.emit("TIME_HITSTOP", { s: 0.035 });
    }
  }

  private startReload(): void {
    const lo = this.loadout;
    if (!lo || this.reloadTimer > 0) return;
    if (lo.ammo >= lo.def.mag || lo.reserve <= 0) return;
    this.reloadTimer = lo.def.reload * this.ctx.adrenaline.reloadMult();
    this.reloadTotal = this.reloadTimer;
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

  /** Cycle to the next/prev weapon the player can actually use (skips any an
   * ally is holding). */
  private cycleWeapon(dir: number): void {
    const n = this.ctx.run.weapons.length;
    if (n <= 1) return;
    let i = this.ctx.run.weaponIndex;
    for (let k = 0; k < n; k++) {
      i = (i + (dir > 0 ? 1 : n - 1) + n) % n;
      if (this.ctx.run.canPlayerUse(i)) {
        this.swapTo(i);
        return;
      }
    }
  }

  private swapTo(i: number): void {
    if (i === this.ctx.run.weaponIndex || i >= this.ctx.run.weapons.length) return;
    if (!this.ctx.run.canPlayerUse(i)) {
      const owner = this.ctx.run.weaponOwner[i];
      this.ctx.events.emit("NOTICE", {
        text: `${owner} is carrying the ${this.ctx.run.weapons[i].def.name}`,
        sub: "Reassign it on the LOADOUT screen (pause / dawn)",
      });
      this.ctx.events.emit("SFX", { id: "dry_fire" });
      return;
    }
    this.ctx.run.weaponIndex = i;
    this.reloadTimer = 0;
    this.ctx.events.emit("WEAPON_SWAP", { weapon: this.ctx.run.weapons[i].def.id, index: i });
    this.ctx.events.emit("SFX", { id: "swap" });
  }

  /** True if the current mag is reloading (for the HUD). */
  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  /** Reload completion 0..1 (for the HUD bar). */
  get reloadFrac(): number {
    return this.reloadTimer > 0 ? 1 - this.reloadTimer / this.reloadTotal : 1;
  }
}
