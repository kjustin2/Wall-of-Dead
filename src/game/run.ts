import type { Ctx } from "./ctx";
import { makeLoadout, type Loadout } from "./weapons";
import { RUN } from "../config";
import { TRAIT_IDS, type TraitId } from "./traits";

// Tighter reserves so ammo is a real pressure; the pistol is an infinite sidearm.
const RESERVES: Record<string, number> = { pistol: 60, smg: 120, shotgun: 30, rifle: 36, lmg: 160 };

/**
 * Persistent run state — everything that must survive across the night/day
 * boundary (weapons, who holds them, companions, wall integrity, repair kits,
 * progress). The scene/state flow is orchestrated in main.ts.
 *
 * Weapons are a SHARED armory: weaponOwner[i] is null when the player can use
 * slot i, or a companion's name when that ally is holding it (so the player
 * can't, and vice-versa).
 */
export class RunManager {
  night = 1;
  leg = 0;
  legsTotal = 3;
  wallHp: number = RUN.wallMaxHp;
  repairKits = 0;
  traps = 0;
  name = "Defender";
  weapons: Loadout[] = [];
  weaponOwner: (string | null)[] = [];
  weaponIndex = 0;
  companions: string[] = [];
  /** Trait per companion name (drives their combat behavior + character). */
  companionTraits: Record<string, TraitId> = {};
  // Run-tally stats for the ending screen.
  alliesRecruited = 0;
  alliesLost = 0;
  nightsWallHeld: number[] = [];

  constructor(private ctx: Ctx) {}

  start(): void {
    this.night = 1;
    this.leg = 0;
    this.wallHp = RUN.wallMaxHp;
    this.repairKits = 1;
    this.traps = 3;
    const am = this.ctx.tuning.ammo;
    this.weapons = [
      makeLoadout("pistol", RESERVES.pistol),
      makeLoadout("smg", Math.round(RESERVES.smg * am)),
      makeLoadout("shotgun", Math.round(RESERVES.shotgun * am)),
    ];
    // Mara starts holding the SMG (slot 1) — an armed ally from night one, and a
    // live example of the shared armory. You keep the pistol + shotgun.
    this.weaponOwner = [null, "Mara", null];
    this.weaponIndex = 0;
    this.companions = ["Mara"];
    this.companionTraits = { Mara: "gunner" };
    this.alliesRecruited = 0;
    this.alliesLost = 0;
    this.nightsWallHeld = [];
  }

  /** Recruit a survivor: add them with a random trait. Returns the trait. */
  recruit(name: string): TraitId {
    const trait = this.ctx.rng.pick(TRAIT_IDS);
    this.companions.push(name);
    this.companionTraits[name] = trait;
    this.alliesRecruited++;
    return trait;
  }

  grantWeapon(id: string): void {
    const existing = this.weapons.find((w) => w.def.id === id);
    if (existing) {
      existing.reserve += RESERVES[id] ?? 30;
      return;
    }
    this.weapons.push(makeLoadout(id, RESERVES[id] ?? 30));
    this.weaponOwner.push(null);
  }

  /** Add reserve ammo to every weapon (a supply/ammo crate pickup). */
  addAmmo(n: number): void {
    for (const w of this.weapons) w.reserve += n;
  }

  refillMags(): void {
    for (const w of this.weapons) {
      const need = w.def.mag - w.ammo;
      const take = Math.min(need, w.reserve);
      w.ammo += take;
      w.reserve -= take;
    }
  }

  // ---- shared-armory helpers ----
  canPlayerUse(i: number): boolean {
    return this.weaponOwner[i] == null;
  }

  /** Index of the weapon a given ally is holding, or -1. */
  allyWeaponIndex(name: string): number {
    return this.weaponOwner.findIndex((o) => o === name);
  }

  /** Assign slot i to an owner (null = player, or a companion name). Clears any
   * previous holder of that slot; if it was the player's selected weapon, move
   * the player to the first slot they can still use. */
  assignWeapon(i: number, owner: string | null): void {
    if (i < 0 || i >= this.weapons.length) return;
    // An ally can only hold one weapon — release their previous one.
    if (owner) {
      const prev = this.allyWeaponIndex(owner);
      if (prev >= 0) this.weaponOwner[prev] = null;
    }
    this.weaponOwner[i] = owner;
    if (owner && this.weaponIndex === i) {
      const next = this.weaponOwner.findIndex((o) => o == null);
      this.weaponIndex = next >= 0 ? next : 0;
    }
  }

  /** Drop a downed/dead ally: free their weapon and remove from the roster. */
  loseCompanion(name: string): void {
    const wi = this.allyWeaponIndex(name);
    if (wi >= 0) this.weaponOwner[wi] = null;
    this.companions = this.companions.filter((n) => n !== name);
    delete this.companionTraits[name];
    this.alliesLost++;
  }

  get reachedSafeZone(): boolean {
    return this.leg >= this.legsTotal;
  }

  /** A plain snapshot of run state for the mid-run save. */
  serialize(): RunSave {
    return {
      night: this.night,
      leg: this.leg,
      wallHp: this.wallHp,
      repairKits: this.repairKits,
      traps: this.traps,
      weapons: this.weapons.map((w) => ({ id: w.def.id, ammo: w.ammo, reserve: w.reserve })),
      weaponOwner: this.weaponOwner.slice(),
      weaponIndex: this.weaponIndex,
      companions: this.companions.slice(),
      companionTraits: { ...this.companionTraits },
      alliesRecruited: this.alliesRecruited,
      alliesLost: this.alliesLost,
      nightsWallHeld: this.nightsWallHeld.slice(),
    };
  }

  /** Restore run state from a save snapshot. */
  load(d: RunSave): void {
    this.night = d.night;
    this.leg = d.leg;
    this.wallHp = d.wallHp;
    this.repairKits = d.repairKits;
    this.traps = d.traps;
    this.weapons = d.weapons.map((w) => {
      const lo = makeLoadout(w.id, w.reserve);
      lo.ammo = w.ammo;
      return lo;
    });
    this.weaponOwner = d.weaponOwner.slice();
    this.weaponIndex = d.weaponIndex;
    this.companions = d.companions.slice();
    this.companionTraits = { ...d.companionTraits };
    this.alliesRecruited = d.alliesRecruited;
    this.alliesLost = d.alliesLost;
    this.nightsWallHeld = d.nightsWallHeld.slice();
  }
}

export interface RunSave {
  night: number;
  leg: number;
  wallHp: number;
  repairKits: number;
  traps: number;
  weapons: { id: string; ammo: number; reserve: number }[];
  weaponOwner: (string | null)[];
  weaponIndex: number;
  companions: string[];
  companionTraits: Record<string, TraitId>;
  alliesRecruited: number;
  alliesLost: number;
  nightsWallHeld: number[];
}
