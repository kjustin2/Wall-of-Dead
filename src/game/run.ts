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
    this.weaponOwner = [null, null, null]; // all yours until you assign one to an ally
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
}
