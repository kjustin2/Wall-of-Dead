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
import { RunManager, freshMods, type RunMods } from "./game/run";
import { WEAPONS } from "./game/weapons";
import { TRAITS } from "./game/traits";
import { WaveDirector, nightStats } from "./game/waveDirector";
import { actLevelLabel, bossTypeKeys, campaignNodeLabels, levelInfo, TOTAL_LEVELS } from "./game/acts";
import { TYPES } from "./game/zombie";
import { Scavenge, type Density } from "./minigames/scavenge";
import { renderStats, sceneAudit } from "./render/diagnostics";
import { Hud } from "./ui/hud";
import { Menus } from "./ui/menus";
import { freshStats, type Ctx } from "./game/ctx";
import { FIELD, DIFFICULTY } from "./config";
import { clamp } from "./core/math";

type GameState = "menu" | "cutscene" | "night" | "day" | "report" | "loot" | "paused" | "dead" | "victory";

const STORY = [
  "The dead rose at dusk, and the highway choked on the living.",
  "What's left of the convoy threw up a barricade on the long road to HAVEN — the last safe zone.",
  "You and Mara hold the line — fire over the wall, keep them in the dark.",
  "Three acts of road. Survive each holdout, scavenge by dawn, and keep moving.",
];

// The finale reveal: Haven is safe, but the wall faces both ways. The dawn after
// the final hold, you choose what that "freedom" is worth.
const ENDING_STAY = [
  "Haven takes you in. A bunk, hot food, a wall that holds.",
  "They also hand you a roster: who gets turned away at the gate tomorrow, and who doesn't.",
  "You traded one wall for another. Inside it, you are safe — and you are theirs.",
];
const ENDING_LEAVE = [
  "You look at the crowd outside the gate, and you walk back out to them.",
  "Mara and the others follow without a word. Haven's floodlights shrink behind you.",
  "No walls now. No promises. Just the road, the dark, and people worth holding it for.",
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
/** Remaining real-seconds of the boss-intro cutscene (camera takeover + lock). */
let bossCine = 0;
/** Which Act-5 ending the player chose at Haven's gate (set in onVictory). */
let endingPick: string[] = ENDING_STAY;
/** A weapon found at full armory, awaiting the dusk swap decision. */
let pendingWeapon: string | null = null;
/** Latched true once an "ARMORY FULL" swap dilemma has been offered this run — a
 * race-free signal for the smoke (its single DOM read of the transient dilemma
 * screen is load-sensitive). Reset at run start. */
let armorySwapOffered = false;
/** One-shot debug override: the weapon-case the NEXT supply run will carry (set
 * by the smoke to make weapon finds deterministic). `undefined` = organic RNG. */
let dbgNextWeaponCase: string | null | undefined = undefined;

// What turns up in the wreckage after each leg (preferred → fallback to any
// unowned). The 5-weapon cap turns the later finds into swap decisions.
const WEAPON_FINDS: Record<number, string[]> = {
  1: ["rifle", "ar"],
  2: ["ar", "lmg"],
  3: ["dmr", "autoshotgun"],
  4: ["lmg", "rifle"],
  5: ["autoshotgun", "dmr"],
  6: ["minigun", "magnum"],
  7: ["magnum", "ar"],
  8: ["minigun", "autoshotgun", "dmr"],
};
const ALL_FINDABLE = ["rifle", "ar", "lmg", "dmr", "autoshotgun", "minigun", "magnum"];

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

// Opt-in challenge modifiers (persisted; default off → the baseline campaign).
const MODS_KEY = "wod-mods";
function loadMods(): RunMods {
  try {
    const raw = localStorage.getItem(MODS_KEY);
    if (raw) return { ...freshMods(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return freshMods();
}
function saveMods(m: RunMods): void {
  try {
    localStorage.setItem(MODS_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
let chosenMods = loadMods();
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

/** True while a run is in progress (so closing the window can flush a checkpoint).
 * The checkpoint is always a clean "start of the upcoming night": run.night and
 * run.leg only ever advance together (in onDayDone), so a flush here is safe to
 * resume via beginNight() regardless of which in-run screen the player closed on. */
function runInProgress(): boolean {
  return state === "night" || state === "day" || state === "report" || state === "loot" || state === "paused";
}
/** Persist the current checkpoint if a run is live — bound to window-close so
 * progress survives the player exiting the game at any point, not just at the
 * night-start checkpoint. Harmless if no run is active (writes nothing). */
function flushSave(): void {
  if (runInProgress()) saveRun();
}
window.addEventListener("beforeunload", flushSave);
window.addEventListener("pagehide", flushSave);
// Minimizing / hiding the window (incl. an Electron close on some platforms) may
// not fire beforeunload reliably — flush on the visibility transition too.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
});

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
  ctx.world.setZone(1); // reset to the outer-wall palette for the title backdrop
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
    hasSave() ? resumeRun : undefined,
    () =>
      menus.showModifiers(
        chosenMods,
        (m) => {
          chosenMods = m;
          saveMods(m);
          beginRun();
        },
        () => toTitle()
      )
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
  ctx.run.mods = { ...chosenMods }; // apply the chosen challenge modifiers for this run
  pendingWeapon = null;
  armorySwapOffered = false;
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
  const level = levelInfo(ctx.run.night);
  // Checkpoint: the run is saved at the start of every night.
  saveRun();
  scavenge.hide();
  ctx.run.refillMags();
  restoreWall(); // per-segment HP persists — breaches do NOT auto-heal between nights
  // A "dig in" dilemma reinforces the wall for the hold that follows.
  if (ctx.run.startWallBonus > 0) {
    ctx.wall.repair(ctx.run.startWallBonus);
    ctx.run.startWallBonus = 0;
  }
  ctx.wall.dmgMul = ctx.tuning.enemyDmg;
  ctx.wall.group.visible = true;
  ctx.world.setFieldClutter(true);
  // Re-theme the environment for this leg of the road (also picks the weather).
  ctx.world.setZone(level.zone);
  ctx.player.reset();
  ctx.player.group.visible = true;
  ctx.companions.spawnFromRun();
  ctx.companions.setMarkersVisible(false);
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
  bossCine = 0;
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
  hud.banner(
    `${actLevelLabel(ctx.run.night)} - ${level.title}`,
    `${level.actName} - ${level.flavor}`
  );

  // A radio beat as later nights open.
  if (level.radio) {
    window.setTimeout(() => {
      if (state === "night") hud.banner("RADIO", level.radio ?? "");
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
  const beat = levelInfo(ctx.run.night).beat;
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

/** Picking where to scavenge (population vs. loot) comes before the run itself. */
function startDay(): void {
  const level = levelInfo(ctx.run.night);
  menus.showSupplyChoice(beginSupplyRun, level.actName, level.supplyTheme);
}

function beginSupplyRun(density: Density, weaponOverride?: string | null): void {
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
  // A weapon only turns up if THIS run carries a weapon case (and you go collect
  // it) — not every run. Pick the next unowned weapon from the upcoming leg's pool
  // and place a case with a density-scaled chance (rarer once the armory is full).
  const owned = (id: string) => ctx.run.weapons.some((w) => w.def.id === id);
  const pool = WEAPON_FINDS[ctx.run.leg + 1] ?? [];
  const candidate = pool.find((id) => !owned(id)) ?? ALL_FINDABLE.find((id) => !owned(id)) ?? null;
  const baseChance = density === "high" ? 0.7 : density === "med" ? 0.5 : 0.3;
  const chance = ctx.run.atWeaponCap() ? baseChance * 0.5 : baseChance;
  // weaponOverride (tests): null forces NO case, a string forces that case.
  // dbgNextWeaponCase is a one-shot override the smoke uses to make weapon finds
  // deterministic (the organic find is RNG-gated, which made the cap-swap flaky).
  const override = weaponOverride !== undefined ? weaponOverride : dbgNextWeaponCase;
  dbgNextWeaponCase = undefined;
  const weaponInCrate = override !== undefined ? override ?? undefined : candidate && ctx.rng.chance(chance) ? candidate : undefined;
  // The environment + layout are themed to the district you chose (crowded /
  // picked-over / outskirts), so the map matches its description.
  scavenge.start({ density, weaponInCrate });
  state = "day";
  hud.banner(scavenge.envName, "Grab supplies in the dark · slip the patrols · extract when you've got enough");
}

function onDayDone(tier: string, frac: number, weapons: string[]): void {
  scavenge.hide();
  state = "loot";
  ctx.input.enabled = false;
  hud.setMode("hidden");

  // Ammo + repair kits were gathered live in the run; top mags.
  ctx.run.refillMags();
  ctx.run.traps += 2;

  // Supply yield → night stakes: a strong run banks a real reserve-ammo margin for
  // the hold ahead; a poor one leaves you lean (D earns nothing extra).
  const TIER_AMMO: Record<string, number> = { S: 120, A: 80, B: 50, C: 25, D: 0 };
  const tierAmmo = TIER_AMMO[tier] ?? 0;
  if (tierAmmo > 0) ctx.run.addAmmo(tierAmmo);
  ctx.run.lastSupplyTier = tier;

  ctx.run.leg += 1;
  // Advance the campaign pointer the moment the leg is banked (unless this leg
  // reached the safe zone — then the run ends, not advances). Keeping night/leg
  // in lockstep here means the save written below is a clean "start of the next
  // night", so quitting anywhere in the day→night flow resumes correctly.
  if (!ctx.run.reachedSafeZone) ctx.run.night += 1;

  // A new gun is ONLY the one(s) you actually pulled from a weapon-case crate this
  // run — never handed out automatically. Under the cap it's granted; at the cap
  // it becomes a dusk swap decision (see offerDilemma).
  const owned = (id: string) => ctx.run.weapons.some((w) => w.def.id === id);
  const fresh = weapons.filter((id) => WEAPONS[id] && !owned(id));
  let foundLine: string;
  if (fresh.length === 0) {
    ctx.run.addAmmo(40);
    foundLine = "No weapon case out there this time — restocked extra ammo.";
  } else {
    const grantedNames: string[] = [];
    let queuedName: string | null = null;
    for (const id of fresh) {
      if (ctx.run.atWeaponCap()) {
        pendingWeapon = id; // armory full — offered as a swap at dusk
        queuedName = WEAPONS[id].name.toUpperCase();
      } else {
        ctx.run.grantWeapon(id);
        grantedNames.push(WEAPONS[id].name.toUpperCase());
      }
    }
    const parts: string[] = [];
    if (grantedNames.length)
      parts.push(`<span class="loot-weapon">⚔ NEW WEAPON — you recovered a ${grantedNames.join(" + ")}!</span>`);
    if (queuedName)
      parts.push(`<span class="loot-weapon">⚔ RARE FIND — a ${queuedName}!</span> The armory's full — choose at dusk whether it earns a slot.`);
    foundLine = parts.join(" ");
    ctx.events.emit("SFX", { id: "meter_full" });
  }

  const lines = [
    `Run rating — ${tier}  (${Math.round(frac * 100)}% ammo crates)`,
    tierAmmo > 0
      ? `Supply margin — +${tierAmmo} reserve ammo for the next hold`
      : `Lean haul — no spare ammo margin tonight`,
    `Repair kits — ${ctx.run.repairKits}`,
    foundLine,
  ];

  lootContinue = () => {
    menus.clear();
    if (ctx.run.reachedSafeZone) {
      onVictory();
      return;
    }
    // A dawn dilemma before pressing on — one choice, one consequence.
    offerDilemma(() => {
      // night already advanced in onDayDone — show the level we're about to play
      // (levelInfo, not nextLevelInfo, which previously skipped one ahead).
      // The march between nights isn't safe — roll a random event (an ally may be
      // lost, or a quiet scavenge may pay off) and surface it on the road map.
      const ev = interNightEvent();
      const next = levelInfo(ctx.run.night);
      saveRun(); // bank the dilemma + inter-night results before the road map
      // Show the convoy advancing toward the safe zone + a story beat, then night.
      menus.showRoadMap(
        ctx.run.leg,
        ctx.run.legsTotal,
        `${actLevelLabel(ctx.run.night)} - ${next.title}`,
        next.story,
        beginNight,
        ev ?? undefined,
        campaignNodeLabels(),
        next.supplyTheme
      );
    });
  };
  saveRun(); // bank the day's haul (leg, weapons, kits, ammo) immediately
  menus.showDayLoot(lines, lootContinue);
}

/**
 * A random event during the march to the next holdout. Allies can be lost to
 * infection, the road, or just losing heart — or a quiet scavenge can pay off.
 * Returns a narrative line for the road map (or null when nothing happened).
 */
function interNightEvent(): string | null {
  const r = ctx.run;
  if (r.companions.length === 0) {
    if (ctx.rng.chance(0.3)) {
      r.addAmmo(40);
      return "On the road alone, you scrounge a few magazines from a wreck. (+40 ammo)";
    }
    return null;
  }
  // Bad-luck chance climbs as the road gets worse; eased when you've only one ally
  // left so a run isn't stripped bare by chance alone.
  const badChance = Math.min(0.55, 0.22 + r.night * 0.05) * (r.companions.length === 1 ? 0.6 : 1);
  if (ctx.rng.chance(badChance)) {
    const name = ctx.rng.pick(r.companions);
    const trait = r.companionTraits[name];
    const tail = trait ? ` ${name} ${TRAITS[trait].lostLine}` : ` ${name} is gone.`;
    const kind = ctx.rng.pick(["infection", "accident", "vanished"]);
    r.loseCompanion(name);
    if (kind === "infection")
      return `Between nights, ${name} took a bite no one saw. They turned before dawn and had to be put down.${tail}`;
    if (kind === "accident")
      return `Between nights, the road took ${name} — a wreck shifted, a wall came down.${tail}`;
    return `Between nights, ${name} slipped away in the dark, unable to face another wall.${tail}`;
  }
  if (ctx.rng.chance(0.35)) {
    if (ctx.rng.chance(0.5)) {
      r.repairKits += 1;
      return "Between nights, your crew cracks a maintenance cache off the road. (+1 repair kit)";
    }
    r.addAmmo(50);
    return "Between nights, a quiet scavenge pays off. (+50 ammo across the armory)";
  }
  return null;
}

/** A light, memorable dawn choice — touches only run resources. */
function offerDilemma(after: () => void): void {
  // A full armory takes priority: a found weapon you have no room for forces a
  // swap (drop one of your five) or you leave it for the ammo.
  if (pendingWeapon) {
    const newId = pendingWeapon;
    pendingWeapon = null;
    const newName = WEAPONS[newId].name.toUpperCase();
    const opts: { label: string; detail: string; onPick: () => void; tag?: string; tone?: "risk" | "safe" | "gain" }[] =
      ctx.run.droppableIndices().map((i) => ({
        label: `Drop ${ctx.run.weapons[i].def.name}`,
        detail: `Swap it for the ${newName}.`,
        tag: "SWAP",
        tone: "gain",
        onPick: () => {
          ctx.run.dropWeapon(i);
          ctx.run.grantWeapon(newId);
          hud.banner("LOADOUT CHANGED", `Picked up the ${newName}`);
        },
      }));
    opts.push({
      label: `Leave the ${newName}`,
      detail: "Keep your current five. Take the ammo instead (+60).",
      tag: "+AMMO",
      tone: "safe",
      onPick: () => ctx.run.addAmmo(60),
    });
    armorySwapOffered = true; // latch for the smoke (its DOM read of this transient screen races)
    menus.showDilemma("ARMORY FULL", `You found a ${newName}, but you're already carrying five. Something has to go.`, opts, after);
    return;
  }

  const haveSlot = ctx.run.companions.length < 4;
  const strangerName = ["Harlan", "Pike", "Dunn", "Sora"].find((n) => !ctx.run.companions.includes(n)) ?? "a stranger";
  // Alternate the dilemma by which leg you're on — and only sometimes offer a
  // recruit, so allies stay hard to come by (the cache dilemma fills the rest).
  if (ctx.run.leg % 2 === 1 && haveSlot && ctx.rng.chance(0.5)) {
    menus.showDilemma(
      "A figure at the fenceline",
      `${strangerName} is begging to come in. Taking them in means another mouth — but another gun on the wall.`,
      [
        {
          label: "Open the gate",
          detail: "Recruit them as an ally (random trait).",
          tag: "+ALLY",
          tone: "gain",
          onPick: () => {
            const tr = ctx.run.recruit(strangerName);
            hud.banner(`${strangerName} joins you`, `${TRAITS[tr].label} — "${TRAITS[tr].recruitLine}"`);
          },
        },
        {
          label: "Send them off",
          detail: "Keep the line lean. They leave you their kit (+1 repair kit).",
          tag: "+KIT",
          tone: "safe",
          onPick: () => {
            ctx.run.repairKits += 1;
          },
        },
      ],
      after
    );
  } else if (ctx.rng.chance(0.5)) {
    // A choice that branches the NEXT night's STARTING CONDITION, not just resources.
    menus.showDilemma(
      "Dig in, or travel light?",
      "There's time on the march to either shore up the barricade or move fast and quiet — one buys a sturdier wall at the next hold, the other more tricks in your pocket.",
      [
        {
          label: "Reinforce the wall",
          detail: "Spend the march bracing the barricade — start the next hold with a noticeably sturdier wall.",
          tag: "+WALL",
          tone: "safe",
          onPick: () => {
            ctx.run.startWallBonus += 140;
          },
        },
        {
          label: "Travel light",
          detail: "Move fast and quiet — arrive with extra spike traps in hand (+2).",
          tag: "+TRAPS",
          tone: "gain",
          onPick: () => {
            ctx.run.traps += 2;
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
          tag: "GAMBLE",
          tone: "risk",
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
          tag: "+KIT",
          tone: "safe",
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
  ctx.events.emit("RUN_VICTORY", {});
  // The "freedom isn't free" turn: you reached Haven, but its gate faces both
  // ways. One last choice decides what the safe zone is worth — then the ending.
  menus.showDilemma(
    "HAVEN'S GATE — DAWN",
    "You held the wall till first light. Haven will take you in now. But you've seen the guns facing inward, and the people they keep outside.",
    [
      {
        label: "Stay inside the wall",
        detail: "Safety, a bunk, a roster of who gets turned away. You're theirs now.",
        tag: "SAFETY",
        tone: "safe",
        onPick: () => {
          ctx.music.play("victory");
          endingPick = ENDING_STAY;
        },
      },
      {
        label: "Walk back into the dark",
        detail: "No walls, no promises — the open road and the people worth holding it for.",
        tag: "THE ROAD",
        tone: "risk",
        onPick: () => {
          ctx.music.play("victory");
          endingPick = ENDING_LEAVE;
        },
      },
    ],
    () => menus.showVictory(ctx.stats, startRun, toTitle, [...endingPick, ...endingLines()])
  );
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
    lines.push(`Wall held per level - ${r.nightsWallHeld.map((p) => `${p}%`).join(" / ")}`);
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
ctx.events.on("DAY_DONE", ({ tier, frac, weapons }) => onDayDone(tier, frac, weapons));
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
ctx.events.on("MINIBOSS", ({ name, sub }) => {
  if (state !== "night") return;
  startBossCinematic(name, sub ?? "It'll smash the wall — hit it hard");
});
ctx.events.on("ZOMBIE_KILLED", ({ kind }) => {
  if (state !== "night") return;
  const killedType = TYPES[kind];
  if (killedType?.boss) {
    // Boss takedown beat: a long dilation + camera punch + a retracting title
    // card (no camera takeover — the player keeps fighting the dawn surge).
    requestSlowmo(1.6, 0.22);
    ctx.cam.pulseFov(0.9);
    ctx.cam.addTrauma(0.7);
    ctx.stage.punch(0.6);
    ctx.events.emit("SFX", { id: "boss_roar" });
    hud.bossKill(killedType.bossTitle ?? kind.toUpperCase());
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

// ------------------------------------------------- boss-intro cinematic
const BOSS_CINE_DUR = 2.6;
/** Take over the camera for a short cinematic as an act boss emerges: dolly in on
 * the looming boss, letterbox + title card, time crawls, controls locked. */
function startBossCinematic(name: string, sub: string): void {
  const b = ctx.enemies.boss;
  const bx = b ? b.x : 0;
  const bz = b ? b.z : levelInfo(ctx.run.night).boss?.z ?? -44;
  bossCine = BOSS_CINE_DUR;
  ctx.cam.beginBossFocus(bx, bz);
  ctx.input.enabled = false;
  ctx.grenades.hidePreview();
  fHeld = false;
  hud.bossCinematic(name, sub);
  requestSlowmo(BOSS_CINE_DUR + 0.2, 0.18); // the field crawls during the reveal
  ctx.cam.addTrauma(0.5);
  ctx.stage.punch(0.5);
  ctx.events.emit("SFX", { id: "boss_roar" });
}
/** Hand control back to the player and drop the camera onto the rampart. */
function endBossCinematic(): void {
  bossCine = 0;
  hud.endBossCinematic();
  if (state === "night") {
    ctx.cam.mode = "rampart";
    ctx.input.enabled = true;
    ctx.cam.addTrauma(0.4);
    ctx.cam.pulseFov(0.5);
  }
}

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
// Display FPS readout (smoothed over ~0.5s; written to the corner each frame).
let fpsShowAccum = 0;
let fpsShowFrames = 0;
let fpsShown = 0;
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

  // FPS readout (always sampled; shown only when the setting is on).
  fpsShowAccum += realDt;
  fpsShowFrames++;
  if (fpsShowAccum >= 0.5) {
    fpsShown = Math.round(fpsShowFrames / fpsShowAccum);
    fpsShowAccum = 0;
    fpsShowFrames = 0;
  }
  hud.setFps(menus.settings.showFps, `${fpsShown} FPS`);

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
    // Boss-intro cinematic runs on real time so its length is fixed regardless of
    // the slow-mo it rides on; it hands control back when it elapses.
    if (bossCine > 0) {
      bossCine -= realDt;
      if (bossCine <= 0) endBossCinematic();
    }
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
  ctx.wall.update(realDt); // breach-flash decay (visual)
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
  ctx.enemies.primeTypes(Array.from(new Set([...Object.keys(TYPES), ...bossTypeKeys()])));
  ctx.stage.warmUp(); // pre-compile shaders so the first wave doesn't hitch
  ctx.enemies.clear();
  toTitle();
});

// ---------------------------------------------------------------------------
// Debug scenario registry — cut straight to a specific, screenshot-worthy game
// state in one call. Used by the automated capture harnesses (qa/) so tests can
// jump to any moment (a given act's night, a boss fight, a supply run, the dawn
// dilemma, an ending, defeat) without playing through to it. Harmless in prod.
// ---------------------------------------------------------------------------
interface Scenario {
  desc: string;
  run: () => void;
}
function dbgSpawnMix(types: string[], n = 10): void {
  for (let i = 0; i < n; i++) ctx.enemies.spawn(types[i % types.length], ctx.rng.range(-20, 20), -26 - (i % 4) * 11);
}
function dbgSetProgress(p: number): void {
  if (director) director.elapsed = director.length * p;
}
function dbgStartNight(n: number): void {
  ctx.run.start();
  ctx.run.night = n;
  beginNight();
}
function dbgStartSupply(n: number, d: Density): void {
  ctx.run.start();
  ctx.run.night = n;
  beginSupplyRun(d);
}
const SCENARIOS: Record<string, Scenario> = {
  title: { desc: "Title / main menu", run: () => toTitle() },
  "night-act1": { desc: "Act I night — Outer Road, mid-wave", run: () => { dbgStartNight(1); dbgSetProgress(0.5); dbgSpawnMix(["shambler", "runner", "crawler"]); } },
  "night-act2": { desc: "Act II night — Floodline, mid-wave", run: () => { dbgStartNight(4); dbgSetProgress(0.5); dbgSpawnMix(["crawler", "leaper", "spitter"]); } },
  "night-act3": { desc: "Act III night — Haven Approach, mid-wave", run: () => { dbgStartNight(7); dbgSetProgress(0.5); dbgSpawnMix(["armored", "shielded", "screamer", "brute"]); } },
  "boss-roadblock": { desc: "Act I finale — THE ROADBLOCK", run: () => { dbgStartNight(3); dbgSetProgress(0.5); ctx.enemies.spawn("roadblock", 0, -40); } },
  "boss-drowned": { desc: "Act II finale — THE DROWNED TITAN", run: () => { dbgStartNight(6); dbgSetProgress(0.5); ctx.enemies.spawn("drowned", 0, -42); } },
  "boss-behemoth": { desc: "Act III finale — THE BEHEMOTH", run: () => { dbgStartNight(9); dbgSetProgress(0.5); ctx.enemies.spawn("behemoth", 0, -44); } },
  surge: { desc: "Dawn surge — the horde massing the wall", run: () => { dbgStartNight(5); dbgSetProgress(0.85); dbgSpawnMix(["runner", "shambler", "crawler", "leaper"], 16); } },
  laststand: { desc: "Adrenaline at surge — Last Stand ready", run: () => { dbgStartNight(2); dbgSetProgress(0.5); dbgSpawnMix(["shambler", "runner"], 8); ctx.adrenaline.gain(100); } },
  "supply-outer": { desc: "Supply run — Outer Road", run: () => dbgStartSupply(1, "med") },
  "supply-flood": { desc: "Supply run — Floodline (flooded blocks)", run: () => dbgStartSupply(4, "high") },
  "supply-haven": { desc: "Supply run — Haven Perimeter (checkpoint)", run: () => dbgStartSupply(7, "med") },
  "supply-choice": { desc: "Supply choice — where to scavenge (risk/reward cards)", run: () => { ctx.run.start(); ctx.run.night = 1; hud.setMode("hidden"); startDay(); } },
  "supply-spotted": { desc: "Supply run — spotted (alarm vignette + !/? telegraphs)", run: () => { dbgStartSupply(4, "high"); hud.setMode("day"); scavenge.debugSpotted(); } },
  "dawn-dilemma": { desc: "Dawn dilemma choice screen", run: () => { ctx.run.start(); ctx.run.night = 2; hud.setMode("hidden"); offerDilemma(() => {}); } },
  ending: { desc: "Haven's Gate — the two-ending choice", run: () => { ctx.run.start(); ctx.run.night = TOTAL_LEVELS; onVictory(); } },
  defeat: { desc: "Defeat — the death screen", run: () => { dbgStartNight(1); defeat("The wall was overrun."); } },
};

// Debug hook for console debugging + headless smoke tests (harmless in prod).
(window as unknown as Record<string, unknown>).__wod = {
  ctx,
  state: () => state,
  /** Cut straight to a named scenario (see SCENARIOS). Returns its description. */
  scenario: (name: string) => {
    const s = SCENARIOS[name];
    if (!s) return `unknown scenario: ${name}`;
    s.run();
    return s.desc;
  },
  /** List every available scenario: [{ name, desc }]. */
  scenarios: () => Object.entries(SCENARIOS).map(([name, s]) => ({ name, desc: s.desc })),
  startRun,
  startDay,
  forceDawn: () => {
    if (director) director.elapsed = director.length;
    ctx.enemies.clear();
  },
  completeDay: () => scavenge.debugComplete(),
  /** Force N supply-run grabs (close calls) — for QA capture of the pip feedback. */
  grabDay: (n: number) => scavenge.debugGrab(n),
  /** True once a found-at-cap weapon has forced an ARMORY FULL swap this run. */
  armorySwapOffered: () => armorySwapOffered,
  /** Force the next supply run to carry a weapon case (deterministic test finds). */
  forceNextWeaponCase: (id: string | null) => {
    dbgNextWeaponCase = id;
  },
  scavengeShown: () => scavenge.visible,
  dayObjectCount: () => scavenge.objectCount,
  scavengeTotal: () => scavenge.total,
  envName: () => scavenge.envName,
  campaignTotal: () => TOTAL_LEVELS,
  campaignLabels: () => campaignNodeLabels(),
  setNightProgress: (p: number) => {
    if (director) director.elapsed = director.length * p;
  },
  continueAfterLoot: () => lootContinue(),
  lastStand: doLastStand,
  spawnWave: (type: string, n: number) => {
    for (let i = 0; i < n; i++) ctx.enemies.spawn(type, ctx.rng.range(-20, 20));
  },
  // Test hooks for campaign systems (supply density, inter-night events, ending).
  startSupply: (d: Density, weaponOverride?: string | null) => beginSupplyRun(d, weaponOverride),
  interNightEvent: () => interNightEvent(),
  forceVictory: () => onVictory(),
  // Balance probe: the pacing plan for any night (1..9) at the current difficulty.
  nightStats: (n: number) => nightStats(n, ctx.tuning.spawnRate),
  // Drop the supply-run avatar at a spot (so a capture can frame the lot interior).
  scavengeTeleport: (x: number, z: number) => scavenge.debugTeleport(x, z),
  // ---- Diagnostics (render cost + scene-graph health) --------------------
  /** Per-frame GPU cost: draw calls, triangles, resident geometries/textures. */
  renderStats: () => renderStats(ctx.stage),
  /** Scene-graph health walk: NaN/negative-radius geometry, bad transforms, tris. */
  sceneAudit: () => sceneAudit(ctx.stage),
};
