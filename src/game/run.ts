import type { Ctx } from "./ctx";
import { makeLoadout, type Loadout } from "./weapons";
import { RUN } from "../config";

const RESERVES: Record<string, number> = { pistol: 120, smg: 240, shotgun: 48, rifle: 64, lmg: 300 };

/**
 * Persistent run state — everything that must survive across the night/day
 * boundary lives here (weapons, companions, wall integrity, progress). The
 * scene/state flow itself is orchestrated in main.ts; this is the data + a few
 * helpers it mutates.
 */
export class RunManager {
  night = 1;
  leg = 0;
  // Vertical slice = one night + one day to the safe zone. The full game would
  // raise this to 4 (four legs of road).
  legsTotal = 1;
  wallHp: number = RUN.wallMaxHp;
  weapons: Loadout[] = [];
  weaponIndex = 0;
  companions: string[] = [];

  constructor(private ctx: Ctx) {
    void this.ctx;
  }

  /** Begin a fresh run (called from the title). */
  start(): void {
    this.night = 1;
    this.leg = 0;
    this.wallHp = RUN.wallMaxHp;
    this.weapons = [makeLoadout("pistol", RESERVES.pistol), makeLoadout("smg", RESERVES.smg), makeLoadout("shotgun", RESERVES.shotgun)];
    this.weaponIndex = 0;
    this.companions = ["Mara"];
  }

  grantWeapon(id: string): void {
    const existing = this.weapons.find((w) => w.def.id === id);
    if (existing) {
      existing.reserve += RESERVES[id] ?? 30;
      return;
    }
    this.weapons.push(makeLoadout(id, RESERVES[id] ?? 30));
  }

  /** Top every magazine back up to a full mag from reserve (between scenes). */
  refillMags(): void {
    for (const w of this.weapons) {
      const need = w.def.mag - w.ammo;
      const take = Math.min(need, w.reserve);
      w.ammo += take;
      w.reserve -= take;
    }
  }

  get reachedSafeZone(): boolean {
    return this.leg >= this.legsTotal;
  }
}
