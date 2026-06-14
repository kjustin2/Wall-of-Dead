# Wall of Dead — Claude Guide

## Project

A moody, behind-the-wall zombie **survival defense**. You stand at a barrier in
2.5D, walk along it (A/D), and aim out into a dark field with the mouse. By
**night** you hold the wall against escalating waves until dawn; by **day** you
play a scavenging minigame, find weapons and survivors, and advance one leg
down the road. Reach the **safe zone** (4 legs) to win. Rescued survivors become
AI companions who hold the wall beside you.

This is a **from-scratch rebuild** (June 2026) that replaced an earlier
top-down roguelike of the same name. Everything under `src/**`, the smoke test,
and the docs are new. The sister directory `roguehero2/` is an unrelated older
project — do not copy its patterns here.

**Vanilla ES6 browser game, zero runtime dependencies.** Hand-rolled Canvas2D
rendering and Web Audio synthesis (no audio assets — every sound is synthesized
at play time). `package.json` declares Electron + electron-builder as *dev-only*
tooling for the desktop wrapper; `index.html` and `src/**` import nothing from
`node_modules` and run as a static site. **Never add a runtime import from
`node_modules` into `src/**`** — the zero-deps invariant is the project's
identity.

## Run / test

```powershell
# Serve in the browser (zero deps — primary dev flow)
python -m http.server 8000      # then open http://localhost:8000

# Or run as a desktop app via the Electron wrapper
npm install && npm start

# Headless smoke test — drives a full run (title → 4 nights/days → victory)
# plus the game-over paths, calling update() AND render() each frame against a
# mock 2D context. Also validates content integrity (every weapon/cue sfx id).
node check.mjs

# Visual playthrough — launches the REAL Electron/Chromium renderer, plays
# through every scene, captures uncaught errors + console, and writes
# screenshots to shots/. Catches real-canvas issues the mock context cannot.
npm run test:play          # → shots/01-title.png … 09-gameover.png
```

**Two test layers, and you need both.** `check.mjs` is fast and runs against a
*mock* 2D context — it proves the logic/flow runs and that content ids resolve,
but it cannot see a real rendering bug. `npm run test:play` runs in a real
renderer and is the only thing that catches canvas errors (e.g. a negative
`ellipse`/`arc` radius throws an uncaught `IndexSizeError` mid-frame and blanks
the screen — exactly the kind of bug the mock once hid). The mock in `check.mjs`
now mimics the browser's radius validation as a cheap guard, but a real
playthrough is still the source of truth for "does it actually draw".

The smoke test is the regression net — run it before claiming done. The Stop
hook in `.claude/settings.json` runs `check-imports.mjs` at end of turn, which
is a thin shim that runs `check.mjs` (the hook + permission predate the rename;
the shim keeps them working without editing settings).

## Architecture map

```
src/Config.js          VIEW dims, FIELD geometry (horizon/wall/player lanes),
                       DEPTH scale, PAL palette, RUN pacing tunables.
src/main.js            Entry: size canvas, build Game, start Engine loop.
src/util/math.js       clamp/lerp/approach, dist², weightedPick, pointSegDist2.

src/engine/
  EventBus.js          Singleton pub/sub (`events`). SFX/SHAKE/HITSTOP flow here.
  Engine.js            rAF loop with dt cap + hit-stop freeze (HITSTOP event).
  Input.js             Keyboard + mouse; pointer mapped into 1280×720 space.
  Audio.js             Web Audio synth SFX table + Ambient (wind drone +
                       stochastic horror cues + dread-driven heartbeat).
                       Reads Settings for volume/mute. Exports SFX_IDS.
  Particles.js         520-cap recycling pool (blood, gore, muzzle, casings).
  Camera.js            Screen shake (trauma model + roll); scaled by Settings.
  Lighting.js          Darkness overlay w/ flashlight cone + radial lights
                       punched out (destination-out). Headless-safe (no-op).
  PostFX.js            Film grain + impact chromatic aberration. Headless-safe.
  Settings.js          Persisted volume/mute/shake (localStorage, guarded).

src/game/
  view.js              2.5D depth helpers: depthScale/Shade/Speed from screen-y.
  Weapons.js           WEAPONS table (pistol/smg/shotgun/rifle) + makeLoadout.
  Bullet.js            Projectile struct + step (player bullets & spitter acid).
  Wall.js              12 segments; localized damage; breaches; setTotal/repair.
  Player.js            Move/aim/fire/reload/swap, HP, lantern light.
  Zombie.js            One class + TYPES (shambler/runner/brute/spitter); the
                       advancing→attacking→crossing / standoff / fleeing FSM.
  Companion.js         Rescued survivor AI: auto-target nearest, auto-fire.
  WaveDirector.js      Per-night plan: dawn timer + escalating spawn stream.
  Backdrop.js          Layered night field pre-rendered to an offscreen canvas
                       (skyline/stars/moon/treeline) + animated fog/embers;
                       dread vignette. Cached once; headless falls back simple.
  Game.js              Controller: services (incl. Lighting/PostFX) + run state
                       + scene transitions + ESC pause overlay + fade-in.

src/minigames/      (the day scavenging — a CHOICE of playable runs)
  Minigame.js          Base contract (start/update/render/getResult{tier,frac})
                       + tierFromFrac. Each minigame owns its full screen.
  ArenaMinigame.js     Real-time top-down arena base: movable unarmed avatar,
                       chasers (seek+separation+shove-stun), crates, touch
                       resolution, countdown, scoring hooks, polished render.
  EvasionRun.js        "Outrun the Pack" — survive unarmed, don't get caught.
  GrabAndGo.js         "Smash & Grab" — collect crates under pressure.
  HoldZone.js          "Fuel Siphon" — hold a zone to fill; SPACE shoves.
  SteadyHands.js       "Quiet Cache" — low-risk timing bar (no zombies).
  Expeditions.js       EXPEDITIONS registry (risk/reward/mult/factory) +
                       dayOptions(night) → the 3 choices offered that day.

src/scenes/
  Scene.js             Base (enter/exit/update/render + service getters).
  TitleScene.js        Logo + controls; click begins a run (unlocks audio).
  NightScene.js        The defense — the heart. Draw order matters: (1) world
                       lit, (2) Lighting darkness w/ flashlight cone punched
                       out, (3) emissive pass (glowing eyes/muzzle/tracers/acid
                       via 'lighter'), (4) vignette + aberration. Win/lose.
  DayScene.js          report → choose expedition (3 risk/reward cards) → play
                       minigame → loot (mult = tier × expedition, scripted find,
                       injury on a botched risky run) → advance one leg.
  GameOverScene.js     Death cause + stats; R restarts.
  VictoryScene.js      Reached the safe zone; R replays.

src/ui/
  HUD.js               Night HUD (framed panels): dawn timeline, road pips, HP,
                       wall, companion strip, weapon + ammo pips + slots.
  MenuList.js          Keyboard+mouse vertical menu (main + pause menus).
  SettingsPanel.js     Volume/mute/shake UI; mutates+persists Settings.
  PauseMenu.js         ESC overlay (Resume/Restart/Settings/Main Menu).

check.mjs              Headless smoke test (the real one).
check-imports.mjs      Shim → check.mjs (kept for the Stop hook / permission).
electron/main.cjs      Desktop wrapper (BrowserWindow → file:// index.html).
electron/test-runner.cjs  Visual harness (npm run test:play) + test-preload.cjs.
```

Cross-system communication goes through `events` (EventBus). `window._wod`
(set in `main.js`) exposes `{ game, engine }` for console debugging.

## Core invariants — read before editing

1. **Zero runtime deps.** No npm imports in `src/**`. No build step. No
   TypeScript. ES6 modules only. Match the surrounding style of the file.

2. **The engine tick is synchronous.** No `async`/`await` on the update/render
   path. Performance conventions: squared distance for range checks
   (`dist2`/`pointSegDist2`), reuse the particle pool rather than allocating,
   keep hot loops allocation-light.

3. **`update(dt)` and `render(ctx)` must stay separable and headless-safe.** The
   smoke test runs the whole game with a mock 2D context and no AudioContext.
   Anything you draw must go through `ctx`; never read pixels back. Audio
   degrades to a silent no-op when `AudioContext` is absent — keep that true
   (guard new audio on `this.ctx`). Likewise, any **offscreen canvas**
   (`document.createElement('canvas')` in Lighting/PostFX/Backdrop) must be
   wrapped in try/catch and no-op when unavailable, and never feed `ctx`
   negative/NaN arc/ellipse/gradient radii (a real canvas throws and blanks the
   frame — the mock now validates this too). `localStorage` access is guarded in
   `Settings.js` for the same reason.

4. **2.5D depth is a pure function of screen-y** (`src/game/view.js`). Field
   entities (zombies, acid) scale/dim/slow by `depthScale/Shade/Speed(y)`. The
   wall is drawn *between* non-crossing zombies and the defenders so the
   "behind the wall" read holds — see `NightScene.render`'s crossing split.

5. **SFX ids must resolve.** A weapon's `sfx`, and any `events.emit('SFX', id)`,
   must match a key in the `SFX` table in `src/engine/Audio.js`. The smoke test
   checks every weapon sfx + a required-cue list against `SFX_IDS`.

6. **Run state lives on `game.run`.** Scenes hold their own transient state;
   anything that must persist across nights/days (weapons, companions, wallHp,
   playerHp, stats, progress) goes on `game.run`. Wall integrity persists as a
   single `run.wallHp` total and is redistributed across segments via
   `wall.setTotal()` at night start.

7. **Scene transitions are explicit `Game` methods** (`toNight`, `toDay`,
   `toGameOver`, `toVictory`, `toTitle`, `startRun`). `setScene` calls the old
   scene's `exit()` and the new one's `enter()` and clears the particle pool.
   Always subscribe to events you `off()` again — but scenes here use the bus
   only via the engine singletons (Audio/Camera), so per-scene listener leaks
   aren't currently a risk; if you add `events.on()` in a scene, remove it in
   `exit()`.

## Adding content — quick recipes

### New weapon
Add an entry to `WEAPONS` in `src/game/Weapons.js` (`fireRate, mag, reload,
damage, pellets, spread, speed, auto, shake, color, tracerLen`, optional
`pierce`). Ensure `sfx` exists in `Audio.js`. To grant it, `run.weapons.push(
makeLoadout(id, reserve))` (DayScene does this for the scripted finds). Tune
against reference HP: shambler 30, runner 14, spitter 22, brute 135.

### New zombie type
Add to `TYPES` in `src/game/Zombie.js` (`hp, speed, radius, claw, clawCD, touch,
touchCD, body, head, eye, groan`; optional `targetsPlayer`, `heavy`,
`standoffY`/`spitDmg`/`spitCD`/`spitSpeed` for ranged). Add it to a night's
`mix` in `WaveDirector.js` `NIGHT_PLAN`. New behavior → extend the state switch
in `Zombie.update`.

### New minigame / expedition
Two routes. For a **real-time action run**, `extends ArenaMinigame` and override
`configure()` (title/objective/controls/duration + spawn chasers/crates),
`step(dt,input)`, `onTouch(z)`, `scoreFrac()→0..1`, `renderHud(ctx)` — the base
handles movement, chasers, touches, timer, scoring, and the arena render. For a
**static skill check**, `extends Minigame` directly (see `SteadyHands.js`) and
draw your own full-screen layout. Either way: set `this.done = true` when
finished and return `getResult() → { tier, frac }`. Then register it in
`EXPEDITIONS` (id, title, loc, risk, reward, `mult`, `make`) and add its id to
`dayOptions()` so it shows up on the choose screen. The smoke test auto-drives
every entry in `EXPEDITIONS` to completion — no extra wiring needed there.

### New scene
`export class X extends Scene`, implement `enter/exit/update/render`, add a
transition method on `Game`, and call it. Read services via the `Scene` getters
(`this.input/audio/particles/camera/run`).

### New zombie/scare sfx
Add a function to the `SFX` table in `src/engine/Audio.js` (build from `tone`/
`noise` primitives). Reference it via `events.emit('SFX', 'id')`.

## Before claiming done
- [ ] `node check.mjs` — all checks pass.
- [ ] `npm run test:play` — booted with **0 page errors**; skim `shots/` to
      confirm scenes actually draw. Do this whenever you touch any `render()`.
- [ ] Added a weapon/cue? Its `sfx` resolves in `Audio.js`.
- [ ] Touched the night/day flow? A full run still reaches victory in the test.
- [ ] Added a runtime dependency? **Don't.** The zero-deps invariant is core.

> Serve over http (or `npm start` / Electron) — **don't open `index.html` by
> double-clicking it.** ES modules are blocked over `file://` in a plain
> browser; you'd get a blank screen. The Electron wrapper loads `file://` fine.

## What this codebase is NOT
No Phaser/Pixi/Three/WebGL. No runtime npm deps (Electron is dev-only). No
TypeScript. No Jest/Vitest/Playwright (`check.mjs` is the only harness). No
async on the engine path. No DOM/React UI — everything is canvas-drawn.
