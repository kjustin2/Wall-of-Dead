import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "./ui/style.css";

import { Stage } from "./render/stage";
import { CameraRig } from "./render/cameraRig";
import { Particles } from "./render/particles";
import { Telegraphs } from "./render/telegraphs";
import { Floaters } from "./render/floaters";
import { World } from "./render/world";
import { Input } from "./core/input";
import { EventBus } from "./core/events";
import { Rng } from "./core/rng";
import { Sfx } from "./audio/sfx";
import { Music } from "./audio/music";
import { Adrenaline } from "./game/adrenaline";
import { Wall } from "./game/wall";
import { Combat } from "./game/combat";
import { EnemyManager } from "./game/zombie";
import { Bullets } from "./game/bullets";
import { CompanionManager } from "./game/companion";
import { GrenadeManager } from "./game/grenade";
import { Player } from "./game/player";
import { RunManager } from "./game/run";
import { WaveDirector } from "./game/waveDirector";
import { Scavenge } from "./minigames/scavenge";
import { Hud } from "./ui/hud";
import { Menus } from "./ui/menus";
import { freshStats, type Ctx } from "./game/ctx";
import { RUN, FIELD } from "./config";
import { clamp } from "./core/math";

type GameState = "menu" | "cutscene" | "night" | "day" | "report" | "loot" | "paused" | "dead" | "victory";

const STORY = [
  "The dead rose at dusk, and the highway choked on the living.",
  "What's left of the convoy threw up a barricade on the last road to the safe zone.",
  "You and Mara hold the line — fire over the wall, keep them in the dark.",
  "Survive the night. Scavenge by dawn. Don't let them over.",
];

const canvas = document.getElementById("game") as HTMLCanvasElement;

// ---------------------------------------------------------------- boot wiring
const ctx = {} as Ctx;
ctx.stage = new Stage(canvas);
ctx.cam = new CameraRig(ctx.stage.camera);
ctx.events = new EventBus();
ctx.rng = new Rng(0x51ed);
ctx.input = new Input(canvas);
ctx.fx = new Particles(ctx.stage.scene);
ctx.tele = new Telegraphs(ctx.stage.scene);
ctx.floaters = new Floaters(ctx.stage.camera);
ctx.world = new World(ctx.stage);
ctx.sfx = new Sfx(ctx.events);
ctx.music = new Music();
ctx.stats = freshStats();
ctx.playing = false;
ctx.adrenaline = new Adrenaline(ctx.events);
ctx.wall = new Wall(ctx.stage.scene, ctx.events);
ctx.combat = new Combat(ctx);
ctx.enemies = new EnemyManager(ctx, ctx.stage.scene);
ctx.bullets = new Bullets(ctx, ctx.stage.scene);
ctx.companions = new CompanionManager(ctx, ctx.stage.scene);
ctx.grenades = new GrenadeManager(ctx, ctx.stage.scene);
ctx.player = new Player(ctx, ctx.stage.scene);
ctx.run = new RunManager(ctx);

ctx.world.onFlash = () => window.setTimeout(() => ctx.events.emit("SFX", { id: "thunder" }), 650);

const scavenge = new Scavenge(ctx, ctx.stage.scene);
const hud = new Hud(ctx);
hud.bindScavenge(scavenge);
const menus = new Menus(ctx);
menus.applySettings();

let state: GameState = "menu";
let resumeState: GameState = "night";
let settingsReturn: () => void = () => toTitle();
let director: WaveDirector | null = null;
let lootContinue: () => void = () => {};
let surgeMusic = false;
let heartbeatTimer = 0;

// Audio unlock on first gesture
const unlock = () => {
  ctx.sfx.resume();
  ctx.music.resume();
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

// ---------------------------------------------------------------- state flow
function toTitle(): void {
  state = "menu";
  ctx.enemies.clear();
  ctx.bullets.clear();
  ctx.grenades.clear();
  ctx.companions.clear();
  ctx.fx.clear();
  ctx.tele.clear();
  ctx.floaters.clear();
  ctx.player.group.visible = false;
  ctx.cam.mode = "menu";
  ctx.world.setDawn(0.12);
  hud.setMode("hidden");
  scavenge.hide();
  ctx.sfx.startAmbient();
  ctx.music.play("menu");
  menus.showTitle(startRun, () => {
    settingsReturn = () => menus.showTitle(startRun, settingsReturn);
    menus.showSettings(() => toTitle());
  });
}

function startRun(): void {
  menus.clear();
  ctx.run.start();
  ctx.stats = freshStats();
  ctx.player.group.visible = true;
  toCutscene();
}

function toCutscene(): void {
  menus.clear();
  state = "cutscene";
  ctx.enemies.clear();
  ctx.bullets.clear();
  ctx.grenades.clear();
  ctx.fx.clear();
  ctx.wall.setTotal(ctx.run.wallHp);
  ctx.player.reset();
  ctx.player.group.visible = true;
  ctx.companions.spawnFromRun();
  ctx.cam.mode = "cutscene";
  ctx.world.setDawn(0.16);
  hud.setMode("hidden");
  ctx.input.enabled = false;
  ctx.sfx.startAmbient();
  menus.storyIntro(STORY, beginNight);
}

function beginNight(): void {
  menus.clear();
  ctx.run.refillMags();
  ctx.wall.setTotal(ctx.run.wallHp);
  ctx.player.reset();
  ctx.companions.spawnFromRun();
  ctx.enemies.clear();
  ctx.bullets.clear();
  ctx.grenades.clear();
  ctx.fx.clear();
  ctx.tele.clear();
  ctx.adrenaline.reset();
  ctx.combat.resetForNight();
  director = new WaveDirector(ctx);
  ctx.cam.mode = "rampart";
  ctx.cam.target.set(0, 0, ctx.player.z);
  ctx.cam.snap();
  ctx.world.setDawn(0);
  hud.setMode("night");
  ctx.input.enabled = true;
  state = "night";
  ctx.sfx.startAmbient();
  surgeMusic = false;
  ctx.music.play("night");
  ctx.events.emit("NIGHT_START", { night: ctx.run.night });
  hud.banner(`NIGHT ${ctx.run.night}`, "Hold until dawn");
}

function onDawn(): void {
  state = "report";
  ctx.input.enabled = false;
  ctx.run.wallHp = ctx.wall.totalHp();
  ctx.stats.wallHeld = ctx.wall.integrityFrac() * 100;
  ctx.world.setDawn(0.7);
  ctx.events.emit("SFX", { id: "dawn_sting" });
  hud.setMode("hidden");
  const lines = [
    `Kills tonight — ${ctx.stats.kills}`,
    `Wall integrity — ${Math.round(ctx.wall.integrityFrac() * 100)}%`,
    `Defenders standing — ${ctx.companions.aliveCount + 1}`,
  ];
  menus.showDayReport(lines, startDay);
}

function startDay(): void {
  menus.clear();
  ctx.enemies.clear();
  ctx.bullets.clear();
  ctx.grenades.clear();
  ctx.world.setDawn(0.9);
  hud.setMode("day");
  ctx.input.enabled = true;
  ctx.music.play("day");
  scavenge.start();
  state = "day";
  hud.banner("GRAB THE SUPPLIES", "Reach the lit crates · avoid the dead");
}

function onDayDone(tier: string, frac: number): void {
  scavenge.hide();
  state = "loot";
  ctx.input.enabled = false;

  const repair = Math.round(40 + 220 * frac);
  ctx.run.wallHp = clamp(ctx.run.wallHp + repair, 0, RUN.wallMaxHp);
  const foundRifle = !ctx.run.weapons.some((w) => w.def.id === "rifle");
  if (foundRifle) ctx.run.grantWeapon("rifle");
  else ctx.run.grantWeapon("shotgun");

  ctx.run.leg += 1;

  const lines = [
    `Run rating — ${tier}  (${Math.round(frac * 100)}% supplies)`,
    `Wall repaired to ${Math.round((ctx.run.wallHp / RUN.wallMaxHp) * 100)}%`,
    foundRifle ? "Found a RIFLE in the wreckage!" : "Restocked shotgun shells.",
  ];

  lootContinue = () => {
    menus.clear();
    if (ctx.run.reachedSafeZone) onVictory();
    else {
      ctx.run.night += 1;
      beginNight();
    }
  };
  menus.showDayLoot(lines, lootContinue);
}

function onVictory(): void {
  state = "victory";
  ctx.cam.mode = "menu";
  ctx.world.setDawn(1);
  hud.setMode("hidden");
  ctx.music.play("victory");
  ctx.events.emit("RUN_VICTORY", {});
  menus.showVictory(ctx.stats, startRun, toTitle);
}

function defeat(reason: string): void {
  if (state === "dead") return;
  state = "dead";
  ctx.input.enabled = false;
  ctx.cam.addTrauma(0.6);
  ctx.stage.punch(0.6);
  ctx.events.emit("SFX", { id: "defeat" });
  ctx.events.emit("RUN_DEFEAT", { reason });
  ctx.music.play("defeat");
  hud.setMode("hidden");
  menus.showDeath(reason, ctx.stats, startRun, toTitle);
}

function doLastStand(): void {
  if (!ctx.adrenaline.canCrash()) return;
  // Throw the frag toward where you're aiming, out in the field.
  const aim = ctx.input.aimWorld;
  const tx = clamp(aim.x, -FIELD.wallHalf + 2, FIELD.wallHalf - 2);
  const tz = clamp(aim.z, -62, FIELD.attackZ - 1);
  if (!ctx.grenades.throwTo(ctx.player.x, ctx.player.z, tx, tz)) return;
  ctx.adrenaline.crash();
  ctx.stats.lastStands++;
  ctx.events.emit("LAST_STAND", { x: tx, z: tz });
  ctx.cam.pulseFov(0.3);
}

function pause(): void {
  if (state !== "night" && state !== "day") return;
  resumeState = state;
  state = "paused";
  ctx.input.enabled = false;
  settingsReturn = openPause;
  openPause();
}
function openPause(): void {
  menus.showPause(
    resume,
    () => {
      menus.clear();
      startRun();
    },
    () => menus.showSettings(() => settingsReturn()),
    () => {
      menus.clear();
      toTitle();
    }
  );
}
function resume(): void {
  menus.clear();
  ctx.input.enabled = true;
  state = resumeState;
}

// ---------------------------------------------------------------- events
ctx.events.on("PLAYER_DIED", () => {
  if (state === "night") defeat("You fell at the wall.");
});
ctx.events.on("DAY_DONE", ({ tier, frac }) => onDayDone(tier, frac));
ctx.events.on("ADRENALINE_ZONE", ({ zone, prev }) => {
  if (zone === "surge" && prev !== "surge") ctx.events.emit("SFX", { id: "meter_full" });
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (state === "night" || state === "day") pause();
    else if (state === "paused") resume();
  }
});

// ---------------------------------------------------------------- frame loop
let last = performance.now();
ctx.stage.renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.playing = state === "night" || state === "day";

  if (state === "night" && director) {
    ctx.stats.time += dt;
    ctx.input.updateAim(ctx.stage.camera);
    director.update(dt);
    ctx.world.setDawn(Math.min(0.5, director.progress * 0.5));
    hud.setDawnProgress(director.progress);
    if (!surgeMusic && director.progress > 0.82) {
      surgeMusic = true;
      ctx.music.play("surge");
    }
    ctx.player.update(dt);
    ctx.enemies.update(dt);
    ctx.bullets.update(dt);
    ctx.grenades.update(dt);
    ctx.companions.update(dt);
    ctx.adrenaline.update(dt);
    if (ctx.input.pressed("KeyF")) doLastStand();
    // Low-HP heartbeat
    if (ctx.player.alive && ctx.player.hp / ctx.player.maxHp < 0.3) {
      heartbeatTimer -= dt;
      if (heartbeatTimer <= 0) {
        heartbeatTimer = 0.9;
        ctx.events.emit("SFX", { id: "heartbeat" });
      }
    }
    hud.update(dt);
    if (ctx.wall.fullyOverrun()) defeat("The wall was overrun.");
    else if (director.done) onDawn();
  } else if (state === "day") {
    ctx.input.updateAim(ctx.stage.camera);
    scavenge.update(dt);
    hud.update(dt);
  } else {
    hud.update(dt);
  }

  ctx.world.update(dt);
  ctx.fx.update(dt);
  ctx.tele.update(dt);
  ctx.floaters.update(dt);
  ctx.cam.update(dt);
  ctx.music.update(dt);
  ctx.stage.update(dt);
  ctx.stage.render(dt);
  ctx.input.endFrame();
});

// Boot into the title
toTitle();

// Debug hook for console debugging + headless smoke tests (harmless in prod).
(window as unknown as Record<string, unknown>).__wod = {
  ctx,
  state: () => state,
  startRun,
  startDay,
  forceDawn: () => {
    if (director) director.elapsed = director.length;
    ctx.enemies.clear();
  },
  completeDay: () => scavenge.debugComplete(),
  continueAfterLoot: () => lootContinue(),
  lastStand: doLastStand,
  spawnWave: (type: string, n: number) => {
    for (let i = 0; i < n; i++) ctx.enemies.spawn(type, ctx.rng.range(-20, 20));
  },
};
