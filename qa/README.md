# Wall of Dead — closed-loop QA / self-improvement system

A self-iterating loop that drives the game toward a defined set of measurable
goals. Each cycle captures **objective evidence** (screenshots + in-game state),
scores it against the goals, and reports exactly what's still missing — so the
next cycle has a concrete work-list.

## The loop

```
        ┌──────────────────────────────────────────────────────────┐
        │                                                          ▼
  build ──► capture ──► check ──► report ──► [AI/human implements fixes]
 (tsc+vite) (real      (goals)   (per-cycle        │
            renderer)            report.md)        │
        ▲                                          │
        └──────────────────────────────────────────┘
                       run `npm run qa:cycle` again
```

- **Capture** (`capture.cjs`) — boots the built game in a real Electron/Chromium
  window, drives the full slice (title → night → day → victory), writes a
  screenshot at each meaningful step **and** a structured `snapshots.json` of
  in-game state. Each screenshot's real pixels are reduced to luminance stats
  (`mean`, `std`) so a black/dropped/flat frame is objectively detectable.
- **Observe / Implement** — the AI reads `report.md` (it embeds the screenshots
  as the visual source of truth and lists remaining gaps) and makes code changes.
- **Check** (`check.mjs`) — evaluates `goals.mjs` against `snapshots.json`. Every
  goal carries up to two independent signals: a **logic** assertion over state
  and a **visual** check over the screenshot. A goal is **met only when all of
  its signals pass**.
- **Report** (`report.mjs`) — writes a traceable `report.md`: scoreboard, gaps,
  screenshot gallery, captured state, and the cycle's `git diff --stat`.
- **Decide** (`loop.mjs`) — all goals met → exit 0 (done). Otherwise exit 2 and
  the loop continues on the next invocation.

## Run it

```powershell
npm run qa:cycle        # build + capture + check + report → next cycle
QA_MAX_CYCLES=30 npm run qa:cycle   # raise the stop budget (default 20)

# pieces, for debugging:
npm run qa:capture                  # just rebuild + capture into qa/cycles/adhoc
CYCLE_DIR=qa/cycles/adhoc electron qa/capture.cjs   # capture without rebuild
node qa/check.mjs qa/cycles/3       # re-score an existing capture

# map + scenario showcases (screenshot-driven verification):
npm run qa:maps                     # shoot every act night zone + supply theme,
                                    # assert the map trios are pairwise-distinct
npm run qa:scenarios                # cut to every debug SCENARIO and shoot it
```

## Debug scenario system (cut to a moment)

The game exposes a scenario registry on `window.__wod` so automated tests can jump
straight to a specific, screenshot-worthy state — no need to play through to it:

```js
window.__wod.scenarios()           // → [{ name, desc }, …]
window.__wod.scenario("boss-behemoth")   // cut to that moment; returns its desc
```

Scenarios cover the whole flow: `title`, `night-act1/2/3`, `boss-roadblock/
drowned/behemoth`, `surge`, `laststand`, `supply-outer/flood/haven`,
`dawn-dilemma`, `ending`, `defeat` (defined in `SCENARIOS` in `src/main.ts`).
`npm run qa:scenarios` drives all of them, screenshots each to
`qa/scenarios/run/scenario-*.png`, and writes `scenarios.json` (per-scenario
state + ok/fail). Add a scenario by adding one entry to `SCENARIOS`.

## Artifacts (traceability)

```
qa/
  goals.mjs            the objective goals + pass/fail criteria (source of truth)
  capture.cjs          screenshot + state capture harness
  check.mjs            goal evaluator  → results.json
  report.mjs           markdown report renderer
  loop.mjs             orchestrator (build→capture→check→report, budget, resume)
  progress.json        cumulative per-cycle history (generated)
  LATEST.md            copy of the most recent cycle report (generated)
  cycles/<n>/
    shots/*.png        screenshots for cycle n (visual source of truth)
    snapshots.json     captured state + per-shot luminance
    results.json       per-goal scoring
    changes.txt        git diff --stat for the cycle
    report.md          the cycle report
```

## Safe to stop & resume

Cycle state lives in `progress.json`; each `cycles/<n>/` directory is
self-contained and `snapshots.json` is written atomically. A crashed or
timed-out capture leaves prior cycles intact and simply scores the new cycle
from whatever it managed to record (missing state → that goal fails, never a
false pass). A failed **build** records the cycle and stops *before* capture, so
a broken tree can't corrupt prior evidence.

## Goals

See `goals.mjs` — the definitive list with both signals per goal. Summary:

| id | what it proves | signals |
|---|---|---|
| no-runtime-errors | clean full playthrough | logic + visual |
| title-screen | real lit menu | logic + visual |
| night-renders | wall draws in night state | logic + visual |
| hud-objective-clarity | HUD names LEVEL 1-1 cleanly | logic + visual |
| night-contrast-band | mid-night frame readable, moody | visual |
| adrenaline-surge-laststand | meter hits surge, spends | logic + visual |
| boss-encounter | boss alive + health bar | logic + visual |
| exploder-chain-credit | splash credits chain kills | logic |
| day-stealth-renders | supply run builds its props | logic + visual |
| weapon-cap | ≤5 weapons, 8+ fire | logic |
| campaign-victory-endings | victory + two endings | logic + visual |
| save-integrity | checkpoint written + cleared | logic |
| perf-no-hitch | no big frame stalls | logic |

A goal is **met** only when its screenshot evidence **and** its logic assertions
both pass.
