# Wall of Dead

A moody, behind-the-wall zombie **survival defense**, in 3D. Stand on the
rampart, strafe the barrier, and aim into the dark. Hold the wall through the
night until dawn, scavenge the field by day, and push for the safe zone.

Built with **Three.js + Vite + TypeScript** — procedural everything (no art
files; music is the one bundled exception): low-poly geometry under ACES tone
mapping + bloom, a trauma camera, and synthesized Web Audio. A polished
**3-act campaign**: Title -> **9 Nights / Days** -> HAVEN, with a "freedom isn't
free" choice at the gate. Each act is its own place (Outer Road -> Floodline ->
Haven Approach). Features: night tactics (spike traps,
an act-end zombie boss + dawn surge), a real stealth day with per-act
environments + a population choice (more loot = more risk), a 5-weapon carry cap
that forces loadout decisions, random between-nights events that can cost you
allies, survivor traits + a dawn dilemma, difficulty presets, controller +
mid-run save/resume.

## Play / develop

```bash
npm install
npm run dev          # http://localhost:5180
```

Night (defend):
- **A / D** — move along the wall · **Mouse** aim · **Click** fire (hold autos)
- **R** — reload (nail the green zone) · **1–5 / wheel** — switch weapons
- **Space** — shove/bash · **E** — repair a breach / revive an ally
- **T** — spike trap · **F (hold)** — lob a frag when Adrenaline is full · **Esc** — pause

Day (supply run): pick a district (more loot = more dead), then **WASD** sneak ·
**Shift** sprint (loud) · hide in
dumpsters to break a chase · grab supplies + repair kits, then reach the exit.
Stay out of the sight cones — getting caught ends the run. A **gamepad** works
throughout (twin-stick).

### Adrenaline

The signature meter. Holding the line and landing kills runs it hot — faster
fire, faster reloads, quicker feet, a brighter flashlight. Taking wall or player
damage bleeds it cold. Fill it and spend it on a **Last Stand** shockwave that
hurls the horde off the wall.

## Build & desktop

```bash
npm run verify       # tsc --noEmit && vite build (type + build gate)
npm run build        # production bundle → dist/
npm run standalone   # build + run as an Electron desktop app
npm run test:play    # build + drive the full slice in a real renderer,
                     # capturing screenshots to shots/ and any errors
```

## Project layout

See [CLAUDE.md](CLAUDE.md) for the full architecture map and invariants. In
short: `src/core` (events/input/math), `src/render` (stage post-FX, trauma
camera, world, particles, telegraphs, floaters), `src/game` (player, zombies,
wall, weapons, combat, the Adrenaline meter, wave director, run state),
`src/minigames` (the day supply run), `src/ui` (DOM HUD + menus), `src/audio`
(synth SFX). Boot + state machine live in `src/main.ts`.

> Earlier this was a hand-rolled Canvas2D game; it was rebuilt from scratch on
> Three.js in June 2026. The old version is preserved in git history.
