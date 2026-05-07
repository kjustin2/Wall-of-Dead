# Wall of Dead

A top-down zombie-apocalypse roguelike. Scavenge by day, survive by night, reach the freedom zone before the dead reach you.

## Status

In active development. Milestone progress:

- [x] **M0** — Boot foundation: title screen, scene manager, engine loop
- [x] **M1** — Combat sandbox: WASD movement, mouse aim, pistol shooting, shamblers
- [x] **M2** — Weapon variety: pistol / SMG / shotgun, runners, spitters, multi-wave nights, audio SFX
- [x] **M3** — Map + run loop: branching node graph, base camp loadout, save/resume, meta progress
- [x] **M4** — Scavenging: lockpick minigame with tier-based loot, weapon unlocks
- [ ] **M5** — Full content: AR / sniper / rocket / flamethrower / mines / grenades / bat, bloater / brute / screamer / crawler, 3 more minigames
- [ ] **M6** — Shop / events / boss night / lighting / polish
- [ ] **M7** — Tests / dev console / balance tuning

## Run it

```bash
# From the project root, any static server works:
python -m http.server 8000
```

Then open <http://localhost:8000> in a browser.

## Controls

| Action | Key |
| --- | --- |
| Move | WASD |
| Aim | mouse |
| Shoot | left click (or hold for autos) |
| Reload | R |
| Switch weapon | 1 / 2 / 3 / mouse wheel |
| Sprint | Shift |
| Pause / back | Esc |

In the lockpick minigame: 1 / 2 / 3 (or click to lock the next pin) when each pin sits inside its wedge.

## Dev console

The browser devtools expose `window._wod`:

```js
_wod.go('combat', { nightNum: 5 });   // jump to a specific scene
_wod.runState                          // current run state (read/inspect)
_wod.meta.state                        // persistent meta progress
_wod.listenerCounts()                  // EventBus listeners (leak check)
_wod.resetMeta()                       // wipe localStorage and start over
```

A more polished `_dev` API ships in M7.

## Headless smoke

```bash
node check-imports.mjs
```

This loads every module under stubbed browser globals, plays through several runtime scenarios (combat, graph walk, save/resume, lockpick), and asserts no listener leaks across scene transitions.

## Architecture

Vanilla ES modules, no build step, no dependencies. Modeled on `roguehero2/`'s patterns (engine loop, EventBus, spatial hash, particle pool, MetaProgress) but split into discrete scene files instead of a monolithic main.js. See `src/` directory tree.

Music tracks under `roguehero2/music/` are reused once the BGM hookup lands in M6; SFX are synthesized via Web Audio API, no asset files.
