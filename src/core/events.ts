/**
 * Typed synchronous pub-sub. Event names and payloads are compile-checked — a
 * typo'd emit is a type error, not a silent no-op. This is the nervous system:
 * combat, audio, HUD and screen-feedback all talk through it.
 */

export type AdrenalineZone = "shaken" | "steady" | "focused" | "surge";

export interface EventMap {
  /** Fire-and-forget one-shot sound; the id must resolve in audio/sfx.ts.
   *  Optional pan in [-1,1] for positional stereo. */
  SFX: { id: string; pan?: number };

  SHOOT: { weapon: string; x: number; y: number; z: number };
  RELOAD: { weapon: string };
  WEAPON_SWAP: { weapon: string; index: number };
  DRY_FIRE: Record<string, never>;

  ZOMBIE_HIT: {
    x: number;
    y: number;
    z: number;
    dmg: number;
    headshot: boolean;
    killed: boolean;
    heavy: boolean;
  };
  ZOMBIE_KILLED: { x: number; z: number; kind: string };

  WALL_HIT: { seg: number; x: number; dmg: number };
  WALL_BREACH: { seg: number; x: number };

  PLAYER_HIT: { dmg: number; dirX: number; dirZ: number };
  PLAYER_DIED: Record<string, never>;
  HEAL: { amount: number };

  ADRENALINE_ZONE: { zone: AdrenalineZone; prev: AdrenalineZone };
  LAST_STAND: { x: number; z: number };

  /** Brief full freeze for impact (capped short so it reads as juice). */
  TIME_HITSTOP: { s: number };
  /** Brief slow-motion (strength = time scale, e.g. 0.4). */
  TIME_SLOWMO: { s: number; strength: number };

  NIGHT_START: { night: number };
  MINIBOSS: { name: string };
  DAWN: Record<string, never>;
  DAY_DONE: { tier: string; frac: number };
  RUN_VICTORY: Record<string, never>;
  RUN_DEFEAT: { reason: string };

  COMPANION_DOWN: { name: string };
  CRATE_GRABBED: { got: number; total: number };

  UI_CLICK: Record<string, never>;
  UI_HOVER: Record<string, never>;
}

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void;

export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<keyof EventMap>>>();

  on<K extends keyof EventMap>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<keyof EventMap>);
    return () => set.delete(fn as Handler<keyof EventMap>);
  }

  emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of set) (fn as Handler<K>)(payload);
  }
}
