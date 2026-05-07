# Wall of Dead

A top-down zombie-apocalypse roguelike. Scavenge by day, survive by night, reach the freedom zone before the dead reach you.

## Status — v1 complete

All eight milestones from the implementation plan are shipped:

| | Milestone | Highlights |
| --- | --- | --- |
| ✅ | **M0** Boot foundation | Title, scene manager, engine loop, EventBus |
| ✅ | **M1** Combat sandbox | WASD, mouse aim, pistol, shamblers, spatial-hash collision |
| ✅ | **M2** Weapons + zombies | SMG, shotgun, runners, spitters, multi-wave nights, synth SFX |
| ✅ | **M3** Map + run loop | Branching node graph, base camp, save/resume, MetaProgress |
| ✅ | **M4** Scavenging | Lockpick minigame with tier-based loot |
| ✅ | **M5** Full content | AR, sniper, rocket, flame, mines, grenades, bat + bloater, brute, screamer, crawler + WireCut minigame |
| ✅ | **M6** Boss + polish | BossPatientZero (3 phases), real Shop screen, Lighting overlay (flashlight + muzzle flashes), BGM hookup |
| ✅ | **M7** Dev console + tests | `_dev` API + 21-checkpoint headless smoke |

## Run it

ES modules need a server (don't open `index.html` directly):

```powershell
cd E:\Storage\SAAS\Wall-of-Dead
python -m http.server 8000
# open http://localhost:8000
```

Or paste `! python -m http.server 8000` into this Claude prompt to start it in-session.

## Controls

| Action | Key |
| --- | --- |
| Move | WASD |
| Aim | mouse |
| Shoot | left click (or hold for autos) |
| Reload | R |
| Switch weapon | 1 / 2 / … or mouse wheel |
| Sprint | Shift |
| Pause / back | Esc |

When every weapon's ammo runs out, left-click swings a **backup knife** automatically — short-range melee in a 100° front arc.

In the lockpick minigame: 1 / 2 / 3 (or click) when each pin sits inside its wedge.
In wire-cut: 1–5 to cut wires in the order shown before the per-prompt timer expires.

## BGM

The audio system tries `music/` first, then `../roguehero2/music/`. If neither is present it stays silent (synthesized SFX still play). Pools:

| Scene | Pool |
| --- | --- |
| intro / base camp | Main_Menu |
| map / scavenge / shop / event | Selection_Map |
| combat (regular night) | Normal_Battle |
| combat (boss night, locked) | Boss_Battle |

## Dev console

The browser devtools expose a `window._dev` API:

```js
_dev.startRun({ seed: 12345 });   // start a fresh run with a given seed
_dev.skipToBoss();                 // jump to night 7 with Patient Zero
_dev.spawnZombie('brute', 800, 400);
_dev.giveAllWeapons();             // dump every weapon into your inventory
_dev.refillAmmo();
_dev.setHp(100);
_dev.godmode(true);                // toggle invuln
_dev.killAll();                    // wipe live zombies
_dev.killBoss();                   // skip to phase complete
_dev.snapshot();                   // dump scene + player + counts as JSON
_dev.eventListenerCounts();        // EventBus listener counts (leak detector)
_dev.unlockAll();                  // mark every weapon unlocked in MetaProgress
_dev.resetMeta();                  // wipe localStorage progress
```

`window._wod` also exposes the raw systems (`events`, `input`, `runState`, `meta`, `sceneManager`, `engine`) for deeper poking.

## Headless smoke

```powershell
node check-imports.mjs
```

Loads every module under stubbed browser globals, then asserts:

- All 50+ source modules import cleanly
- Night 1 with SMG clears wave 1 (5+ kills)
- **No EventBus listener leaks** across 5 scene enter/exit cycles
- Random graph walk reaches the boss node
- sessionStorage save/resume round-trips seed/nightNum/node exactly
- Meta survives `localStorage` reload
- Lockpick + WireCut minigames score high on precise auto-play
- Click-through bug stays fixed (held LMB from previous scene does not fire)
- Backup knife dealt damage when all weapons dry
- Rocket AoE clears clustered zombies
- Bloater explodes on death and damages adjacent zombies
- Bat melee swing arc damages a zombie in front
- Grenade entity created on throw
- Mine entity created on placement
- Brute telegraphs + charges
- Screamer summons reinforcements on call
- BossPatientZero transitions phases 1 → 2 → 3 and emits BOSS_DEFEATED
- `_dev.giveAllWeapons` extends inventory to 10 weapons
- `_dev.godmode` blocks player damage

21 distinct system checkpoints — keeps the regression net tight enough that future feature work (e.g. multiplayer, more zombies) can run against it before opening a browser.

## Architecture

Vanilla ES modules, no build step, no dependencies. Modeled on `roguehero2/`'s patterns (Engine loop with hit-stop / slow-mo, EventBus, SpatialHash broadphase, particle pool, MetaProgress) but split into discrete files instead of a single 9k-line `main.js`.

```
index.html · style.css · README.md · check-imports.mjs · improve.md
src/
  main.js · Config.js · DevConsole.js
  engine/    Engine · EventBus · Input · Renderer · SceneManager · SpatialHash
             Particles · Audio · MetaProgress · Lighting
  core/      Entity · Player · Projectile · Mine · Grenade
  zombies/   Zombie · Shambler · Runner · Spitter · Bloater · Brute · Screamer · Crawler · BossPatientZero
  weapons/   AmmoTypes · WeaponDefs (10 weapons) · Weapon
  world/     Arena · NodeGraphGen · WaveDirector · RunState
  scenes/    Boot · Intro · BaseCamp · Map · Scavenge · Shop · Event
             Combat · GameOver · Victory · Meta
  minigames/ Minigame · LockpickGame · WireCutGame
  ui/        HUD · MapUI
  data/      WaveTemplates (nights 1-7)
  util/      geom · rng (mulberry32) · text (word-wrap)
```

## Things still ahead (post-v1)

- Simon and Pipe minigames (`MINIGAME_POOL` in `ScavengeScene.js` is the seam)
- Real text-event trees (currently 3 placeholder events)
- Local 2P co-op or online MP (the `roguehero2/` net stack is the reference)
- Sprite atlas if you want to replace the programmatic art
- Balance pass off telemetry once you've watched a few runs
