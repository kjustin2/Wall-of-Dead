import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "./ui/style.css";

import { Stage, type Quality } from "./render/stage";
import { CameraRig } from "./render/cameraRig";
import { Particles } from "./render/particles";
import { Telegraphs } from "./render/telegraphs";
import { Floaters } from "./render/floaters";
import { Decals } from "./render/decals";
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
import { Deployables } from "./game/deployables";
import { Player } from "./game/player";
import { RunManager } from "./game/run";
import { TRAITS } from "./game/traits";
import { WaveDirector } from "./game/waveDirector";
import { Scavenge } from "./minigames/scavenge";
import { Hud } from "./ui/hud";
import { Menus } from "./ui/menus";
import { freshStats, type Ctx } from "./game/ctx";
import { FIELD, DIFFICULTY } from "./config";
import { clamp } from "./core/math";

type GameState = "menu" | "cutscene" | "night" | "day" | "report" | "loot" | "paused" | "dead" | "victory";

const STORY = [
  "The dead rose at dusk, and the highway choked on the living.",
  "What's left of the convoy threw up a barricade on the last road to the safe zone.",
  "You and Mara hold the line — fire over the wall, keep them in the dark.",
  "Survive the night. Scavenge by dawn. Don't let them over.",
];

const NIGHT_FLAVOR = [
  "Hold until dawn.",
  "They came back angrier. Hold the line.",
  "Last stretch of road. Whatever it takes — hold.",
];

// Inter-night radio chatter shown on the dawn report after surviving night N.
const STORY_BEATS: Record<number, string> = {
  1: "Convoy: 'You held. Two legs of road left to the safe zone. Move at dusk.'",
  2: "Convoy: 'Something big is dragging itself toward you. Last night — make it count.'",
};

// A radio bark as each later night begins (drip-feeds the convoy's plight).
const NIGHT_RADIO: Record<number, string> = {
  2: "Convoy: 'Fuel's low, road's long — buy us one more dawn.'",
  3: "Convoy: 'This is the gate. Hold it and we all walk out.'",
};

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
ctx.decals = new Decals(ctx.stage.scene);
ctx.world = new World(ctx.stage);
ctx.sfx = new Sfx(ctx.events);
ctx.music = new Music();
ctx.stats = freshStats();
ctx.tuning = DIFFICULTY.normal;
ctx.playing = false;
ctx.adrenaline = new Adrenaline(ctx.events);
ctx.wall = new Wall(ctx.stage.scene, ctx.events);
ctx.combat = new Combat(ctx);
ctx.enemies = new EnemyManager(ctx, ctx.stage.scene);
ctx.bullets = new Bullets(ctx, ctx.stage.scene);
ctx.companions = new CompanionManager(ctx, ctx.stage.scene);
ctx.grenades = new GrenadeManager(ctx, ctx.stage.scene);
ctx.deployables = new Deployables(ctx, ctx.stage.scene);
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
let streak = 0;
let streakTimer = 0;
let fHeld = false;

// Audio unlock on first gesture
const unlock = () => {
  ctx.sfx.resume();
  ctx.music.resume();
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

// ------------------------------------------------------------- save / resume
const SAVE_KEY = "wod-save";
function saveRun(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ run: ctx.run.serialize(), stats: ctx.stats }));
  } catch {
    /* localStorage may be unavailable */
  }
}
function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}
function resumeRun(): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      startRun();
      return;
    }
    const d = JSON.parse(raw) as { run: ReturnType<RunManager["serialize"]>; stats: typeof ctx.stats };
    ctx.run.load(d.run);
    ctx.stats = { ...freshStats(), ...d.stats };
  } catch {
    startRun();
    return;
  }
  menus.clear();
  ctx.player.group.visible = true;
  beginNight();
}

// ---------------------------------------------------------------- state flow
function toTitle(): void {
  state = "menu";
  ctx.enemies.clear();
  ctx.bullets.clear();
  ctx.grenades.clear();
  ctx.deployables.clear();
  ctx.companions.clear();
  ctx.fx.clear();
  ctx.decals.clear();
  ctx.tele.clear();
  ctx.floaters.clear();
  ctx.player.group.visible = false;
  ctx.wall.group.visible = true; // the wall is the title backdrop
  ctx.world.setFieldClutter(true);
  ctx.cam.mode = "menu";
  scavenge.hide(); // restore fog BEFORE we set the menu lighting
  ctx.world.setWeather(true); // rainy, moody title backdrop
  ctx.world.setDawn(0.12);
  hud.setMode("hidden");
  ctx.sfx.startAmbient();
  ctx.music.play("menu");
  menus.showTitle(
    beginRun,
    () => {
      settingsReturn = () => toTitle();
      menus.showSettings(() => toTitle());
    },
    hasSave() ? resumeRun : undefined
  );
}

/** First-ever BEGIN shows the tutorial; afterwards it starts straight away
 * (the Tutorial button on the title is always available). */
function beginRun(): void {
  let played = false;
  try {
    played = !!localStorage.getItem("wod-played");
  } catch {
    /* ignore */
  }
  if (played) {
    startRun();
    return;
  }
  menus.showHelp(() => {
    try {
      localStorage.setItem("wod-played", "1");
    } catch {
      /* ignore */
    }
    startRun();
  }, "START ▶");
}

function startRun(): void {
  menus.clear();
  clearSave();
  ctx.run.start();
  ctx.stats = freshStats();
  ctx.player.group.visible = true;
  toCutscene();
}

function toCutscene(): void {
  menus.clear();
  state = "cutscene";
  scavenge.hide();
  ctx.enemies.clear();
  ctx.bullets.clear();
  ctx.grenades.clear();
  ctx.deployables.clear();
  ctx.fx.clear();
  ctx.decals.clear();
  restoreWall();
  ctx.wall.group.visible = true;
  ctx.world.setFieldClutter(true);
  ctx.player.reset();
  ctx.player.group.visible = true;
  ctx.companions.spawnFromRun();
  ctx.companions.setMarkersVisible(false); // crew on the wall, but no floating UI in the cutscene
  ctx.cam.mode = "cutscene";
  ctx.world.setDawn(0.16);
  hud.setMode("hidden");
  ctx.input.enabled = false;
  ctx.sfx.startAmbient();
  menus.storyIntro(STORY, beginNight);
}

function beginNight(): void {
  menus.clear();
  // Checkpoint: the run is saved at the start of every night.
  saveRun();
  scavenge.hide();
  ctx.run.refillMags();
  restoreWall(); // per-segment HP persists — breaches do NOT auto-heal between nights
  ctx.wall.dmgMul = ctx.tuning.enemyDmg;
  ctx.wall.group.visible = true;
  ctx.world.setFieldClutter(true);
  // Each night gets its own weather: clear → storm → ominous-clear.
  ctx.world.setWeather(ctx.run.night === 2);
  ctx.player.reset();
  ctx.player.group.visible = true;
  ctx.companions.spawnFromRun();
  ctx.enemies.clear();
  ctx.bullets.clear();
  ctx.grenades.clear();
  ctx.deployables.clear();
  ctx.fx.clear();
  ctx.decals.clear();
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
  streak = 0;
  streakTimer = 0;
  ctx.music.play("night");
  ctx.events.emit("NIGHT_START", { night: ctx.run.night });
  hud.banner(`NIGHT ${ctx.run.night} / ${ctx.run.legsTotal}`, NIGHT_FLAVOR[(ctx.run.night - 1) % NIGHT_FLAVOR.length]);

  // A radio beat as later nights open.
  const radio = NIGHT_RADIO[ctx.run.night];
  if (radio) {
    window.setTimeout(() => {
      if (state === "night") hud.banner("📻 RADIO", radio);
    }, 3200);
  }

  // First-night tutorial prompts
  if (ctx.run.night === 1) {
    const tip = (delay: number, t: string, s: string) =>
      window.setTimeout(() => {
        if (state === "night") hud.banner(t, s);
      }, delay);
    tip(4500, "MOVE & AIM", "A / D move · mouse aim · click fire");
    tip(9500, "HOLD THE WALL", "R reload · SPACE shove · E plug a breach");
    tip(14500, "FIELD TACTICS", "Press T to drop a spike trap in front of the wall");
    tip(20000, "ADRENALINE", "Fill the meter, then hold F to lob a frag");
  }
}

/** Restore the wall to its persisted per-segment HP (breaches survive nights). */
function restoreWall(): void {
  if (ctx.run.wallSegs.length) ctx.wall.setSegHp(ctx.run.wallSegs);
  else ctx.wall.setTotal(ctx.run.wallHp);
}

function onDawn(): void {
  state = "report";
  ctx.input.enabled = false;
  ctx.run.wallHp = ctx.wall.totalHp();
  ctx.run.wallSegs = ctx.wall.segHp(); // persist exact breach state, no averaging
  ctx.stats.wallHeld = ctx.wall.integrityFrac() * 100;
  // Cinematic dawn: the sun crests and fog burns off over a short beat.
  ctx.world.setDawn(0.92);
  ctx.companions.setMarkersVisible(false); // no floating nameplates over the report
  ctx.events.emit("SFX", { id: "dawn_sting" });
  ctx.events.emit("SFX", { id: "birdsong" });
  ctx.cam.pulseFov(0.5);
  requestSlowmo(1.0, 0.35); // a clear "you survived" beat
  hud.setMode("hidden");
  ctx.run.nightsWallHeld.push(Math.round(ctx.wall.integrityFrac() * 100));
  // Allies still down at dawn are lost (their weapon returns to the pool). Their
  // trait gives the loss a voice.
  const lost = ctx.companions.downedNames();
  const eulogies = lost.map((n) => {
    const tr = ctx.run.companionTraits[n];
    return tr ? `${n} ${TRAITS[tr].lostLine}` : `${n} is gone.`;
  });
  for (const name of lost) ctx.run.loseCompanion(name);
  const beat = STORY_BEATS[ctx.run.night] ?? "";
  const lines = [
    `Kills tonight — ${ctx.stats.kills}`,
    `Wall integrity — ${Math.round(ctx.wall.integrityFrac() * 100)}%`,
    `Allies — ${ctx.run.companions.length}${lost.length ? ` (lost ${lost.join(", ")})` : ""}`,
    ...eulogies,
    ...(beat ? [`📻 ${beat}`] : []),
  ];
  // Let the dawn breathe for a moment before the report panel slides in.
  window.setTimeout(() => {
    if (state === "report") menus.showDayReport(lines, startDay);
  }, 1300);
}

function startDay(): void {
  menus.clear();
  ctx.enemies.clear();
  ctx.bullets.clear();
  ctx.grenades.clear();
  ctx.deployables.clear();
  // Clear world-space night FX too, or blood decals / particles / telegraphs /
  // floaters from the last seconds of the fight bleed onto the supply-run floor.
  ctx.fx.clear();
  ctx.decals.clear();
  ctx.tele.clear();
  ctx.floaters.clear();
  hud.setMode("day");
  ctx.input.enabled = true;
  ctx.music.play("day");
  // Hide the night defenders/wall + field clutter — the supply run is its own
  // self-contained dark scene (so you can't walk through collision-less wrecks).
  ctx.player.group.visible = false;
  ctx.wall.group.visible = false;
  ctx.companions.setVisible(false);
  ctx.world.setFieldClutter(false);
  scavenge.start();
  state = "day";
  hud.banner("SUPPLY RUN", "Sneak the dark · stay out of their sight");
}

function onDayDone(tier: string, frac: number): void {
  scavenge.hide();
  state = "loot";
  ctx.input.enabled = false;
  hud.setMode("hidden");

  // Ammo + repair kits were gathered live in the run; top mags and find a weapon.
  ctx.run.refillMags();
  const finds = ["rifle", "lmg"];
  const found = finds.find((id) => !ctx.run.weapons.some((w) => w.def.id === id)) ?? null;
  if (found) ctx.run.grantWeapon(found);
  else ctx.run.addAmmo(60);
  ctx.run.traps += 2;

  ctx.run.leg += 1;

  const lines = [
    `Run rating — ${tier}  (${Math.round(frac * 100)}% ammo crates)`,
    `Repair kits — ${ctx.run.repairKits}`,
    found ? `Found a ${found.toUpperCase()} in the wreckage!` : "Restocked extra ammo.",
  ];

  lootContinue = () => {
    menus.clear();
    if (ctx.run.reachedSafeZone) {
      onVictory();
      return;
    }
    // A dawn dilemma before pressing on — one choice, one consequence.
    offerDilemma(() => {
      ctx.run.night += 1;
      beginNight();
    });
  };
  menus.showDayLoot(lines, lootContinue);
}

/** A light, memorable dawn choice — touches only run resources. */
function offerDilemma(after: () => void): void {
  const haveSlot = ctx.run.companions.length < 4;
  const strangerName = ["Harlan", "Pike", "Dunn", "Sora"].find((n) => !ctx.run.companions.includes(n)) ?? "a stranger";
  // Alternate the dilemma by which leg you're on.
  if (ctx.run.leg % 2 === 1 && haveSlot) {
    menus.showDilemma(
      "A figure at the fenceline",
      `${strangerName} is begging to come in. Taking them in means another mouth — but another gun on the wall.`,
      [
        {
          label: "Open the gate",
          detail: "Recruit them as an ally (random trait).",
          onPick: () => {
            const tr = ctx.run.recruit(strangerName);
            hud.banner(`${strangerName} joins you`, `${TRAITS[tr].label} — "${TRAITS[tr].recruitLine}"`);
          },
        },
        {
          label: "Send them off",
          detail: "Keep the line lean. They leave you their kit (+1 repair kit).",
          onPick: () => {
            ctx.run.repairKits += 1;
          },
        },
      ],
      after
    );
  } else {
    menus.showDilemma(
      "A sealed supply cache",
      "There's a locked cache off the road. Cracking it is loud — it might pay off, or draw the wrong attention.",
      [
        {
          label: "Crack it open",
          detail: "Gamble: likely +120 ammo… or you lose a repair kit.",
          onPick: () => {
            if (ctx.rng.chance(0.65)) {
              ctx.run.addAmmo(120);
              hud.banner("CACHE CRACKED", "+120 ammo across the armory");
            } else {
              ctx.run.repairKits = Math.max(0, ctx.run.repairKits - 1);
              hud.banner("IT WAS A TRAP", "Lost a repair kit getting out");
            }
          },
        },
        {
          label: "Leave it",
          detail: "Play it safe. Steady your nerves (+1 repair kit).",
          onPick: () => {
            ctx.run.repairKits += 1;
          },
        },
      ],
      after
    );
  }
}

function onVictory(): void {
  state = "victory";
  clearSave();
  ctx.companions.setMarkersVisible(false);
  ctx.cam.mode = "menu";
  ctx.world.setDawn(1);
  hud.setMode("hidden");
  ctx.music.play("victory");
  ctx.events.emit("RUN_VICTORY", {});
  menus.showVictory(ctx.stats, startRun, toTitle, endingLines());
}

function defeat(reason: string): void {
  if (state === "dead") return;
  state = "dead";
  clearSave();
  ctx.companions.setMarkersVisible(false);
  ctx.input.enabled = false;
  ctx.cam.addTrauma(0.6);
  ctx.stage.punch(0.6);
  ctx.events.emit("SFX", { id: "defeat" });
  ctx.events.emit("RUN_DEFEAT", { reason });
  ctx.music.play("defeat");
  hud.setMode("hidden");
  menus.showDeath(reason, ctx.stats, startRun, toTitle, endingLines());
}

/** Extra run-summary lines for the ending screens (the richer epilogue). */
function endingLines(): string[] {
  const r = ctx.run;
  const lines: string[] = [
    `Survivors with you — ${r.companions.length}  ·  rescued ${r.alliesRecruited}  ·  lost ${r.alliesLost}`,
  ];
  if (r.nightsWallHeld.length) {
    lines.push(`Wall held per night — ${r.nightsWallHeld.map((p) => `${p}%`).join(" · ")}`);
  }
  return lines;
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
    },
    () => menus.showHelp(openPause),
    () => menus.showLoadout(openPause),
    ctx.stats
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
ctx.events.on("WALL_BREACH", () => {
  if (state === "night") hud.banner("BREACH!", "Plug the gap — hold E (needs a kit)");
});
ctx.events.on("NOTICE", ({ text, sub }) => hud.banner(text, sub ?? ""));
ctx.events.on("COMPANION_DOWN", ({ name }) => {
  // A downed ally drops their weapon back into the pool.
  const wi = ctx.run.allyWeaponIndex(name);
  if (wi >= 0) ctx.run.weaponOwner[wi] = null;
  if (state === "night") hud.banner(`${name} is DOWN`, "Revive with E or lose them at dawn");
});
ctx.events.on("MINIBOSS", ({ name }) => {
  hud.banner(name, "It'll smash the wall — hit it hard");
  ctx.events.emit("SFX", { id: "brute_slam" });
  ctx.cam.addTrauma(0.4);
  requestSlowmo(0.5, 0.5);
});
ctx.events.on("ZOMBIE_KILLED", ({ kind }) => {
  if (state !== "night") return;
  if (kind === "behemoth") {
    // Finale kill-cam: a long dilation + camera punch as the Behemoth falls.
    requestSlowmo(1.6, 0.22);
    ctx.cam.pulseFov(0.9);
    ctx.cam.addTrauma(0.7);
    ctx.stage.punch(0.6);
    ctx.events.emit("SFX", { id: "boss_roar" });
    hud.banner("THE BEHEMOTH FALLS", "Hold to first light");
  }
  streak++;
  streakTimer = 2.6;
  if (streak === 5 || streak === 10 || streak === 15 || streak === 20 || streak === 30) {
    hud.banner(`${streak} KILL STREAK`, streak >= 20 ? "RAMPAGE" : streak >= 10 ? "UNSTOPPABLE" : "");
    ctx.events.emit("SFX", { id: "streak" });
  }
});
ctx.events.on("ADRENALINE_ZONE", ({ zone, prev }) => {
  if (zone === "surge" && prev !== "surge") {
    ctx.events.emit("SFX", { id: "meter_full" });
    requestSlowmo(0.22, 0.55);
    // One-time teach for the signature mechanic the first time you hit surge.
    if (state === "night") {
      let taught = false;
      try {
        taught = !!localStorage.getItem("wod-surge-taught");
      } catch {
        /* ignore */
      }
      if (!taught) {
        hud.banner("⚡ SURGE — LAST STAND READY", "Hold F to lob the frag");
        try {
          localStorage.setItem("wod-surge-taught", "1");
        } catch {
          /* ignore */
        }
      }
    }
  }
});

// ---------------------------------------------------------------- time feel
// Hit-stop = a very short full freeze (capped so it never reads as lag).
// Slow-mo = a brief, intentional dilation on big moments. Game systems run on a
// scaled dt; camera/world/UI/music run on real dt so feedback stays smooth.
let hitStop = 0;
let slowmo = 0;
let slowmoStrength = 1;
function requestHitStop(s: number): void {
  hitStop = Math.min(0.09, Math.max(hitStop, s));
}
function requestSlowmo(s: number, strength: number): void {
  if (s > slowmo) {
    slowmo = s;
    slowmoStrength = strength;
  }
}
ctx.events.on("TIME_HITSTOP", ({ s }) => requestHitStop(s));
ctx.events.on("TIME_SLOWMO", ({ s, strength }) => requestSlowmo(s, strength));

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (state === "night" || state === "day") pause();
    else if (state === "paused") resume();
  }
});

// ---------------------------------------------------------------- frame loop
let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let qualityNudged = false;
// Boot FPS probe → pick the starting quality preset (unless the user set one).
let bootProbe = false;
let probeAccum = 0;
let probeFrames = 0;
function applyBootQuality(): void {
  if (menus.settings.qualityTouched) return; // respect an explicit choice
  const fps = probeFrames > 8 ? probeFrames / probeAccum : 60;
  const q: Quality = fps < 35 ? "low" : fps < 50 ? "medium" : "high";
  if (q !== menus.settings.quality) {
    menus.settings.quality = q;
    ctx.stage.applyQuality(q);
  }
}
ctx.stage.renderer.setAnimationLoop(() => {
  const now = performance.now();
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.playing = state === "night" || state === "day";
  ctx.input.poll(realDt);

  // Resolve time scale: hit-stop freezes, then slow-mo, else normal.
  let scale = 1;
  if (hitStop > 0) {
    hitStop -= realDt;
    scale = 0;
  } else if (slowmo > 0) {
    slowmo -= realDt;
    scale = slowmoStrength;
  }
  const dt = realDt * scale;

  if (bootProbe) {
    probeAccum += realDt;
    probeFrames++;
  }

  // Adaptive quality: if sustained FPS is poor, lower the render resolution a
  // step. Crucially this uses stage.downscale() (cheap) — NOT applyQuality(),
  // which rebuilds the whole post chain and would stall (= the "random freeze").
  if (ctx.playing) {
    fpsAccum += realDt;
    fpsFrames++;
    if (fpsAccum >= 2 && !qualityNudged) {
      const fps = fpsFrames / fpsAccum;
      if (fps < 45) {
        if (!ctx.stage.downscale()) qualityNudged = true; // hit the floor — stop
      }
      fpsAccum = 0;
      fpsFrames = 0;
    }
  }

  if (state === "night" && director) {
    ctx.stats.time += dt;
    ctx.input.updateAim(ctx.stage.camera);
    director.update(dt);
    ctx.world.setDawn(Math.min(0.2, director.progress * 0.26));
    hud.setDawnProgress(director.progress, director.length * (1 - director.progress));
    if (!surgeMusic && director.progress > 0.82) {
      surgeMusic = true;
      ctx.music.play("surge");
    }
    // Adaptive music: swell with how many are pressing the wall, peak at dawn.
    ctx.music.setIntensity(Math.min(1, ctx.enemies.count / 14) * 0.7 + director.progress * 0.3);
    ctx.player.update(dt);
    ctx.enemies.update(dt);
    ctx.bullets.update(dt);
    ctx.grenades.update(dt);
    ctx.deployables.update(dt);
    ctx.companions.update(dt);
    ctx.adrenaline.update(dt);
    // Hold F to aim the frag (landing ring preview), release to throw.
    if (ctx.adrenaline.canCrash() && ctx.input.down("KeyF")) {
      const tx = clamp(ctx.input.aimWorld.x, -FIELD.wallHalf + 2, FIELD.wallHalf - 2);
      const tz = clamp(ctx.input.aimWorld.z, -62, FIELD.attackZ - 1);
      ctx.grenades.showPreview(tx, tz);
      fHeld = true;
    } else {
      if (fHeld) doLastStand();
      fHeld = false;
      ctx.grenades.hidePreview();
    }
    if (streakTimer > 0) {
      streakTimer -= dt;
      if (streakTimer <= 0) streak = 0;
    }
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

  ctx.player.setAimVisible(state === "night");
  // Gameplay FX freeze with the game clock; camera/world/post run real-time so
  // feedback stays smooth even mid hit-stop.
  ctx.fx.update(dt);
  ctx.tele.update(dt);
  ctx.decals.update(realDt);
  ctx.floaters.update(realDt);
  ctx.world.update(realDt);
  ctx.cam.update(realDt);
  ctx.music.update(realDt);
  ctx.stage.update(realDt);
  ctx.stage.render(realDt);
  ctx.input.endFrame();
});

// Boot: a brief loading screen while the menu track buffers + an FPS probe runs,
// then the title. Capped so it never stalls (the smoke waits on the title).
state = "menu";
menus.showLoading();
bootProbe = true;
Promise.race([ctx.music.preload(), new Promise<void>((r) => window.setTimeout(r, 1200))]).then(() => {
  bootProbe = false;
  applyBootQuality();
  ctx.stage.warmUp(); // pre-compile shaders so the first wave doesn't hitch
  toTitle();
});

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
  scavengeShown: () => scavenge.visible,
  dayObjectCount: () => scavenge.objectCount,
  setNightProgress: (p: number) => {
    if (director) director.elapsed = director.length * p;
  },
  continueAfterLoot: () => lootContinue(),
  lastStand: doLastStand,
  spawnWave: (type: string, n: number) => {
    for (let i = 0; i < n; i++) ctx.enemies.spawn(type, ctx.rng.range(-20, 20));
  },
};
