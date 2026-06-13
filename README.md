# Wall of Dead

A moody, behind-the-wall zombie **survival defense**. Hold the wall through the
night, scavenge by day, and push down the road to the safe zone — picking up
weapons and rescuing survivors who fight beside you along the way.

> Vanilla ES6 + Canvas2D + Web Audio. **Zero runtime dependencies, no build
> step.** Just serve the folder.

## Play

```bash
# Browser (primary)
python -m http.server 8000
# open http://localhost:8000

# Desktop app (optional Electron wrapper — dev tooling only)
npm install
npm start
```

## How it plays

- **Night — hold the wall.** Zombies emerge from the dark horizon and advance on
  your barrier. Move along the wall, aim into the gloom, and thin the horde
  before it claws through. Survive until **dawn**.
- **Day — scavenge & advance.** Play the Supply Run skill check for ammo and
  repair materials, pick up the occasional weapon or **rescue a survivor**, then
  travel one leg down the road.
- **Win** by reaching the safe zone (4 legs). **Lose** if you die or the wall is
  fully overrun.

### Controls

| Action | Input |
| --- | --- |
| Move along the wall | `A` / `D` (or `←` / `→`) |
| Aim | Mouse |
| Fire | Left click / hold |
| Reload | `R` |
| Swap weapon | `1` `2` `3` or scroll wheel |
| Confirm / advance | `Space` / click |

## Cast

- **4 zombie types** — *shambler* (the bulk), *runner* (fast, rushes the wall),
  *brute* (slow, heavy, smashes segments), *spitter* (hangs back and lobs acid
  at you).
- **4 weapons** — pistol, SMG, shotgun, hunting rifle (each with its own feel,
  ammo, and reload).
- **Companions** — rescued survivors auto-target and hold the wall with you.

## Mood

Everything is synthesized — no art or audio assets. Darkness with a lantern
glow, depth-scaled silhouettes with glowing eyes, drifting fog, blood and gore
particles, a dread vignette that creeps red when things go bad, and a Web Audio
horror layer (wind drone, distant groans and screams, a heartbeat that quickens
with the danger).

## Develop

- Source is plain ES6 modules under `src/**` — see [`CLAUDE.md`](CLAUDE.md) for
  the architecture map and invariants.
- `node check.mjs` runs a headless smoke test that drives a full run (and the
  game-over paths) and validates content integrity.

## Tech

Hand-rolled Canvas2D rendering and Web Audio synthesis. `package.json` exists
only to declare Electron + electron-builder as dev-time packaging tooling — the
game itself imports nothing from `node_modules`.
