import type { Stage } from "../render/stage";
import type { CameraRig } from "../render/cameraRig";
import type { EventBus } from "../core/events";
import type { Input } from "../core/input";
import type { Rng } from "../core/rng";
import type { Particles } from "../render/particles";
import type { Telegraphs } from "../render/telegraphs";
import type { Floaters } from "../render/floaters";
import type { World } from "../render/world";
import type { Sfx } from "../audio/sfx";
import type { Combat } from "./combat";
import type { Adrenaline } from "./adrenaline";
import type { Wall } from "./wall";
import type { Player } from "./player";
import type { EnemyManager } from "./zombie";
import type { Bullets } from "./bullets";
import type { CompanionManager } from "./companion";
import type { GrenadeManager } from "./grenade";
import type { RunManager } from "./run";

export interface Stats {
  kills: number;
  headshots: number;
  time: number;
  wallHeld: number; // % wall integrity at dawn
  cratesGrabbed: number;
  lastStands: number;
}

export function freshStats(): Stats {
  return { kills: 0, headshots: 0, time: 0, wallHeld: 0, cratesGrabbed: 0, lastStands: 0 };
}

/** The shared service bag, built once in main.ts and passed to every system. */
export interface Ctx {
  stage: Stage;
  cam: CameraRig;
  events: EventBus;
  input: Input;
  rng: Rng;
  fx: Particles;
  tele: Telegraphs;
  floaters: Floaters;
  world: World;
  sfx: Sfx;
  combat: Combat;
  adrenaline: Adrenaline;
  wall: Wall;
  player: Player;
  enemies: EnemyManager;
  bullets: Bullets;
  companions: CompanionManager;
  grenades: GrenadeManager;
  run: RunManager;
  stats: Stats;
  /** True only while the active scene is in its interactive update phase. */
  playing: boolean;
}
