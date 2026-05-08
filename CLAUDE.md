# Wall of Dead — Claude Guide

## Project

Top-down zombie-apocalypse **survival horror** roguelike. v1 has shipped (8 milestones, 10 weapons, 8 zombie types, boss with 3 phases). The active agenda is the horror tone overhaul driven by `improve.md`: hand-authored floor layouts with scripted scares, environmental interactables, multi-gun cycling earlier with scarcer ammo, an atmospheric "apocalypse road" map, and a horror audio layer (BGM disabled until new music ships).

**Vanilla ES6 browser game, zero runtime dependencies.** Hand-rolled Canvas2D rendering and Web Audio synthesis. `package.json` exists *only* to declare Electron + electron-builder as dev-time tooling for the desktop wrapper — `index.html` and `src/**` import nothing from `node_modules` and still run as a static site. The sister directory `roguehero2/` is a *different* older project — its `.claude/CLAUDE.md` describes patterns that do **not** apply here. Do not copy from it without checking.

## Run / test

```powershell
# Serve in browser (zero deps — primary dev flow)
python -m http.server 8000
# then open http://localhost:8000

# Or run as a desktop app via the Electron wrapper
npm install
npm start

# Headless smoke test — checkpoints across import graph, scenes, combat,
# save/resume, minigames, boss, dev console, FloorDef integrity
node check-imports.mjs
```

The Electron wrapper (`electron/main.js`) is a packaging shell only. It loads `index.html` via `file://` the same way the static server does. Distributables: `npm run dist` (Win), `npm run dist:mac`, `npm run dist:linux`. **Never** add a runtime `import` from `node_modules` into `src/**` — the zero-deps invariant is the project's identity.

The smoke test is the regression net. Run it before claiming done. The Stop hook in `.claude/settings.json` runs it automatically at end of turn.

## Architecture map

```
src/main.js          Entry wiring + scene registration (~lines 70–80). Stays small on purpose.
src/Config.js        CANVAS dims, PALETTE, PLAYER constants.
src/DevConsole.js    `window._dev` debug API (cheats, scene jump, spawn helpers).
src/core/            Entity, Player, Projectile, Mine, Grenade.
src/engine/          Engine loop, EventBus, Input, Renderer (with dread vignette + CA),
                     SceneManager, SpatialHash, Particles (400-cap pool),
                     Audio (Ambient horror scheduler, BGM gated by BGM_DISABLED),
                     MetaProgress, Lighting (with `flicker()` helper).
src/world/           Arena (legacy/sandbox), Floor (per-night runtime), FloorDefs (7 hand-authored
                     layouts), Interactables (FuseBox/GasCan/HangingBody/Mannequin/RatNest/Door),
                     ScareEvents (scripted trigger runner), NodeGraphGen, RunState, WaveDirector,
                     WaveTemplates, EventDefs.
src/scenes/          Scene base + Boot, Intro, BaseCamp, Map, Scavenge, Shop, Event,
                     Combat, GameOver, Victory, Meta.
src/zombies/         Zombie base + 8 subtypes (Shambler, Runner, Spitter, Bloater, Brute,
                     Screamer, Crawler, BossPatientZero).
src/weapons/         AmmoTypes, WeaponDefs (10 weapons), Weapon.
src/minigames/       Minigame base + Lockpick, WireCut, Simon, Pipe (all four shipping).
src/ui/              HUD (with multi-weapon ribbon), MapUI (apocalypse road).
src/util/            geom (distance/angle), rng (mulberry32, seeded), text (word-wrap).
electron/main.js     Desktop wrapper (BrowserWindow loading file:// index.html). Sandboxed.
package.json         Electron + electron-builder devDependencies only. NO runtime deps.
```

Cross-system communication goes through `events` (EventBus) — see `src/engine/EventBus.js`. `window._wod` (set in `main.js`) exposes engine, sceneManager, runState, renderer, etc., for console debugging — `_wod.listenerCounts()` is what catches listener leaks.

## Core invariants — read these before editing

1. **Scene registration is manual.** New scenes must be registered in `src/main.js` (~lines 70–80) via `sceneManager.register(name, instance)`. Missing → silent unreachable scene.

2. **EventBus subscriptions must be cleaned up.** Subclasses of `Scene` (`src/scenes/Scene.js`) subscribe via `this.bus(event, fn)` — that auto-tracks the `(event, fn)` pair in `_busSubs` so the base `exit()` calls `events.off()` for each. Never call `events.on()` directly inside a scene without arranging an `events.off()` in `exit()`. Leaks surface via `_wod.listenerCounts()` and the smoke test's listener-leak checkpoint.

3. **Save format.** sessionStorage key is `wod_run_v1` (`src/world/RunState.js:16`). The snapshot persists `seed`, `resolvedIds`, `currentNodeId`, `nightNum`, `starterId`, and player state. **Weapons persist only `{id, mag, reserve}`** — `Weapon` instances are rebuilt from `WEAPONS[id]` on resume. **Floor identity is *not* persisted** — it's derived from the resolved node's nightNum at scene-enter time, so changing `FloorDefs.js` doesn't break old saves. Never persist class refs or behavioral tags. If you change the snapshot shape, bump the key (e.g. `wod_run_v2`).

4. **SFX IDs.** `sfxId` on a weapon must match an audio key registered in `src/engine/Audio.js` (kebab-case). The horror layer adds 17 atmospheric sfxIds (`heartbeat_slow`/`fast`, `whisper_short`/`long`, `floor_creak`, `pipe_drip`, `music_box`, `breath_held`/`panic`, `radio_static`, `door_slam`, `glass_shatter`, `rat_skitter`, `body_drop`, `flicker_buzz`, `chain_drag`, `distant_scream`). FloorDef `ambientCues` and ScareEvent `do` keys must resolve to real entries — the smoke test validates both.

5. **BGM is gated.** `BGM_DISABLED = true` at the top of `src/engine/Audio.js` short-circuits `playBgm()` and `_loadAndPlay()` to no-ops. The pool/shuffle/lock implementation is intact — flip the flag back to false when new tracks land in `music/`. Don't reach around the flag with direct `<audio>` element creation.

6. **Performance conventions.** Use squared-distance for range checks (avoid `Math.sqrt` on hot paths). Reuse particles via the 400-cap pool in `src/engine/Particles.js` rather than allocating. Pre-allocate arrays in tight loops. The engine tick is **synchronous** — no `async`/`await` in the engine path. Floor wall-collision is linear in wall-count (≤30 per floor) and runs each frame for player + every zombie — fine in practice.

7. **Module system & style.** ES6 `import`/`export` only. Plain JS, **no TypeScript**. No linter, no formatter — match the surrounding style of the file you're editing. One class per file is the dominant pattern. Heavy comments on physics/state-machine logic are welcome; avoid commenting trivial code.

## Horror systems (added after v1)

- **Floor layouts** — `src/world/Floor.js` extends Arena's API (clamp, perimeterSpawn, draw) with inner walls, authored spawn points, and a per-floor visual theme. CombatScene picks a `FloorDef` via `getFloorForNight(nightNum, isBoss)` when `runState.active`; sandbox launches and headless smoke fall back to plain `Arena`. Floor identity is derived, not stored.

- **Interactables** — instantiated from `FloorDef.interactables` via `buildInteractable(spec)` in `src/world/Interactables.js`. Shootable interactables (FuseBox, GasCan) are checked in CombatScene's update loop after projectile updates. Proximity interactables (HangingBody, RatNest) self-trigger when the player gets within `triggerR`. Mannequins, Doors, RatNests are decorative state machines.

- **Scare events** — `ScareEventRunner` ticks each frame and fires named action handlers (`flicker_lights`, `whisper_close`, `gas_leak`, `panic_pulse`, etc.) when their trigger condition (time / hp_below / kills_remaining / wave) is met. Each trigger latches `fired = true` so it runs at most once per level.

- **Ambient horror** — `audio.ambient` is a stochastic scheduler. Scenes call `start(<sceneKey-or-pool-array>)` on enter, `stop()` on exit, `tick(dt, dread01)` per frame. Below dread 0.4 the heartbeat layer is silent; above, it ramps from `heartbeat_slow` to `heartbeat_fast`. Cue frequency tightens from ~1/8–14s (calm) to ~1/3–5s (peak).

- **Dread post-process** — CombatScene writes `renderer.dreadVignette` and `renderer.dreadCA` per frame from a smoothed `_dread01` (low-HP + nearby zombies + boss baseline). Renderer's `drawVignette` rebuilds its cached gradient only when intensity drifts > 0.05; `drawCAFlash` blends impact-spike (caTimer) with dread-pulse, spike-dominates.

- **Map rendering** — `src/ui/MapUI.js` renders the apocalypse road. Backend graph data (`NodeGraphGen`, `RunState.resolvedIds`) is unchanged; only visual layout + iconography differs. **Map rendering is decoupled from save shape** — change MapUI freely without touching `wod_run_v1`.

## Adding content — quick recipes

### New scene
1. Create `src/scenes/MyScene.js`, `export class MyScene extends Scene` (`./Scene.js`).
2. Implement `enter(params)`, `exit()` (call `super.exit()`), `update(dt, realDt)`, `render(ctx)`. Optionally `engineState()` returning `'menu' | 'combat' | 'minigame' | 'paused'`.
3. Subscribe to events via `this.bus(...)`, never `events.on(...)` directly.
4. Import + register in `src/main.js` next to the other scenes (~lines 70–80).
5. Trigger a transition: `events.emit('SCENE_CHANGE', { name: 'myScene', params })`.

### New weapon
1. Add an entry to `WEAPONS` in `src/weapons/WeaponDefs.js`. Required keys (see existing entries): `id, name, ammoType, magSize, startReserve, fireRate, fireMode, damage, pellets, spreadRad, projectileSpeed, projectileLife, projectileR, reloadTime, recoilShake, bulletColor, sfxId`.
2. Optional behavior tags (each routes to a specialized fire path in `Player.js`): `burst`, `pierce`, `aoe`, `flame`, `placesMine`, `thrown`, `melee`, `hitStop`.
3. Add the SFX entry in `src/engine/Audio.js` if `sfxId` is new.
4. If the weapon should appear in scavenge loot, add its id to `RARE_WEAPON_POOL` in `src/scenes/ScavengeScene.js`.
5. Tune against the reference HP: shambler 32, runner 14, spitter 22.
6. Default `startReserve` should be on the lean side — the horror scarcity tuning expects ammo to feel meaningful.

### New minigame
1. Create `src/minigames/MyGame.js`, `export class MyGame extends Minigame` (`./Minigame.js`).
2. Implement `start(opts)`, `update(dt, input)`, `render(ctx)`, `getResult()` returning `{ tier: 'D'|'C'|'B'|'A'|'S' }`.
3. Set `this.done = true` when the player can no longer affect the score.
4. Register a factory lambda in `MINIGAME_POOL` in `src/scenes/ScavengeScene.js`. The pool now has four entries (Lockpick, WireCut, Simon, Pipe).

### New event
1. In `src/world/EventDefs.js`, add an OUTCOME entry: `{ resultText: string, apply(rs) { /* mutate runState */ } }`.
2. Add an EVENT entry to the events array: `{ id, title, blurb, choices: [{ label, outcome: 'OUTCOME_KEY' }, ...] }`.

### New floor
1. Add an entry to `FLOORS` in `src/world/FloorDefs.js`. Required: `id, name, blurb, theme, dims, walls, spawnPoints, interactables, scareEvents, ambientCues`.
2. Coordinates are 1280×720 with a 36px outer wall margin (interior x=36–1244, y=36–684).
3. Every `interactable.type` must resolve to a class exported from `src/world/Interactables.js`. Every `scareEvent.do` must resolve to a handler in `src/world/ScareEvents.js` `ACTIONS`. Every `ambientCues` entry must be a real `sfxId` in `Audio.js`. The smoke test validates all three.
4. Update `getFloorForNight` if the new floor should be picked for a specific night (currently it's `FLOORS[nightNum-1]` for nights 1–6, last entry for boss).

### New scare action
1. Add a function to `ACTIONS` in `src/world/ScareEvents.js` taking `(scene)`. Route work through `scene.audio.playSfx`, `events.emit`, or by mutating `scene.interactables`.
2. Reference the action's name from any FloorDef's `scareEvents.do` field.

### New interactable type
1. Create a class in `src/world/Interactables.js` with `update(dt, scene)`, `draw(ctx)`, optional `onShot(scene)` / `onPlayerNear(scene)`. Set `this.alive = true` initially; flip to `false` to remove. `shootable = true` opts into projectile collision.
2. Add the class to the `REGISTRY` map at the bottom of the file so `buildInteractable({ type: 'MyThing', ... })` resolves.

## Before claiming done

- [ ] `node check-imports.mjs` — all checkpoints pass.
- [ ] Edited a scene? Confirm `_wod.listenerCounts()` doesn't grow across enter/exit cycles.
- [ ] Changed the save snapshot shape? Bumped the `SESSION_KEY` version.
- [ ] Added a weapon? `sfxId` resolves to a real audio key.
- [ ] Added a floor? Every `interactable.type`, `scareEvent.do`, and `ambientCues` entry resolves.
- [ ] Added a runtime dependency? **Don't.** Push back; the zero-deps invariant is core.

## What this codebase is NOT

No Phaser / Pixi / Babylon / Three. No runtime npm deps (Electron is dev-only). No TypeScript. No Jest / Vitest / Playwright (the smoke test in `check-imports.mjs` is the only test harness). No async/await on the engine path. No React / Vue / DOM-driven UI — all UI is canvas-drawn.

## Current focus

`improve.md` is the active iteration agenda. The horror tone overhaul (BGM silenced, hand-authored floors with scripted scares, multi-gun cycling, ammo scarcity, apocalypse road map, dread-driven post-process) is shipping in phases. Treat that file as the priority list when scope is unclear.
