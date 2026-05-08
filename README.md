# Wall of Dead

A top-down zombie-apocalypse survival horror roguelike. Pick a path down the apocalypse road, clear each floor of the dead, and reach the freedom zone before the night reaches you.

## Status — v1 shipped, horror overhaul in flight

The eight v1 milestones (boot → combat → weapons + zombies → map/run loop → scavenging → full content → boss + polish → dev console + tests) are all in. Active iteration is the horror tone shift driven by `improve.md`:

- **Hand-authored floor layouts** — each night is a unique location (apartment lobby, parking garage, pharmacy aisles, overgrown park, subway, boiler room, the boss crypt). Walls force line-of-sight combat; per-floor interactables script the scares.
- **Apocalypse Road map** — the arcade node-graph is gone. Picking the next stop now means clicking a creepy roadside vignette (signposts, lanterns, fog, parallax silhouettes). Underlying graph data is unchanged so saves still resume.
- **Multi-gun cycling earlier** — every run starts with a primary firearm + a melee bat. Scavenge tier A *guarantees* a third weapon. Cycle with **1–9** or the **mouse wheel**.
- **Ammo scarcity** — every weapon's `startReserve` was reduced ~40%. Scavenge loot is leaner. The flamethrower, AR, sniper, rocket, mine, and grenade now drop their own ammo types from B+ tiers.
- **Horror audio** — background music is silenced (`BGM_DISABLED` flag in `Audio.js` lets it come back when new music ships). A new ambient layer schedules whispers, creaks, drips, distant screams, and a heartbeat that accelerates as your dread climbs.
- **Dread post-process** — the screen vignette darkens with HP loss and zombie pressure; a slow chromatic-aberration heartbeat pulses on top of impact spikes.

## Run it

The game is a zero-dependency Canvas2D ES-module project. Two ways to launch:

### In the browser

```bash
python -m http.server 8000          # then open http://localhost:8000
```

(Or paste `! python -m http.server 8000` into this Claude prompt to start it in-session.)

### As a desktop app via the Electron wrapper

```bash
npm install
npm start
```

The Electron wrapper is purely a packaging shell — `index.html` and everything under `src/` still load via `file://` and never import from `node_modules`. Build distributables with `npm run dist` (Windows), `npm run dist:mac`, or `npm run dist:linux`.

## Controls

| Action | Key |
| --- | --- |
| Move | WASD / Arrow keys |
| Aim | mouse |
| Shoot | left click (or hold for autos) |
| Reload | R |
| **Cycle weapon** | **1 / 2 / 3 … or mouse wheel** |
| Sprint | Shift |
| Pause / back | Esc |

When every weapon's ammo runs out, left-click swings a **backup knife** — short-range melee in a 100° front arc. The bat in your starter loadout never reloads, so it's a permanent option even if you've burned through every magazine.

In the lockpick minigame: 1 / 2 / 3 (or click) when each pin sits inside its wedge.
In wire-cut: 1–5 to cut wires in the order shown before each prompt's timer expires.
Simon (memory of four lit quadrants) and Pipe (rotate tiles to route water) round out the scavenge pool.

## Floor system

Every combat node loads a hand-authored `FloorDef` from `src/world/FloorDefs.js`. Each entry carries:

- A theme (floor / wall / accent / fog tint, optional `theme.darkness` override).
- An array of inner walls (collision rectangles).
- Authored spawn points so zombies emerge from doorways and tunnels — not the perimeter.
- A list of interactables (`FuseBox`, `GasCan`, `HangingBody`, `Mannequin`, `RatNest`, `Door`).
- A list of scare events (time-based, hp-based, kills-remaining, wave-based) that fire scripted cues like flickering lights, distant screams, gas leaks, music-box phrases.
- An ambient pool — which sfxIds the per-floor ambient scheduler can pick from.

Floors 1–6 are the regular nights; the seventh is the boss crypt. The smoke test validates every interactable type and scare-event handler resolves to a real implementation.

## Apocalypse Road

`MapUI.js` no longer renders nodes as colored arcade circles. The road runs vertically with the boss at the top and your current position at the bottom, decorated with parallax burnt-building silhouettes, a drifting fog band, and an ember-orange horizon that deepens toward red as you near the freedom zone. Each upcoming location is a leaning signpost, a lantern, and a per-type icon (barricade, wreck, lone figure, lit window, fire pit, looming gate). Hover for the location's name and a one-line blurb.

The graph backend (`NodeGraphGen.js`, `RunState`'s `resolvedIds`) is unchanged. Save format stays on `wod_run_v1`.

## Horror audio

`src/engine/Audio.js`:

- **BGM is gated by `BGM_DISABLED = true`.** `playBgm()` and `_loadAndPlay()` are no-ops while the flag is on. The MP3 pools, shuffle, and lock logic stay in place — flip the flag to false once new tracks land in `music/` and everything wires back on.
- **17 horror SFX** synthesized via Web Audio (no MP3 deps): `heartbeat_slow`, `heartbeat_fast`, `whisper_short`, `whisper_long`, `distant_scream`, `floor_creak`, `pipe_drip`, `music_box`, `breath_held`, `breath_panic`, `radio_static`, `door_slam`, `glass_shatter`, `rat_skitter`, `body_drop`, `flicker_buzz`, `chain_drag`.
- **`audio.ambient`** schedules cues stochastically. Combat scenes call `ambient.start(<pool>)` on enter and `.stop()` on exit; each frame they call `.tick(dt, dread01)` where `dread01` blends low-HP, surrounded-zombie pressure, and boss baseline. Below dread 0.4 the heartbeat layer is silent; above, it ramps from `heartbeat_slow` to `heartbeat_fast`.

## Dev console

The browser devtools expose a `window._dev` API:

```js
_dev.startRun({ seed: 12345 });   // start a fresh run
_dev.skipToBoss();                 // jump to night 7 with Patient Zero
_dev.spawnZombie('brute', 800, 400);
_dev.giveAllWeapons();
_dev.refillAmmo();
_dev.setHp(100);
_dev.godmode(true);
_dev.killAll();
_dev.killBoss();
_dev.snapshot();
_dev.eventListenerCounts();
_dev.unlockAll();
_dev.resetMeta();
```

`window._wod` also exposes the raw systems (`events`, `input`, `runState`, `meta`, `sceneManager`, `engine`, `renderer`) for deeper poking. The renderer accepts live `dreadVignette` and `dreadCA` writes if you want to feel out the post-process scaling.

## Headless smoke

```bash
node check-imports.mjs
```

Loads every module under stubbed browser globals, then asserts module imports, no EventBus listener leaks across scene cycles, save/resume round-trips, lockpick + wirecut tier scoring, the click-through fix, backup knife damage, rocket / bloater AoE, bat melee, grenade + mine spawning, brute telegraph, screamer call, boss phase progression, dev-console smoke, and `_dev.godmode`.

The Stop hook in `.claude/settings.json` runs the smoke automatically at end of turn.

## Architecture

Vanilla ES modules, no build step, no runtime dependencies. (Electron in `package.json` is a packaging-only dev dep.) Modeled on `roguehero2/`'s patterns (Engine loop, EventBus, SpatialHash broadphase, particle pool, MetaProgress) split into discrete files.

```
index.html · style.css · package.json · electron/main.js
README.md · CLAUDE.md · improve.md · check-imports.mjs
src/
  main.js · Config.js · DevConsole.js
  engine/    Engine · EventBus · Input · Renderer · SceneManager · SpatialHash
             Particles · Audio (Ambient) · MetaProgress · Lighting
  core/      Entity · Player · Projectile · Mine · Grenade
  zombies/   Zombie · Shambler · Runner · Spitter · Bloater · Brute · Screamer · Crawler · BossPatientZero
  weapons/   AmmoTypes · WeaponDefs (10 weapons) · Weapon
  world/     Arena · Floor · FloorDefs · Interactables · ScareEvents
             NodeGraphGen · WaveDirector · RunState · EventDefs
  scenes/    Boot · Intro · BaseCamp · Map · Scavenge · Shop · Event
             Combat · GameOver · Victory · Meta
  minigames/ Minigame · LockpickGame · WireCutGame · SimonGame · PipeGame
  ui/        HUD · MapUI (apocalypse road)
  data/      WaveTemplates (nights 1–7)
  util/      geom · rng (mulberry32) · text (word-wrap)
```

## Things still ahead

- New BGM tracks (drop them into `music/` and flip `BGM_DISABLED` to false).
- More floor layouts and additional roadside-location names.
- Telemetry-driven balance pass once we've watched real runs at the new scarcity tuning.
- Optional sprite-atlas pass to replace the programmatic art if/when that ever feels worth it.
