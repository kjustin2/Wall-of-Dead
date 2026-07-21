import * as THREE from "three";
import type { Ctx } from "./ctx";
import { FIELD } from "../config";
import { makeGlow, makeLabel } from "../render/textures";
import { TRAITS, type TraitId } from "./traits";
import { ALLY_SIDEARM } from "./weapons";

const RANGE = 64;
const ALLY = 0x52e0a0;

// Trait-flavored barks, split by morale tone (grim / steady / hot) so the roster's
// voice tracks how the night is going — a confident crew sounds different from a
// crew watching the wall come down.
type BarkMood = "grim" | "steady" | "hot";
const TRAIT_BARKS: Record<string, Record<BarkMood, string[]>> = {
  marksman: {
    grim: ["Running dry up here.", "Too many in the dark.", "I can't cover it all."],
    steady: ["Lining one up.", "Got an angle.", "Eyes on the field."],
    hot: ["One shot, one less!", "They're dropping!", "Can't miss tonight!"],
  },
  medic: {
    grim: ["We're hurting!", "Hold on — patching up!", "Don't go down on me."],
    steady: ["Stay close, I've got you.", "Keep breathing.", "I'll keep us up."],
    hot: ["Nobody dies tonight!", "I've got us — keep pushing!", "We're holding!"],
  },
  gunner: {
    grim: ["Belt's almost out!", "They keep coming!", "Don't make me fall back!"],
    steady: ["Holding this lane.", "Let 'em come.", "On the line."],
    hot: ["Feed it and forget it!", "This lane is MINE!", "Mow 'em down!"],
  },
  none: {
    grim: ["This is bad.", "So many of 'em.", "Hold the line!"],
    steady: ["On your left!", "Got your back!", "Steady."],
    hot: ["We've got this!", "Push 'em back!", "That's how it's done!"],
  },
};
// Call-and-reply lines between two survivors ({A} = speaker, {B} = the other).
const EXCHANGES: [string, string][] = [
  ["You holding up, {B}?", "Still here, {A}. Keep firing."],
  ["How many's that, {B}?", "Lost count, {A}. Too many."],
  ["{B}, watch the gap!", "On it, {A}!"],
  ["We make it to dawn, {B}?", "We make it, {A}. We have to."],
  ["Reloading — cover me, {B}!", "Go, {A}, I've got the lane."],
];

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
  private meleeLabel: THREE.Sprite; // gun assigned but empty → "OUT OF AMMO"
  private noGunLabel: THREE.Sprite; // no weapon assigned at all → "NEEDS A GUN"
  private nameLabel!: THREE.Sprite;
  private t = 0;
  private barkTimer = 5;
  private reviveP = 0;
  private revivedThisFrame = false;
  private markersVisible = true;
  private aimRig = new THREE.Group();
  private gun: THREE.Group;

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
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), skin);
    neck.position.y = 1.42;
    this.group.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.42), vest);
    cap.position.y = 1.84;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.16), vest);
    brim.position.set(0, 1.78, -0.26);
    this.group.add(brim);
    // A dark visor across the brow.
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.08, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x0d1014, roughness: 0.4, metalness: 0.4, emissive: new THREE.Color(0x16323a), emissiveIntensity: 0.5 })
    );
    visor.position.set(0, 1.66, 0.2);
    this.group.add(visor);
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
    // A proper little carbine instead of a plain box: receiver + barrel + mag +
    // stock, plus gloved arms reaching to hold it (they yaw with the aim rig).
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.6, metalness: 0.5, flatShading: true });
    const gun = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.62), gunMat);
    receiver.position.z = 0.42;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.88;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.1), gunMat);
    mag.position.set(0, -0.17, 0.3);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.24), gunMat);
    stock.position.z = 0.04;
    gun.add(receiver, barrel, mag, stock);
    gun.position.set(0.1, 0, 0.0);
    this.gun = gun;
    this.aimRig.add(this.gun);
    const handMat = new THREE.MeshStandardMaterial({ color: 0x101316, roughness: 1, flatShading: true });
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.5), coat);
    armR.position.set(0.16, -0.05, 0.34);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), coat);
    armL.position.set(0.04, -0.06, 0.56);
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), handMat);
    handR.position.set(0.12, -0.04, 0.58);
    this.aimRig.add(armR, armL, handR);
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
    this.nameLabel = label;
    // Two status nameplates that share the nameplate slot (only one ever shows):
    // an assigned gun that's run dry vs. an ally with no gun at all.
    this.meleeLabel = makeLabel("⚠ OUT OF AMMO", "#ffcf6a");
    this.meleeLabel.position.y = 3.05;
    this.meleeLabel.scale.set(3.2, 0.8, 1);
    this.meleeLabel.visible = false;
    this.noGunLabel = makeLabel("⚠ NEEDS A GUN", "#ff9a5a");
    this.noGunLabel.position.y = 3.05;
    this.noGunLabel.scale.set(3.2, 0.8, 1);
    this.noGunLabel.visible = false;
    this.marker.add(glow, chevron, label, this.meleeLabel, this.noGunLabel);
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

  /** Free this ally's per-instance geometry/materials/label textures (called on
   * clear so repeated runs don't leak GPU memory). */
  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
      mesh.geometry?.dispose?.();
      const mat = mesh.material;
      if (Array.isArray(mat)) for (const m of mat) this.disposeMat(m);
      else if (mat) this.disposeMat(mat);
    });
  }
  private disposeMat(m: THREE.Material): void {
    const withMap = m as THREE.Material & { map?: THREE.Texture | null };
    withMap.map?.dispose?.();
    m.dispose();
  }

  /** Toggle the floating UI markers (nameplate, chevron, glow, melee/hp) — kept
   * off during cutscenes/reports so they don't intrude on those screens. */
  showMarkers(b: boolean): void {
    this.markersVisible = b;
    this.marker.visible = b;
    this.setBar();
  }

  private setBar(): void {
    const frac = Math.max(0, this.hp / this.maxHp);
    this.hpFill.scale.x = 1.2 * frac;
    (this.hpFill.material as THREE.SpriteMaterial).color.setHSL(frac * 0.33, 0.7, 0.5);
    const show = this.markersVisible && !this.down && frac < 0.999;
    this.hpBg.visible = show;
    this.hpFill.visible = show;
  }

  update(dt: number, ctx: Ctx): void {
    this.t += dt;
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 24);
    this.marker.position.y = Math.sin(this.t * 3) * 0.12;
    this.marker.rotation.y = this.t * 0.8;
    this.setBar();
    // Status nameplate: a dry assigned gun reads "OUT OF AMMO"; an ally with no
    // gun reads "NEEDS A GUN". The name and these share one slot — only one shows.
    const wiNow = ctx.run.allyWeaponIndex(this.name);
    const loNow = wiNow >= 0 ? ctx.run.weapons[wiNow] : null;
    const outOfAmmo = !this.down && !!loNow && loNow.ammo <= 0 && loNow.reserve <= 0;
    const needsGun = !this.down && !loNow;
    this.meleeLabel.visible = outOfAmmo;
    this.noGunLabel.visible = needsGun;
    this.nameLabel.visible = !outOfAmmo && !needsGun;
    if (this.down) {
      // Revive progress bleeds back down if you stop holding E (don't bank it).
      if (!this.revivedThisFrame) this.reviveP = Math.max(0, this.reviveP - dt * 0.6);
      this.revivedThisFrame = false;
      return;
    }
    this.cd -= dt;

    // Medic: steadily patches themselves and the nearby defender.
    if (this.trait === "medic") {
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4);
      const p = ctx.player;
      if (p.alive && Math.abs(p.x - this.x) < 6 && p.hp < p.maxHp) p.heal(dt * 3);
    }

    this.barkTimer -= dt;
    if (this.markersVisible && this.barkTimer <= 0) {
      const m = ctx.companions.moraleLevel();
      this.barkTimer = (m > 0.5 ? 7 : 5) + ctx.rng.next() * 8;
      const mood: BarkMood = m < 0.32 ? "grim" : m > 0.7 ? "hot" : "steady";
      const set = TRAIT_BARKS[this.trait ?? "none"] ?? TRAIT_BARKS.none;
      const tone = m < 0.32 ? "warn" : m > 0.7 ? "crit" : "heal";
      ctx.floaters.spawn(this.x, 3.4, this.group.position.z, ctx.rng.pick(set[mood]), tone);
    }

    // Target: within this ally's reach (so they don't fire across the whole map),
    // simply the nearest threat in front of them.
    let target: { x: number; z: number; obj: import("./zombie").Zombie } | null = null;
    let bestScore = Infinity;
    for (const z of ctx.enemies.alive) {
      if (!z.killable || z.z > this.group.position.z) continue;
      const ddx = z.x - this.x;
      const ddz = z.z - this.group.position.z;
      if (ddx * ddx + ddz * ddz > RANGE * RANGE) continue;
      const score = ddx * ddx + ddz * ddz;
      if (score < bestScore) {
        bestScore = score;
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
      // A confident crew (high morale) fires a touch faster; a shaken one slower.
      this.cd = lo.def.fireRate * 1.35 * rof * ctx.companions.moraleRof();
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
      // No assigned gun (or it's truly empty) — plink with the weak, infinite
      // sidearm instead of standing around.
      this.cd = ALLY_SIDEARM.fireRate * 1.5;
      const dx = target.x - this.x;
      const dz = target.z - this.group.position.z;
      const base = Math.atan2(dx, dz);
      const a = base + (ctx.rng.next() - 0.5) * ALLY_SIDEARM.spread * 2;
      ctx.bullets.spawn(this.x, this.group.position.z, Math.sin(a), Math.cos(a), ALLY_SIDEARM, ALLY_SIDEARM.damage, false);
      this.gun.visible = true;
      this.muzzle.intensity = 2.6;
      ctx.events.emit("SFX", { id: ALLY_SIDEARM.sfx });
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
    this.revivedThisFrame = true; // tells update() not to decay progress this frame
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
  /** Crew morale 0..1 — lifts on kills, drops on losses/breaches. Nudges ally
   *  fire-rate + bark tone, giving the roster a felt mood. */
  private morale = 0.55;
  private exchangeT = 16;
  private pendingReply: { line: string; x: number; z: number; t: number } | null = null;

  constructor(private ctx: Ctx, private scene: THREE.Scene) {
    // Morale reacts to the night: kills lift it, allies going down or the wall
    // breaching knock it back. (Manager is created once — no listener leak.)
    this.ctx.events.on("ZOMBIE_KILLED", () => { this.morale = Math.min(1, this.morale + 0.012); });
    this.ctx.events.on("COMPANION_DOWN", () => { this.morale = Math.max(0, this.morale - 0.2); });
    this.ctx.events.on("WALL_BREACH", () => { this.morale = Math.max(0, this.morale - 0.12); });
  }

  moraleLevel(): number {
    return this.morale;
  }
  /** Fire-cooldown multiplier from morale (<1 = faster when confident). */
  moraleRof(): number {
    return 1.18 - this.morale * 0.36;
  }

  spawnFromRun(): void {
    this.clear();
    this.morale = 0.55; // a fresh night starts even-keeled
    this.pendingReply = null;
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

  /** Hide just the floating markers (keep the bodies) — for cutscene/report. */
  setMarkersVisible(b: boolean): void {
    for (const c of this.list) c.showMarkers(b);
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
    // Morale drifts back toward neutral.
    this.morale += (0.55 - this.morale) * Math.min(1, dt * 0.05);

    // Ally-to-ally exchanges: an occasional call-and-reply between two survivors so
    // the roster feels alive without a dialogue tree.
    this.exchangeT -= dt;
    const up = this.list.filter((c) => !c.down);
    if (this.exchangeT <= 0) {
      this.exchangeT = 15 + this.ctx.rng.next() * 12;
      if (up.length >= 2) {
        const a = this.ctx.rng.pick(up);
        let b = this.ctx.rng.pick(up);
        for (let k = 0; k < 4 && b === a; k++) b = this.ctx.rng.pick(up);
        if (b !== a) {
          const [call, reply] = this.ctx.rng.pick(EXCHANGES);
          const fill = (s: string) => s.replace("{A}", a.name).replace("{B}", b.name);
          this.ctx.floaters.spawn(a.x, 3.6, a.group.position.z, fill(call), "heal");
          this.pendingReply = { line: fill(reply), x: b.x, z: b.group.position.z, t: 1.4 };
        }
      }
    }
    if (this.pendingReply) {
      this.pendingReply.t -= dt;
      if (this.pendingReply.t <= 0) {
        this.ctx.floaters.spawn(this.pendingReply.x, 3.6, this.pendingReply.z, this.pendingReply.line, "heal");
        this.pendingReply = null;
      }
    }

    for (const c of this.list) c.update(dt, this.ctx);
    for (const z of this.ctx.enemies.alive) {
      if (z.state !== "crossing") continue;
      for (const c of this.list) {
        if (c.down) continue;
        const dx = z.x - c.x;
        const dz = z.z - c.group.position.z;
        // ~48 DPS, scaled by difficulty like every other damage path (player/wall).
        if (dx * dx + dz * dz < 1.6) c.hurt(48 * dt * this.ctx.tuning.enemyDmg, this.ctx);
      }
    }
  }

  clear(): void {
    for (const c of this.list) {
      this.scene.remove(c.group);
      c.dispose();
    }
    this.list.length = 0;
  }
}
