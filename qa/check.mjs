// =============================================================================
// Wall of Dead — logic checker.
// =============================================================================
// Evaluates the GOALS registry against a capture's snapshots.json and produces
// a results object: per-goal logic + visual signals and an overall met/total.
// A goal is MET only when every signal it declares passes.
//
// Used in-process by qa/loop.mjs (import { evaluate }) and as a CLI:
//   node qa/check.mjs qa/cycles/3
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { GOALS } from "./goals.mjs";

export function evaluate(snap) {
  const goals = GOALS.map((g) => {
    const res = { id: g.id, title: g.title, category: g.category, signals: {} };

    if (g.logic) {
      try {
        const r = g.logic(snap) || {};
        res.signals.logic = { pass: !!r.pass, detail: r.detail || "", value: r.value };
      } catch (e) {
        res.signals.logic = { pass: false, detail: "logic threw: " + ((e && e.message) || e) };
      }
    }

    if (g.visual) {
      const st = snap.shots?.[g.visual.shot];
      let pass = false;
      let detail;
      try {
        pass = !!g.visual.auto(st);
        detail = st
          ? `${g.visual.shot} mean=${st.mean} std=${st.std}`
          : `missing shot ${g.visual.shot}`;
      } catch (e) {
        detail = "visual threw: " + ((e && e.message) || e);
      }
      res.signals.visual = { pass, detail, shot: g.visual.shot, expect: g.visual.expect };
    }

    res.met = Object.values(res.signals).every((sig) => sig.pass);
    return res;
  });

  const met = goals.filter((g) => g.met).length;
  return {
    ts: Date.now(),
    summary: { met, total: goals.length, allMet: met === goals.length },
    goals,
  };
}

// ---- CLI --------------------------------------------------------------------
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("qa/check.mjs")) {
  const dir = process.argv[2] || process.env.CYCLE_DIR;
  if (!dir) {
    console.error("usage: node qa/check.mjs <cycleDir>");
    process.exit(1);
  }
  const snapPath = path.join(dir, "snapshots.json");
  if (!fs.existsSync(snapPath)) {
    console.error("no snapshots.json in " + dir);
    process.exit(1);
  }
  const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
  const results = evaluate(snap);
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 2));
  for (const g of results.goals) {
    const sig = Object.entries(g.signals)
      .map(([k, v]) => `${k}:${v.pass ? "PASS" : "FAIL"}`)
      .join(" ");
    console.log(`${g.met ? "✅" : "❌"} ${g.id}  [${sig}]`);
  }
  console.log(`\n${results.summary.met}/${results.summary.total} goals met` + (results.summary.allMet ? " — ALL MET" : ""));
  process.exit(results.summary.allMet ? 0 : 2);
}
