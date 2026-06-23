// =============================================================================
// Wall of Dead — objective goals for the self-improvement loop.
// =============================================================================
// This is the single source of truth for "what good looks like". Each goal can
// declare up to two INDEPENDENT pass signals:
//
//   logic(s)  -> { pass, detail, value? }   asserts in-game state / values
//   visual    -> { shot, expect, auto(st) } objective check on a REAL screenshot
//
// A goal counts as MET only when EVERY signal it declares passes (see check.mjs).
// That enforces the success criterion in the brief: a visual/UX goal needs both
// its screenshot evidence AND its logic assertion to pass.
//
// `s` is the snapshots object produced by qa/capture.cjs:
//   {
//     errors: string[],                       // console + uncaught, whole run
//     shots:  { [name]: {mean,std,w,h} },     // per-pixel luminance of each shot
//     steps:  { title, night, wave, perf,     // structured state per checkpoint
//               surge, boss, exploder, weapons, day, campaign }
//   }
//
// The visual `auto(st)` callbacks read the luminance stats computed from the
// actual rendered pixels (mean brightness 0..255 + stddev = "how much content").
// A pure black frame -> mean~0, std~0 -> fails. A flat fill -> std~0 -> fails.
// These are objective proxies; the AI implementer also eyeballs the PNGs each
// cycle (the report embeds them) for the qualitative half of the visual signal.
// =============================================================================

/** Real content drew (not a black/dropped frame). Night scenes are intentionally
 *  dark, so the honest signal is pixel VARIANCE (a black/flat/dropped frame has
 *  std≈0); the mean floor only rejects a truly black frame. */
const notBlack = (st) => !!st && st.std > 8 && st.mean > 3;
/** Visually rich (lit art / many shapes), not a flat fill. */
const rich = (minStd) => (st) => !!st && st.std > minStd;
/** Brightness sits in a readable band [lo,hi] with real contrast. */
const band = (lo, hi, minStd = 8) => (st) => !!st && st.mean >= lo && st.mean <= hi && st.std >= minStd;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

export const GOALS = [
  // ---- Stability ----------------------------------------------------------
  {
    id: "no-runtime-errors",
    title: "Full playthrough produces zero console/uncaught errors",
    category: "stability",
    logic: (s) => ({
      pass: (s.errors?.length ?? 1) === 0,
      detail: `${s.errors?.length ?? "?"} errors`,
      value: (s.errors || []).slice(0, 8),
    }),
    visual: { shot: "01-title.png", expect: "Title renders (not a black/crashed frame)", auto: notBlack },
  },

  // ---- Title / menu UX ----------------------------------------------------
  {
    id: "title-screen",
    title: "Title is a real menu (START present) with a rich lit backdrop",
    category: "ux",
    logic: (s) => {
      const t = s.steps?.title || {};
      return { pass: t.state === "menu" && !!t.hasStart, detail: `state=${t.state} start=${t.hasStart}` };
    },
    visual: { shot: "01-title.png", expect: "Lit title art + menu, not a flat fill", auto: rich(10) },
  },

  // ---- Night render -------------------------------------------------------
  {
    id: "night-renders",
    title: "Night scene draws the full 12-segment wall in the night state",
    category: "render",
    logic: (s) => {
      const n = s.steps?.night || {};
      return { pass: n.state === "night" && num(n.wallSegs) >= 12, detail: `state=${n.state} wallSegs=${n.wallSegs}` };
    },
    visual: { shot: "03-night-action.png", expect: "Wall + zombies + HUD over a dark field", auto: notBlack },
  },

  // ---- HUD objective clarity ---------------------------------------------
  {
    id: "hud-objective-clarity",
    title: "Night HUD names the act-level (LEVEL 1-1) without a confusing /total",
    category: "ux",
    logic: (s) => {
      const n = s.steps?.night || {};
      const banner = String(n.banner || "");
      const chip = String(n.levelChip || "");
      const pass = banner.includes("LEVEL 1-1") && chip.includes("LEVEL 1-1") && !banner.includes("/");
      return { pass, detail: `banner="${banner}" chip="${chip}"` };
    },
    visual: { shot: "03-night-action.png", expect: "HUD legible over the scene", auto: notBlack },
  },

  // ---- Lighting / readability band ---------------------------------------
  {
    id: "night-contrast-band",
    title: "Mid-night frame is dark-but-readable (not pitch black, not blown out)",
    category: "visual-quality",
    // Pure visual goal: the most-seen frame of the night must sit in a usable
    // brightness band with real contrast. Guards the late-night lighting regressions
    // the smoke harness has historically worried about.
    visual: { shot: "03c-night-mid.png", expect: "Visible wall/field, moody but readable", auto: band(8, 145, 10) },
  },

  // ---- Signature mechanic: Adrenaline + Last Stand ------------------------
  {
    id: "adrenaline-surge-laststand",
    title: "Adrenaline reaches surge and a Last Stand spends the meter",
    category: "mechanic",
    logic: (s) => {
      const a = s.steps?.surge || {};
      const spent = !!a.adrenSpent || num(a.lastStands) >= 1;
      return { pass: a.zoneAtSurge === "surge" && spent, detail: `zone=${a.zoneAtSurge} spent=${a.adrenSpent} lastStands=${a.lastStands}` };
    },
    visual: { shot: "04-grenade.png", expect: "Last Stand shockwave reads on screen", auto: notBlack },
  },

  // ---- Boss encounter -----------------------------------------------------
  {
    id: "boss-encounter",
    title: "Finale boss spawns, stays alive, and shows its health bar",
    category: "mechanic",
    logic: (s) => {
      const b = s.steps?.boss || {};
      return { pass: !!b.bossAlive && !!b.barShown, detail: `alive=${b.bossAlive} bar=${b.barShown}` };
    },
    visual: { shot: "04b-boss.png", expect: "Boss silhouette + health bar", auto: notBlack },
  },

  // ---- Combat correctness: exploder chain credit --------------------------
  {
    id: "exploder-chain-credit",
    title: "Exploder splash credits chain kills (kills jump >=2) + chain badge",
    category: "correctness",
    logic: (s) => {
      const e = s.steps?.exploder || {};
      return { pass: num(e.killsDelta) >= 2 && !!e.chainBadge, detail: `killsDelta=${e.killsDelta} badge=${e.chainBadge}` };
    },
  },

  // ---- Day stealth render -------------------------------------------------
  {
    id: "day-stealth-renders",
    title: "Supply-run scene builds its props (>60 objects) and is shown",
    category: "render",
    logic: (s) => {
      const d = s.steps?.day || {};
      return { pass: num(d.dayObjects) > 60 && !!d.scavengeShown, detail: `objects=${d.dayObjects} shown=${d.scavengeShown}` };
    },
    visual: { shot: "06-day-scavenge.png", expect: "Top-down lot with walls/props/guards", auto: notBlack },
  },

  // ---- Inventory rule: 5-weapon cap --------------------------------------
  {
    id: "weapon-cap",
    title: "Armory never exceeds 5 weapons, and 8+ distinct weapons fire cleanly",
    category: "correctness",
    logic: (s) => {
      const w = s.steps?.weapons || {};
      const c = s.steps?.campaign || {};
      // The cap is a CAMPAIGN invariant (the dusk dilemma swaps instead of adding
      // a 6th gun), so assert the max armory observed across the real run — not a
      // count the probe itself inflated. The probe only proves 8+ defs fire.
      return { pass: num(c.maxWeapons) <= 5 && num(w.fired) >= 8, detail: `campaignMaxArmory=${c.maxWeapons} weaponsFired=${w.fired}` };
    },
  },

  // ---- A weapon comes ONLY from a collected weapon-case crate -------------
  {
    id: "weapon-from-crate",
    title: "New weapons come only from a collected weapon-case crate (not every run)",
    category: "correctness",
    logic: (s) => {
      const w = s.steps?.weaponCrate || {};
      return {
        pass: w.noCrateDelta === 0 && num(w.withCrateDelta) >= 1,
        detail: `no-case run grants +${w.noCrateDelta}, collected-case run grants +${w.withCrateDelta}`,
      };
    },
  },

  // ---- Campaign flow + both endings --------------------------------------
  {
    id: "campaign-victory-endings",
    title: "Campaign reaches victory and Haven's gate offers two endings",
    category: "flow",
    logic: (s) => {
      const c = s.steps?.campaign || {};
      return { pass: c.finalState === "victory" && num(c.endingChoices) >= 2, detail: `final=${c.finalState} endings=${c.endingChoices}` };
    },
    visual: { shot: "08-victory.png", expect: "Ending / victory screen", auto: notBlack },
  },

  // ---- Save/resume integrity ---------------------------------------------
  {
    id: "save-integrity",
    title: "A checkpoint is written at night start and cleared on victory",
    category: "flow",
    logic: (s) => {
      const c = s.steps?.campaign || {};
      const n = s.steps?.night || {};
      return { pass: !!n.saved && !!c.saveClearedOnWin, detail: `savedAtNight=${n.saved} clearedOnWin=${c.saveClearedOnWin}` };
    },
  },

  // ---- Balance: escalating curve + per-act enemy identities ---------------
  {
    id: "difficulty-curve",
    title: "Difficulty escalates monotonically and each act fights differently",
    category: "balance",
    logic: (s) => {
      const st = s.steps?.balance?.stats;
      if (!Array.isArray(st) || st.length < 9) return { pass: false, detail: `no curve data (${st?.length ?? 0})` };
      // (a) alive-cap + night length never decrease across the campaign, and the
      //     finale is meaningfully bigger than the opener.
      let monotonic = true;
      for (let i = 1; i < st.length; i++) {
        if (st[i].maxAlive < st[i - 1].maxAlive || st[i].len < st[i - 1].len) monotonic = false;
      }
      const grows = st[8].len > st[0].len && st[8].maxAlive >= st[0].maxAlive;
      const capped = st.every((x) => x.maxAlive <= 46); // fairness/perf clamp holds
      // (b) the three acts use distinct enemy mixes (identity, not just numbers).
      const lateOf = (act) => (st.find((x) => x.act === act)?.lateTypes || []).join(",");
      const a1 = lateOf(1), a2 = lateOf(2), a3 = lateOf(3);
      const distinctMixes = a1 && a2 && a3 && a1 !== a2 && a2 !== a3 && a1 !== a3;
      const pass = monotonic && grows && capped && distinctMixes;
      return {
        pass,
        detail: `monotonic=${monotonic} grows=${grows} capped=${capped} distinctActMixes=${distinctMixes} (n1 len=${st[0].len} cap=${st[0].maxAlive} → n9 len=${st[8].len} cap=${st[8].maxAlive})`,
      };
    },
  },

  // ---- Performance --------------------------------------------------------
  {
    id: "perf-no-hitch",
    title: "No large frame hitches with a full enemy load (max gap < 750ms)",
    category: "perf",
    logic: (s) => {
      const p = s.steps?.perf || {};
      const pass = num(p.frames) >= 60 && num(p.maxGap) < 750 && num(p.over250) <= 1;
      return { pass, detail: `frames=${p.frames} maxGap=${Math.round(num(p.maxGap))}ms over250=${p.over250}` };
    },
  },
];

export const GOAL_IDS = GOALS.map((g) => g.id);
