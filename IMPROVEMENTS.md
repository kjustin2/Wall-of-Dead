# Wall of Dead — Improvement Ideas

_Written 2026-06-24. A prioritized menu of the highest-leverage improvements,
grounded in a read of the current code. **Ideas only — no code changed yet.**_

## The one-line read

The game is **mechanically complete and well-architected** — 15/15 QA goals, a
full 9-level 3-act campaign, 10 weapons, 14 enemy types, bosses, a real stealth
day, save/resume, difficulty, controller. What it's missing is not *systems* —
it's the **feedback, decision-density, and texture** layer on top of those
systems. Across combat, the day run, presentation, and the meta layer, the same
pattern repeats: **the machinery exists but is silent or shallow.** The biggest
wins are making what's already there *read*, *feel*, and *force a choice*.

Everything below respects the invariants: procedural geometry, canvas textures,
synth audio (music mp3s the only bundled media), and the house style —
**weighty animation, restrained VFX, no screen-filling flashes.**

---

## Priority tiers

| # | Theme | Impact | Effort | Why |
|---|-------|--------|--------|-----|
| **1** | **Juice / feedback layer** | ★★★ | Low–Med | Systems exist but are invisible; this is the single highest impact-per-hour and matches the "professional feel" bar exactly. |
| **2** | **Close the day-stealth gap** | ★★★ | Med | Documented verbs (takedown/lure) **aren't implemented** — the day is avoidance-only. Fixing this is correctness *and* depth. |
| **3** | **Deepen Adrenaline (the signature)** | ★★★ | Med | The named mechanic has one spend and invisible effects. Make it a real decision space. |
| **4** | **Wave orchestration & enemy reads** | ★★ | Med | Spawns are random + signatures are cosmetic. Turn pressure into *pattern* the player can read and counter. |
| **5** | **Run texture & day↔night loop** | ★★ | Med–High | Meta choices are resource-only; companions are thin; the two endings are label-only. Give the run consequence and personality. |
| **6** | **A/V fidelity passes** | ★★ | Low–Med | Particle monotony, no environmental damage states, music cue confusion, stiff HUD. |

My recommendation: **do #1 first** (it compounds with everything else and is
cheap), then **#2** (it's a truth-in-advertising fix as much as a feature), then
pick between #3/#4 depending on whether you want to deepen the *signature* or the
*threat*.

---

## 1. The juice / feedback layer  ★★★ — ✅ IMPLEMENTED (2026-06-24)

The recurring finding in every system: **the effect happens, but the player
can't feel it.** Adrenaline multipliers fire silently; headshot kills look like
body shots; the health bar jumps; nine shotgun pellets land as one number; the
wall breaches with no on-screen "where." All of this is screen-space + audio
synthesis — no assets, low risk, immediate payoff.

**Hit & death feedback** (`combat.ts damageZombie`, `particles.ts`)
- **Overkill scaling** — gore particle count scales with `damage / hp` so a
  rifle round into a shambler erupts and a chip shot doesn't. Right now every
  hit bursts identically regardless of lethality.
- **Wound-located floaters** — spawn the damage number at the *hit point*
  (head vs. torso), not the chest centroid. Headshot kills get a distinct
  pop + a short bone-crack tone (`sfx.ts`, ~1200 Hz, 0.04 s) before the squelch.
- **Knockback by weight** — shove/Last Stand repel scales inversely with mass;
  a brute *barely* moves while sparks + trauma stay full ("I pushed it but it
  held"). Currently every push is a fixed 8-unit repel.

**Weapon weight** (`player.ts`, `cameraRig.ts kick()`, `stage.ts punch()`)
- **Camera kick on heavy shots** — shotgun/rifle/magnum get a brief backward
  `kick()` so the gun has recoil *weight*. The API already exists; it's only
  wired to player-hurt trauma today.
- **Per-pellet shotgun feel** — split the 9-pellet hit into 3 light bursts +
  layered impacts instead of one cloud, so buckshot reads as a *spread*.
- **Visible bloom cone** — the aim reticle ring expands while auto-firing to
  show spread growth, tightens when you let off. Makes recoil legible.

**HUD that breathes** (`hud.ts`, `style.css`)
- **Eased bars** — `damp()` the HP/wall/adrenaline fills instead of jumping.
  This single change is the clearest "juicy vs. functional" tell.
- **Adrenaline zone transitions** — a 0.15 s scale-pulse + brief ring flash on
  `steady→focused→surge` so crossing a tier is *felt*. Today it's silent.
- **Crosshair feedback** — ring scales 1.0→1.3→1.0 on hit; gold flash on crit;
  weapon-swap icon bounce.

**Environmental "where"** (`world.ts`, `decals.ts`)
- **Breach flash** — the breached wall sector briefly brightens (emissive white
  → orange glow) + a persistent dark stain blooms from the rupture, so a breach
  has a *location*, not just a number drop. Pair with the breach sting.
- **Lightning as a real light event** — on a storm flash, spike
  `toneMappingExposure` and key-light intensity for ~0.12 s instead of only
  showing a far sprite.

> Regression probe: add screenshot checks to `qa/` for overkill gore, a breach
> flash frame, and the eased HUD (per the "regression probe for every fix" rule).

---

## 2. Close the day-stealth gap  ★★★

**Truth-in-advertising issue:** `README.md`, `CLAUDE.md`, and the header comment
in `scavenge.ts` all describe **takedown (hold E)** and **lure (Q)** as core day
verbs — but `scavenge.ts` implements neither. The day run today is **sneak,
sprint (loud), flashlight toggle, hide-in-alcove, grab crates.** It's pure
*avoidance*: you can never act *on* a guard, only dodge it. That makes the
stealth shallow and the docs wrong.

**Implement the missing verbs**
- **Takedown (hold E behind an unaware guard)** — a ~1.5 s commit that removes a
  patrol permanently if undetected; interrupting it or being seen mid-takedown
  triggers a grab. High risk / high reward; opens routes.
- **Lure (Q, throw a noise source)** — pulls the nearest guard's investigate
  state to a thrown point, opening a window. The passive `NOISE_SPRINT` radius
  already models "sound draws guards" — this makes it a *verb*.

**Deepen guard AI** (`scavenge.ts` guard FSM)
- **Persistent investigate** — after losing you, a guard searches your
  last-seen point for ~8 s before resetting, instead of snapping back to patrol.
- **Type-distinct senses** — brute = narrow cone but loud footsteps; runner =
  wide cone, fast chase; spitter = standoff harasser. Today types mostly differ
  cosmetically.
- **Screamer as alarm** — a screamer that spots you alerts *all* guards in
  radius, turning one mistake into a hunt (a real "kill/avoid the screamer
  first" read).

**Tension arc** (currently flat 82 s, extract at ~50%)
- Escalate by density: calm at low crate counts, wider cones + paired hunts when
  you push for S-tier. A late siren (last ~15 s) that sets all guards hunting
  makes "push for one more crate" a genuine gamble.

---

## 3. Deepen Adrenaline — the signature mechanic  ★★★

It's the game's named hook, but today it's **one spend (Last Stand / F) and four
invisible multiplier zones.** The decision is binary: crash now or hold. Give it
a *spend economy* and make the zones playstyles, not thresholds.

- **More than one spend** — at `focused`+, unlock a cheap tactical spend:
  e.g. drain ~5 to negate one incoming hit (a 0.15 s parry pulse), or a
  per-weapon **alt-fire** (rifle precision round, SMG burst, shotgun slug) that
  costs meter pressure. Turns the meter into a resource you *manage*, not just
  accumulate toward one button.
- **Make the multipliers visible** — only the flashlight currently shows the
  meter. Surface fire-rate/damage/move through feedback (a hotter muzzle, a
  faster-cycling reticle, a subtle motion cue) so "I'm cooking" is legible.
- **Zone-change juice** — see #1; the meter crossing a tier should land.

---

## 4. Wave orchestration & enemy tactical reads  ★★ — ✅ IMPLEMENTED (2026-06-24)

Today escalation = **higher spawn rate + count**, the stream is random weighted
picks, and the named "signatures" (BRUTE CHARGE, etc.) are cosmetic text events
that spawn 2 enemies at a fixed time. Enemies have behaviors but few *counterable
moments*.

**Orchestrate the stream** (`waveDirector.ts`)
- **Signatures that pivot the wave** — a BRUTE CHARGE also raises the cap and
  reweights the mix for ~20 s, so it's a *pressure shift*, not a caption.
- **Screamer coordinates** — after a screamer spawns, the next several spawns
  arrive as a focused runner/brute push, selling "the horde organized — kill the
  screamer."
- **Light tempo response** — sustained surge or a top-tier kill streak earns a
  miniboss "answer," so skill is met with a check rather than just running the
  clock.

**Counterable enemy moments** (`zombie.ts` FSM)
- **Interruptible brute slam** — enough damage during the windup cancels it.
  Turns a telegraph you only dodge into one you can *beat*.
- **Lunge counter window** — shove / Last Stand during a runner's boost stacks
  knockback, rewarding a read.
- **Shield as a real puzzle** — body shots chip + clink + dim the plate, the
  break is a loud clang; today headshots just bypass it silently.
- **Targeted wall pressure** — heavies path to the *weakest* visible segment
  (crack + glow as HP drops), creating "hold the weak point" moments. Breaches
  create a brief local speed-up ("avalanche") that repairing stops, so repair
  feels urgent, not a chore.

---

## 5. Run texture & the day↔night loop  ★★ — ✅ IMPLEMENTED (2026-06-24)

The meta scaffolding is all present (companions, traits, dilemmas, events, two
endings, save/resume) but **thin**: dilemmas are resource-only, the two endings
are *label-only* (both just reach the victory screen), companions share ~6 barks,
and the day's outcome doesn't meaningfully shape the night.

**Make the loop close**
- **Supply yield → night stakes** — a D-tier day means leaner night ammo; S-tier
  buys a margin. Right now the haul is loose ammo/kits with no felt curve.
- **Consequential choices** — the Haven-gate ending and the mid-run dilemmas
  should branch *something* (a starting condition, a modifier, an epilogue beat),
  not just change report text.

**Companions with personality** (`companion.ts`, `traits.ts`)
- **Trait-flavored, spaced barks** + occasional **ally-to-ally exchanges**, so
  the roster feels alive without a dialogue tree.
- **Simple ally orders** — hold / fall back. (A focus-fire "C" order shipped
  and was cut as confusing; any future order needs a clearer tactical read.)
- **A light morale thread** — losses/breaches dim it, kills/repairs lift it,
  nudging ally fire-rate and bark tone. Low cost, lots of texture.

**Replayability** (no meta-progression — see §6)
- **Run modifiers** as opt-in challenges (Iron Wall: no repairs; Storm Front:
  shorter, louder days; Pack Tactics: smarter guards) for variety within the
  fixed campaign.

---

## 6. A/V fidelity passes  ★★

Lower-priority but visible polish, all procedural/synth.

- **Particle variety** (`particles.ts`) — only burst/cone clouds exist; blood,
  sparks, casings, acid all read the same. Give casings tumbling arcs, sparks
  spiky directional cones, blood a heavier settling thud — keyed to hit
  location + surface normal.
- **Environmental damage states** (`world.ts`) — props are static set-dressing;
  scorch/blast marks, progressive ruin, and a damage-state on barrels/wrecks
  would make the fight leave a mark.
- **Music cue confusion** (`music.ts`) — only 3 real tracks cover 6 cues; **boss
  surge and *defeat* share a track**, and victory reuses the menu theme. At
  minimum re-map so defeat ≠ boss; ideally add 1–2 cues.
- **Ambient dread** (`sfx.ts`) — an occasional quiet, low-passed distant groan
  from a random far point during the night, purely atmospheric.
- **Decal variety** (`decals.ts`) — 48 identical flat circles exhaust fast in a
  firefight; add splatter shapes + acid etch + scorch.

---

## Out of scope (§6 referenced by CLAUDE.md)

Deliberately **not** pursuing, to keep the campaign focused:

- **Meta-progression / unlocks between runs** — no XP, currency, or persistent
  upgrades carrying across playthroughs. The campaign is a self-contained arc.
- **Endless / horde-survival mode** — the 9-level structure is the product; an
  endless mode would dilute the act pacing and the day↔night rhythm.
- **New rendering tech / engines** — no Phaser/Pixi/Babylon, no game logic in
  shaders beyond the small sky/particle ones, no async on the engine path.
- **Non-procedural art or model/image assets** — procedural-only stays a hard
  invariant; music + fonts remain the only bundled media.

---

## Suggested first slice

If you want one concrete, shippable next step: **the §1 feedback pass on the
night fight** — eased HUD bars, adrenaline zone-transition juice, overkill gore
scaling, wound-located headshot feedback, camera kick on heavy weapons, and the
breach flash. It's low-risk, no new systems, lands squarely on the "professional
feel" bar, and makes every *other* improvement on this list read better once
it's in. Gate it the usual way (`npm run verify` → `npm run test:play`, skim the
shots) and add the matching `qa/` probes.
