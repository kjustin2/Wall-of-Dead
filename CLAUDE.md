# Wall of Dead — Claude Guide

## Project

A moody, behind-the-wall zombie **survival defense**, rendered in true 3D. You
stand on a rampart behind a segmented barrier, strafe along it (A/D), and aim
out into a dark, foggy field with the mouse. By **night** you hold the wall
against escalating waves until dawn; by **day** you play a top-down scavenging
run for supplies, then push for the **safe zone**. Rescued survivors hold the
wall beside you as AI companions.

A **signature mechanic — Adrenaline** — ties it together: holding the line and
landing kills pushes the meter hot (faster fire/reload/movement, brighter
flashlight); taking wall/player damage drains it cold. At surge you spend it on
a **Last Stand** shockwave (F).

This is a **from-scratch Three.js rebuild (June 2026)** that replaced an earlier
hand-rolled Canvas2D version of the same game. It deliberately adopts the
proven architecture of the sister project `Rogue-Hero-3/` (Three.js + Vite +
TypeScript + a post-FX chain): the "professional" look comes from procedural
low-poly geometry under **ACES tone mapping + bloom/vignette/grain**, a trauma
camera, a typed event bus, and a single damage funnel. The old Canvas2D code is
preserved in git history (commit `8570e94` and earlier).

**Current scope: a polished vertical slice** — Title → 1 Night → 1 Day →
Victory. The framework for more (multiple legs/nights) is in place but capped
(`run.legsTotal = 1`).

### Stack

TypeScript (strict) · **Three.js** (WebGL) · **postprocessing** (bloom, ACES
already on the renderer, CA, vignette, grade, grain, SMAA) · **Vite** build ·
Web Audio synthesis (all SFX) · `@fontsource` fonts. Electron is **dev-only**
(desktop wrapper + smoke harness). **Procedural-first**: every mesh is a Three.js
primitive, every *sound effect* is synthesized at play time, textures are
canvas-generated. The one asset exception is **streamed music** in
`public/music/*.mp3` (played via `audio/music.ts`), added for mood — keep new
*art* procedural; music/fonts are the only bundled media.

## Run / test

```powershell
npm install              # first time

# Dev server (hot reload) — primary dev flow
npm run dev              # → http://localhost:5180

# Type + build gate (the fast regression net)
npm run verify           # tsc --noEmit && vite build

# Real-renderer smoke: builds, boots the game in Electron/Chromium, drives the
# full slice (title → night → day → victory), captures uncaught/console errors,
# and writes shots/01-title.png … 08-victory.png. THE source of truth for "does
# it actually draw" — a WebGL bug (bad geometry/shader) only shows here.
npm run test:play        # = build + electron scripts/smoke-electron.cjs
npm run smoke            # same, against an existing dist/

# Desktop app
npm run standalone       # build + Electron window
```

**Two layers, both needed.** `npm run verify` (tsc strict + a real Vite build)
catches type errors, dead code (`noUnusedLocals/Parameters`), and bundler
failures fast. `npm run test:play` runs the **real WebGL renderer** and is the
only thing that catches shader/geometry/runtime-draw bugs. Run `verify` before
claiming done; run `test:play` whenever you touch anything that draws.

> The Stop hook in `.claude/settings.json` runs `check-imports.mjs` at end of
> turn — a thin shim that now runs `tsc --noEmit` (the hook + permission predate
> the rebuild; the shim keeps them working).

## Architecture map

The boot wiring lives in `src/main.ts`: it builds one `Ctx` service bag, wires
event handlers + the `menu | night | day | report | loot | paused | dead |
victory` state machine, and runs a dt-capped `setAnimationLoop`. Systems update
only while playing; world/particles/telegraphs/camera/stage always update +
render the post composer. `window.__wod = { ctx, … }` exposes debug/smoke hooks.

```
src/config.ts          World axes + FIELD geometry (wall/rampart/spawn z), RUN
                       pacing, PAL palette. Read this before placing anything.

src/core/
  events.ts            Typed EventBus + EventMap (compile-checked emits).
  input.ts             Keyboard + mouse; raycasts cursor → world aim point.
  math.ts / rng.ts     clamp/lerp/damp/smoothstep, dist²; seedable mulberry32.

src/render/
  stage.ts             WebGLRenderer + ACES + FogExp2 + lights + the post chain
                       (bloom/CA/vignette/grade/grain/SMAA) + quality presets +
                       punch()/stress screen feedback. (port of RH3 stage.ts)
  cameraRig.ts         Trauma camera (trauma², kick, FOV pulse). Modes: menu
                       drift / rampart follow (night) / topdown (day).
  world.ts             The environment: ground+grid, rampart+parapet, gradient
                       sky shader, moon+stars, treeline, rocks, drifting embers,
                       and setDawn(t) — the dusk→dawn color/light ramp.
  particles.ts         One additive GPU point cloud (blood/gore/sparks/casings).
  telegraphs.ts        Pooled ground danger markers (ring + growing fill).
  textures.ts          Procedural radial-glow sprite + canvas text labels.
  decals.ts            Pooled flat ground splats (blood) that fade.
  floaters.ts          DOM damage numbers projected from 3D points (toggleable).

src/game/
  ctx.ts               Ctx service-bag type + Stats + freshStats().
  weapons.ts           WEAPONS table (pistol/smg/shotgun/rifle/lmg) + makeLoadout.
  bullets.ts           Pooled tracer projectiles; swept XZ collision → combat.
  combat.ts            THE single damage funnel (damageZombie/damagePlayer):
                       adrenaline mult, floaters, blood, SFX, stats, meter.
  adrenaline.ts        Signature meter: zones (shaken→steady→focused→surge),
                       drift, multipliers, Last Stand crash. (port of tempo.ts)
  wall.ts              12 segments + pillars; localized damage; breach = sink to
                       rubble; setTotal() redistributes a persisted run.wallHp.
  zombie.ts            EnemyManager + Zombie + TYPES (shambler/runner/brute/
                       spitter/crawler/armored/screamer/tank); merged per-type
                       geometry (one draw call); FSM + breach-seeking, vaulting,
                       screamer speed-buff; telegraphs; Tank mini-boss at surge.
  player.ts            Defender: strafe, aim, fire/reload/swap, shove (Space),
                       hold-E repair/revive, HP, flashlight SpotLight (+ shadows
                       & volumetric cone) + lantern + muzzle flash.
  grenade.ts           GrenadeManager — the Last Stand frag (hold F to aim, arc,
                       blast + knockback + shockwave). Pooled.
  companion.ts         Rescued-survivor allies: auto-target + auto-fire, banter,
                       hold-E revive when downed.
  waveDirector.ts      One night: dusk→dawn clock + escalating spawn stream.
  run.ts               RunManager + persisted run state (weapons, companions,
                       wallHp, leg/night, stats helpers).

src/minigames/
  scavenge.ts          The day "Supply Run": top-down crate dash vs chasers;
                       returns { tier, frac } → loot. tierFromFrac() lives here.

src/ui/
  hud.ts               DOM night/day HUD (dawn timeline, HP, wall, adrenaline,
                       weapon/ammo, companions, kills) + banners.
  menus.ts             DOM overlays (title/pause/settings/report/loot/victory/
                       death) + opening story cutscene + persisted Settings
                       (SFX/music vol, mute, quality, shake, FOV, damage numbers,
                       reduced-flashing, colorblind, large text).
  style.css            The look (fonts, panels, crosshair, accessibility toggles).

src/audio/sfx.ts       Web Audio synth SFX table (+ stereo pan) + ambient bed;
                       subscribes to the SFX event; headless-safe.
src/audio/music.ts     MusicManager — crossfading streamed tracks by cue
                       (menu/night/surge/day/victory/defeat) from public/music.

scripts/smoke-electron.cjs   Real-renderer smoke harness (npm run test:play).
electron-main.cjs            Desktop wrapper (loopback HTTP server → dist/).
check-imports.mjs            Stop-hook shim → tsc --noEmit.
```

## Core invariants — read before editing

1. **Procedural-first assets.** No image/model files: meshes = Three.js
   primitives, textures = canvas-generated, all SFX = Web Audio synth. Bundled
   media is limited to fonts (`@fontsource`) and **streamed music**
   (`public/music/*.mp3`, via `audio/music.ts`). Don't add image/model assets;
   keep art procedural.

2. **TypeScript strict.** `noUnusedLocals`/`noUnusedParameters`/
   `noFallthroughCasesInSwitch` are on — dead code is a build error. `npm run
   verify` must stay green.

3. **The frame tick is synchronous.** No `async`/`await` on update/render. Use
   squared distance for range checks; reuse the pools (particles, bullets,
   grenades, decals, telegraphs, acid) instead of allocating in hot loops. The
   loop splits **game time vs real time**: gameplay + gameplay-FX run on a scaled
   `dt` (so hit-stop/slow-mo freeze them), while camera/world/post/music/HUD run
   on `realDt` so feedback stays smooth. Keep hit-stop short (capped ≤90ms) and
   slow-mo reserved for big moments, so a pause always reads as juice, not lag.

4. **One damage funnel.** All damage goes through `combat.damageZombie` /
   `combat.damagePlayer` — never poke HP directly. That's the single place that
   applies the adrenaline multiplier and spawns feedback. Same for the meter:
   change it via `adrenaline.gain/drain/crash`, never assign `.value`.

5. **2.5D-in-3D "behind the wall" read.** Axes: **+X along the wall, −Z into the
   field, +Y up** (`src/config.ts FIELD`). The wall sits at z=0, the defender
   behind it at +Z, zombies spawn far at −Z. Depth sorting is real 3D — the
   rampart camera keeps the wall a clear foreground silhouette. Don't feed Three
   negative/NaN geometry radii.

6. **Typed events.** Every `events.emit` name + payload must exist in `EventMap`
   (`src/core/events.ts`). A new SFX id emitted via `events.emit("SFX", {id})`
   must resolve in `audio/sfx.ts`'s `play()` switch.

7. **Run state lives on `ctx.run`.** Anything that must survive the night/day
   boundary (weapons, companions, wallHp, leg/night, stats) goes there. Wall
   integrity persists as a single `run.wallHp`, redistributed via
   `wall.setTotal()` at night start.

8. **State flow is explicit in `main.ts`** (`toTitle/startRun/beginNight/onDawn/
   startDay/onDayDone/onVictory/defeat`). Keep transitions there.

## Adding content — quick recipes

- **Weapon:** add to `WEAPONS` in `weapons.ts` (ensure `sfx` resolves in
  `sfx.ts`); grant via `run.grantWeapon(id)`. Reference HP: shambler 30, runner
  14, spitter 22, brute 135.
- **Zombie type:** add to `TYPES` in `zombie.ts` (`hp/speed/radius/claw/…`,
  optional `targetsPlayer/slam/standoff/spit*`); add to a night's `mix` in
  `waveDirector.ts`. New behavior → extend the `Zombie.update` state switch.
- **SFX/cue:** add a case to the `play()` switch in `audio/sfx.ts` (build from
  `tone`/`burst`), then `events.emit("SFX", { id })`.
- **Minigame:** new file in `src/minigames/`; expose `start/update/done` and emit
  `DAY_DONE { tier, frac }`; wire from `main.ts startDay`.
- **Scene/state:** add to the `GameState` union + a transition fn in `main.ts`.

## Before claiming done
- [ ] `npm run verify` — tsc strict + vite build, 0 errors.
- [ ] `npm run test:play` — **0 errors**, and skim `shots/` to confirm each
      scene actually draws. Do this whenever you touch rendering.
- [ ] New weapon/cue? Its `sfx` resolves in `audio/sfx.ts`.
- [ ] Touched night/day flow? The smoke still reaches `victory`.
- [ ] Added an asset file? **Don't** — procedural only.

> Run over the dev server / Electron — not by opening `index.html` from disk
> (ES modules + Vite paths need a real origin).

## What this codebase is NOT
No Phaser/Pixi/Babylon. No game logic in shaders beyond the small sky/particle
ones. No async on the engine path. No DOM/React for the *world* (canvas/WebGL);
the HUD/menus are intentionally DOM overlays. `roguehero2/` and the sibling
`Rogue-Hero-3/` are separate projects — RH3 is the architectural reference, not
a dependency.
