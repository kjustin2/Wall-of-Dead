# Wall of Dead — Improvements (vertical-slice focus)

A thinking-it-through doc for refining the game **as a vertical slice** — the
current Title → 3 Nights / Days → Safe Zone run. Grounded in what's in the build
today. Tick what you want (or list the numbers) and I'll build it.

- **Scope right now:** *refine the existing slice only.* No multiple acts, no
  cross-run meta-progression, no endless/daily, no extra environments yet. Those
  are preserved in **§6 Parked (full-game expansion)** for later.
- **Effort:** S ≈ quick · M ≈ a session · L ≈ multi-session (kept rare on purpose)
- **Impact:** ★ nice · ★★ strong · ★★★ elevates the slice

> `POLISH-IDEAS.md` is the older list (mostly shipped). This doc supersedes it.

---

## 1. Honest read on the slice

**Strong already:** the night loop (peek-over wall, aim, hold to dawn) feels good;
Adrenaline→Last Stand gives a risk/reward spine; the day stealth run is a real
second pillar; the shared-armory ally loadout, repair-kit economy, and
revive/recruit loops add decisions; the look punches above flat-shaded geometry.

**Where the slice is thin (what "refining" should target):**
- **The night is mostly "aim well."** Few *tactical* choices mid-night beyond
  weapon swap, frag, and repair. No positioning payoff, no traps.
- **The day is one verb.** Great mood, but it's basically "avoid the cones."
  Needs stealth *verbs* (takedowns, distractions, hiding) to be a true pillar.
- **No climax.** Night 3 just... ends. The slice wants a peak — a finale on the
  last night.
- **Narrative is set-dressing.** The ally/survivor systems are mechanically rich
  but emotionally flat — a little characterization makes losses *land*.
- **Some feel beats are dead** (reload, the dawn moment, gore) — cheap juice left
  on the table.

Everything below stays inside the 3-night slice — it deepens what's there rather
than adding new modes/content layers.

---

## 2. The high-leverage slice refinements

### Lever A — The day becomes a real game (stealth verbs)
The supply run looks great but plays as one verb. Give the *existing* run depth.
- [ ] **A1. Stealth takedowns** (M, ★★★) — sneak behind a guard (outside its
      cone, in range, hold a key) for a silent kill. Turns avoidance into
      cat-and-mouse with agency; alerts nearby guards if seen mid-takedown.
- [ ] **A2. Distractions / lures** (M, ★★) — throw a bottle/flare to pull guards
      toward a noise, opening a path. A second verb that rewards planning.
- [ ] **A3. Hiding spots / break line-of-sight** (M, ★★) — duck behind cover or
      into a locker to drop a chase (guards enter a "search" state and lose you).
- [ ] **A4. Soften "caught = instant end"** (S, ★★★) — one touch ending the run
      is harsh. Options: a short escape window (sprint free for ~2s after a
      touch), or drop some supplies + brief stun instead of game over. You
      flagged this — worth deciding; it changes the day's feel most.
- [ ] **A5. Light & noise as mechanics** (M, ★★) — your flashlight can give you
      away (toggle off to hide but see less); sprinting is loud and widens guard
      detection. Makes your toolkit a real stealth kit.
- [ ] **A6. Extraction beat** (S, ★) — after the goal, sprint to an exit before
      the clock ends for a tier bonus — a small climax to each run.

### Lever B — A night with tactics (choices beyond aim)
Deepen the *existing* night without adding new modes.
- [ ] **B1. Deployables / traps** (M, ★★★) — spend repair kits / supplies to place
      bear traps, barbed wire (slows a lane), or a sandbag reinforce (raises a
      segment's max HP). Adds a setup phase + positional strategy.
- [ ] **B2. A second active ability** (M, ★★) — beyond the frag: a flare (lights
      the field + slows), a med-stim (self-heal), or "overdrive" (spend Adrenaline
      for a few seconds of infinite ammo). A tiny loadout of abilities = expression.
- [ ] **B3. Ammo scarcity with teeth + guaranteed sidearm** (S, ★★) — tune
      reserves so you genuinely ration and lean on the shared armory + day ammo
      runs; add an always-available pistol so "out of all ammo" is rare but
      rationing is real. Gives the whole economy stakes.
- [ ] **B4. Command your allies** (M, ★★) — point an ally to hold a segment or
      focus-fire; makes the ally system tactical, not just auto-fire.
- [ ] **B5. Choke-point geometry** (M, ★) — a wrecked-bus gap / rubble that funnels
      zombies so *where* you stand and aim matters.

### Lever C — A finale for the slice (a peak on night 3)
- [ ] **C1. A night-3 boss** (L, ★★★) — a multi-phase horror on the final night
      (a "Behemoth" that rips whole segments; or a "Brood" that spawns adds) with
      telegraphed attacks (the telegraph system already exists). Gives the slice a
      summit instead of just ending. (Scoped to ONE boss for the slice.)
- [ ] **C2. Escalating signature threats** (M, ★★) — the Tank is great; give
      nights 1/2/3 each a distinct headline threat (e.g. night-2 Spitter-queen
      that shells from range) so the three nights feel different.
- [ ] **C3. Dawn's-edge surge** (S, ★★) — the last ~15s of each night become a
      desperate wall of bodies with music + lighting peaking, so the finish feels
      earned.

### Lever D — Stakes & character (within the 3 nights)
- [ ] **D1. Survivors with names + a trait** (M, ★★★) — rescued allies get a
      trait (Marksman: +accuracy · Medic: revives/heals faster · Gunner: faster
      fire) and a one-liner. Ties recruit/loadout/revive to real stakes — losing
      one *matters*. Pure slice content, no meta needed.
- [ ] **D2. Inter-night story beats** (S, ★★) — short radio/log lines between the
      nights that advance the convoy's plight and foreshadow the next.
- [ ] **D3. A dawn dilemma** (M, ★★) — at dawn, one choice with a consequence this
      run (share ammo with a stranger to recruit them vs keep it; risk a deep
      supply run vs play safe). Light but memorable.
- [ ] **D4. Richer ending screen** (S, ★) — expand the victory/defeat epilogue by
      allies saved, wall integrity per night, supplies, deaths; a proper summary.

---

## 3. Game feel & juice (cheap wins)
- [ ] **3.1 Active reload** (S, ★★) — tap-at-the-mark reload for a faster reload +
      small buff; gives a dead beat skill.
- [ ] **3.2 Limb damage** (M, ★★) — legs slow them, arms stop clawing; rewards
      target priority.
- [ ] **3.3 Gore & dismemberment pass** (M, ★) — more visceral, lingering kills.
- [ ] **3.4 Kill-cam / slow-mo on the final dawn kill** (S, ★★) — a payoff beat.
- [ ] **3.5 Cinematic dawn** (S, ★★) — sun crests, fog burns off, birdsong — a
      bigger exhale when you survive a night.
- [ ] **3.6 Execution on a stunned brute/tank** (S, ★) — a finisher.
- [ ] **3.7 LMG overheat** (S, ★) — punish never letting go of the trigger.
- [ ] **3.8 Per-segment 3D damage states** (S, ★) — cracks → leaning → rubble, so
      you read the wall's health at a glance in the world (not just the bar).

## 4. Enemies & telegraphs (within the current roster)
- [ ] **4.1 Telegraphed specials for every type** (M, ★★) — spitter barrage,
      runner lunge line, screamer AoE pulse — fairness + readability.
- [ ] **4.2 Hazard zombies** (M, ★★) — exploder (gas on death), shielded (flank
      it), leaper (instant vault) — variety inside the existing fight.
- [ ] **4.3 Deepen breach-seeking** (S, ★) — horde visibly piles on the weakest
      segment / an open breach.

## 5. UX, onboarding, audio/visual, accessibility, perf (slice polish)
- [ ] **5.1 Loadout onboarding nudge** (S, ★★) — first time at LOADOUT, a one-time
      callout on shared-armory + melee fallback (you hit this confusion).
- [ ] **5.2 Wall threat strip / mini-map** (M, ★★) — a clear top strip showing
      where pressure is along the wall (a better version of the removed pips).
- [ ] **5.3 Off-screen threat markers** (S, ★) — arrows for crossers flanking you.
- [ ] **5.4 Controller support** (M, ★★) — twin-stick fits a gamepad perfectly.
- [ ] **5.5 Save & resume mid-run** (M, ★★) — checkpoint at each dawn so a slice
      run survives a refresh/close (single-run, not meta).
- [ ] **5.6 Key rebinding + aim-assist option** (M, ★) — accessibility depth.
- [ ] **5.7 Difficulty presets** (S, ★★) — Story/Normal/Nightmare scaling HP /
      spawn rate / wall strength / ammo — refines balance + accessibility of the
      one slice.
- [ ] **5.8 Layered/adaptive music** (M, ★★) — intensity stems on top of the cue
      tracks; more layers as the wave thickens, drop at lulls.
- [ ] **5.9 Positional SFX attenuation** (S, ★) — distance falloff on enemy sounds.
- [ ] **5.10 Weather variety** (M, ★) — a storm night vs a clear moonlit night for
      mood across the three nights.
- [ ] **5.11 Zombie pooling** (M, ★) — reuse actors instead of build/dispose per
      spawn (less GC) — quiet perf refinement.
- [ ] **5.12 Quality auto-detect on boot** (S, ★) — a quick FPS probe to pick the
      starting preset (adaptive downscale already exists).
- [ ] **5.13 Preload/loading screen** (S, ★) — avoid a first-play hitch while music
      streams in.

---

## 6. Parked — full-game expansion (NOT now)
Preserved for when we go past the slice. Explicitly out of scope today.
- Relics / perks drafted across nights (roguelite build system).
- Day **expedition choice** (multiple run types per day).
- Cross-run **meta-currency + unlocks**; **daily/seeded** runs; **endless/horde**
  mode; **achievements**.
- **More acts / legs / environments** beyond the 3-night slice (flooded underpass,
  city gate, etc.).
- Branching multi-run narrative; cosmetic shop.
- Instanced-zombie mega-hordes (only needed for set-pieces beyond the slice).

---

## 7. Suggested slice bundles (pick a direction)
- **"The day becomes a game":** A1 takedowns + A2 distractions + A4 soften caught
  + A3 hiding. → the supply run goes from mood-piece to a pillar.
- **"A night with teeth":** B1 deployables + B2 second ability + B3 ammo scarcity.
  → the defense gets real tactics.
- **"Make night 3 a finale":** C1 boss + C3 dawn surge + 3.4 kill-cam + 3.5
  cinematic dawn. → the run earns a climax.
- **"Stakes & polish":** D1 survivor traits + D2 beats + D4 ending screen + 5.1
  loadout nudge + 5.7 difficulty.

Best impact-per-effort if you want one tight pass: **A4 (soften caught) + A1
(takedowns) + B3 (ammo scarcity + sidearm) + D1 (survivor traits) + C3 (dawn
surge)** — all deepen existing systems, no new modes, and they make the slice
feel like a complete, replayable-in-itself experience.

## 8. Risks / guardrails
- **Keep it a slice.** 1–2 items per pass; stay shippable (tsc + `npm run
  test:play` green each time).
- **Protect the identity:** tense, moody, readable. Add *decisions*, not HUD
  clutter.
- **Asset discipline:** procedural art only; music is the one bundled exception.
