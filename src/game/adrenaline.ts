import type { EventBus, AdrenalineZone } from "../core/events";
import { clamp } from "../core/math";

interface ZoneDef {
  zone: AdrenalineZone;
  min: number;
  damage: number;
  fireRate: number; // multiplier on rate of fire (>1 = faster)
  move: number;
  reload: number; // multiplier on reload DURATION (<1 = faster)
  light: number; // flashlight intensity multiplier
}

// Bottom-up thresholds. Below 25 = shaken; 82+ = surge (can crash).
const ZONES: ZoneDef[] = [
  { zone: "shaken", min: 0, damage: 0.9, fireRate: 0.92, move: 0.92, reload: 1.12, light: 0.82 },
  { zone: "steady", min: 25, damage: 1.0, fireRate: 1.0, move: 1.0, reload: 1.0, light: 1.0 },
  { zone: "focused", min: 60, damage: 1.15, fireRate: 1.12, move: 1.06, reload: 0.92, light: 1.18 },
  { zone: "surge", min: 82, damage: 1.35, fireRate: 1.22, move: 1.12, reload: 0.84, light: 1.45 },
];

const RESTING = 35;
const CRASH_MIN = 82;

/**
 * The signature meter. Holding the line and landing kills pushes it hot
 * (faster, harder, brighter); taking wall/player damage drains it cold. At
 * surge you can spend it on a Last Stand. Never set directly — all changes flow
 * through gain/drain/crash so ADRENALINE_ZONE always fires on a boundary cross.
 */
export class Adrenaline {
  value = RESTING;
  private zoneDef: ZoneDef = ZONES[1];

  constructor(private events: EventBus) {}

  reset(): void {
    this.value = RESTING;
    this.zoneDef = this.zoneFor(this.value);
  }

  private zoneFor(v: number): ZoneDef {
    let z = ZONES[0];
    for (const def of ZONES) if (v >= def.min) z = def;
    return z;
  }

  private set(v: number): void {
    const prev = this.zoneDef.zone;
    this.value = clamp(v, 0, 100);
    const next = this.zoneFor(this.value);
    if (next.zone !== prev) {
      this.zoneDef = next;
      this.events.emit("ADRENALINE_ZONE", { zone: next.zone, prev });
    } else {
      this.zoneDef = next;
    }
  }

  gain(n: number): void {
    this.set(this.value + n);
  }

  drain(n: number): void {
    this.set(this.value - n);
  }

  update(dt: number): void {
    // Slow drift back toward resting from either side.
    const target = RESTING;
    const rate = this.value > target ? 3.2 : 2.2;
    if (Math.abs(this.value - target) > 0.1) {
      const dir = this.value > target ? -1 : 1;
      this.set(this.value + dir * rate * dt);
    }
  }

  get zone(): AdrenalineZone {
    return this.zoneDef.zone;
  }
  damageMult(): number {
    return this.zoneDef.damage;
  }
  fireRateMult(): number {
    return this.zoneDef.fireRate;
  }
  moveMult(): number {
    return this.zoneDef.move;
  }
  reloadMult(): number {
    return this.zoneDef.reload;
  }
  lightMult(): number {
    return this.zoneDef.light;
  }

  canCrash(): boolean {
    return this.value >= CRASH_MIN;
  }

  /** Spend the meter for a Last Stand. Returns true if it fired. */
  crash(): boolean {
    if (!this.canCrash()) return false;
    this.set(12);
    return true;
  }
}
