import * as THREE from "three";
import type { Ctx } from "./ctx";
import { FIELD } from "../config";
import { makeGlow, makeLabel } from "../render/textures";
import { TRAITS, type TraitId } from "./traits";

const RANGE = 64;
const ALLY = 0x52e0a0;
const BARKS = ["On your left!", "Reloading!", "They're at the gate!", "Hold the line!", "Got your back!", "So many of 'em!"];

function bar(color: number, w: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false, depthWrite: false, fog: false }));
  s.scale.set(w, 0.14, 1);
  s.renderOrder = 9;
  return s;
}

/**
 * A rescued survivor holding the wall beside you. They wield a weapon assigned
 * from the shared armory (run.weaponOwner) — drawing its ammo, falling back to
 * melee when it's empty — show a mini health bar, take damage from crossers, and
 * can go down (revivable with E; lost at dawn if not revived).
 */
class Companion {
  group = new THREE.Group();
  hp = 70;
  maxHp = 70;
  down = false;
  private cd = 0;
  private muzzle: THREE.PointLight;
  private marker = new THREE.Group();
  private hpFill: THREE.Sprite;
  private hpBg: THREE.Sprite;
  private meleeLabel: THREE.Sprite;
  private t = 0;
  private barkTimer = 5;
  private reviveP = 0;
  private aimRig = new THREE.Group();
  private gun: THREE.Mesh;

  constructor(public name: string, public x: number, scene: THREE.Scene, public trait?: TraitId) {
    this.group.position.set(x, FIELD.rampartHeight, FIELD.rampartZ + 0.4);
    const coat = new THREE.MeshStandardMaterial({ color: 0x2f7d6c, roughness: 1, flatShading: true });
    const vest = new THREE.MeshStandardMaterial({ color: 0x1f4f45, roughness: 1, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 1, flatShading: true });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.98, 0.42), coat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.5, 0.46), vest);
    chest.position.y = 1.02;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.42), vest);
    cap.position.y = 1.84;
    for (const lx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), vest);
      leg.position.set(lx, 0.4, 0);
      this.group.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.34), vest);
      boot.position.set(lx, 0.07, 0.05);
      this.group.add(boot);
    }
    // Shoulders, a small backpack, and a coat skirt — same build language as the
    // defender so allies read as part of the same crew.
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.2, 0.46), coat);
    shoulders.position.y = 1.34;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.28), vest);
    pack.position.set(0, 0.98, 0.34);
    pack.castShadow = true;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.14), coat);
    skirt.position.set(0, 0.58, 0.12);
    this.group.add(torso, chest, head, cap, shoulders, pack, skirt);

    // Trait-distinct gear + accent color on the nameplate-matching kit.
    if (this.trait) {
      const accent = new THREE.Color(TRAITS[this.trait].color);
      const accMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8, flatShading: true, emissive: accent.clone().multiplyScalar(0.25) });
      if (this.trait === "medic") {
        // a white cross on the pack
        const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0x66ffaa), emissiveIntensity: 0.7 });
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06), cm);
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.06), cm);
        c1.position.set(0, 1.0, 0.49);
        c2.position.set(0, 1.0, 0.49);
        this.group.add(c1, c2);
      } else if (this.trait === "gunner") {
        // a bandolier across the chest
        const belt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.14), accMat);
        belt.position.set(0, 1.0, -0.22);
        belt.rotation.z = 0.7;
        this.group.add(belt);
      } else {
        // marksman: a peaked cap + a scope rail accent
        const peak = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.2), accMat);
        peak.position.set(0, 1.78, -0.22);
        this.group.add(peak);
      }
    }

    this.aimRig.position.y = 1.25;
    this.aimRig.rotation.y = Math.PI;
    this.gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.14, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.6, metalness: 0.5 })
    );
    this.gun.position.set(0.1, 0, 0.5);
    this.aimRig.add(this.gun);
    this.group.add(this.aimRig);

    this.muzzle = new THREE.PointLight(0xffd27a, 0, 8, 2);
    this.muzzle.position.set(0, 1.25, -0.7);
    this.group.add(this.muzzle);

    // Ally marker: glow + chevron + nameplate
    const glow = makeGlow(ALLY, 2.4, 0.45);
    glow.position.y = 2.5;
    const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.44, 4), new THREE.MeshBasicMaterial({ color: ALLY, fog: false }));
    chevron.rotation.x = Math.PI;
    chevron.position.y = 2.55;
    const tLabel = trait ? TRAITS[trait].label.toUpperCase() : "ALLY";
    const label = makeLabel(`${name}  ·  ${tLabel}`, trait ? TRAITS[trait].color : "#9dffd0");
    label.position.y = 3.05;
    this.meleeLabel = makeLabel("⚠ MELEE — NO AMMO", "#ff7a5a");
    this.meleeLabel.position.y = 2.78;
    this.meleeLabel.scale.set(3, 0.75, 1);
    this.meleeLabel.visible = false;
    this.marker.add(glow, chevron, label, this.meleeLabel);
    this.group.add(this.marker);

    // Mini health bar (billboarded)
    this.hpBg = bar(0x10171a, 1.25);
    this.hpBg.position.y = 2.18;
    this.hpFill = bar(ALLY, 1.2);
    this.hpFill.center.set(0, 0.5); // left-anchored so it drains from the right
    this.hpFill.position.set(-0.6, 2.18, 0);
    this.group.add(this.hpBg, this.hpFill);

    scene.add(this.group);
  }

  private setBar(): void {
    const frac = Math.max(0, this.hp / this.maxHp);
    this.hpFill.scale.x = 1.2 * frac;
    (this.hpFill.material as THREE.SpriteMaterial).color.setHSL(frac * 0.33, 0.7, 0.5);
    const show = !this.down && frac < 0.999;
    this.hpBg.visible = show;
    this.hpFill.visible = show;
  }

  update(dt: number, ctx: Ctx): void {
    this.t += dt;
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 24);
    this.marker.position.y = Math.sin(this.t * 3) * 0.12;
    this.marker.rotation.y = this.t * 0.8;
    this.setBar();
    // "MELEE" indicator when this ally has no usable weapon
    const wiNow = ctx.run.allyWeaponIndex(this.name);
    const loNow = wiNow >= 0 ? ctx.run.weapons[wiNow] : null;
    this.meleeLabel.visible = !this.down && (!loNow || (loNow.ammo <= 0 && loNow.reserve <= 0));
    if (this.down) return;
    this.cd -= dt;

    // Medic: steadily patches themselves and the nearby defender.
    if (this.trait === "medic") {
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4);
      const p = ctx.player;
      if (p.alive && Math.abs(p.x - this.x) < 6 && p.hp < p.maxHp) p.heal(dt * 3);
    }

    this.barkTimer -= dt;
    if (this.barkTimer <= 0) {
      this.barkTimer = 6 + ctx.rng.next() * 8;
      ctx.floaters.spawn(this.x, 3.4, this.group.position.z, ctx.rng.pick(BARKS), "heal");
    }

    // Nearest live zombie in front — or nearest to the player's mark if commanded
    const focus = ctx.companions.focusActive();
    const fp = ctx.companions.focusPoint();
    const ox = focus ? fp.x : this.x;
    const oz = focus ? fp.z : this.group.position.z;
    let target: { x: number; z: number; obj: import("./zombie").Zombie } | null = null;
    let bestD = RANGE * RANGE;
    for (const z of ctx.enemies.alive) {
      if (!z.killable || z.z > this.group.position.z) continue;
      const dx = z.x - ox;
      const dz = z.z - oz;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        target = { x: z.x, z: z.z, obj: z };
      }
    }
    if (!target) return;

    this.aimRig.rotation.y = Math.atan2(-(target.x - this.x), -(target.z - this.group.position.z));
    if (this.cd > 0) return;

    const wi = ctx.run.allyWeaponIndex(this.name);
    const lo = wi >= 0 ? ctx.run.weapons[wi] : null;

    if (lo && (lo.ammo > 0 || lo.reserve > 0)) {
      if (lo.ammo <= 0) {
        const take = Math.min(lo.def.mag, lo.reserve);
        lo.ammo += take;
        lo.reserve -= take;
        this.cd = lo.def.reload;
        return;
      }
      lo.ammo--;
      // Gunner fires faster; Marksman shoots tighter and hits harder.
      const rof = this.trait === "gunner" ? 0.62 : 1;
      const spreadMul = this.trait === "marksman" ? 0.35 : 1;
      const dmgMul = this.trait === "marksman" ? 1.3 : 1;
      this.cd = lo.def.fireRate * 1.35 * rof;
      const dx = target.x - this.x;
      const dz = target.z - this.group.position.z;
      const base = Math.atan2(dx, dz);
      for (let p = 0; p < lo.def.pellets; p++) {
        const a = base + (ctx.rng.next() - 0.5) * lo.def.spread * 2 * spreadMul;
        ctx.bullets.spawn(this.x, this.group.position.z, Math.sin(a), Math.cos(a), lo.def, lo.def.damage * dmgMul, false);
      }
      this.gun.visible = true;
      this.muzzle.intensity = 4;
      ctx.events.emit("SFX", { id: lo.def.sfx });
    } else {
      // No weapon / out of ammo — melee only (close range)
      this.gun.visible = !!lo;
      if (Math.sqrt(bestD) < 2.6) {
        this.cd = 0.85;
        ctx.combat.damageZombie(target.obj, 14, false, false);
        ctx.fx.cone(this.x, 1.4, this.group.position.z - 1.2, 0, -1, 8, 0xbfd0e0, 12);
        ctx.events.emit("SFX", { id: "shove" });
      } else {
        this.cd = 0.3;
      }
    }
  }

  hurt(dmg: number, ctx: Ctx): void {
    if (this.down) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.down = true;
      this.group.rotation.z = 1.4;
      this.group.position.y = 0.3 + FIELD.rampartHeight;
      ctx.events.emit("COMPANION_DOWN", { name: this.name });
    }
  }

  revive(dt: number, ctx: Ctx): boolean {
    if (!this.down) return false;
    this.reviveP += dt / 2.5;
    if (this.reviveP >= 1) {
      this.down = false;
      this.reviveP = 0;
      this.hp = Math.round(this.maxHp * 0.5);
      this.group.rotation.z = 0;
      this.group.position.y = FIELD.rampartHeight;
      ctx.floaters.spawn(this.x, 3.4, this.group.position.z, `${this.name} UP!`, "heal");
      return true;
    }
    return false;
  }
}

export class CompanionManager {
  list: Companion[] = [];
  private focusX = 0;
  private focusZ = 0;
  private focusT = 0;

  constructor(private ctx: Ctx, private scene: THREE.Scene) {}

  /** Order allies to concentrate fire on the mark for a few seconds. */
  commandFocus(x: number, z: number): void {
    this.focusX = x;
    this.focusZ = z;
    this.focusT = 5;
  }
  focusActive(): boolean {
    return this.focusT > 0;
  }
  focusPoint(): { x: number; z: number } {
    return { x: this.focusX, z: this.focusZ };
  }

  spawnFromRun(): void {
    this.clear();
    const names = this.ctx.run.companions;
    const n = names.length;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? -8 : -16 + (32 / Math.max(1, n - 1)) * i;
      this.list.push(new Companion(names[i], x, this.scene, this.ctx.run.companionTraits[names[i]]));
    }
  }

  get aliveCount(): number {
    return this.list.filter((c) => !c.down).length;
  }

  /** Names of allies still down (dead) at dawn. */
  downedNames(): string[] {
    return this.list.filter((c) => c.down).map((c) => c.name);
  }

  setVisible(b: boolean): void {
    for (const c of this.list) c.group.visible = b;
  }

  reviveTick(x: number, dt: number): boolean {
    for (const c of this.list) {
      if (!c.down) continue;
      if (Math.abs(c.x - x) < 3.4) {
        c.revive(dt, this.ctx);
        return true;
      }
    }
    return false;
  }

  update(dt: number): void {
    if (this.focusT > 0) this.focusT -= dt;
    for (const c of this.list) c.update(dt, this.ctx);
    for (const z of this.ctx.enemies.alive) {
      if (z.state !== "crossing") continue;
      for (const c of this.list) {
        if (c.down) continue;
        const dx = z.x - c.x;
        const dz = z.z - c.group.position.z;
        if (dx * dx + dz * dz < 1.6) c.hurt(8 * dt * 6, this.ctx);
      }
    }
  }

  clear(): void {
    for (const c of this.list) this.scene.remove(c.group);
    this.list.length = 0;
  }
}
