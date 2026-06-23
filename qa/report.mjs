// =============================================================================
// Wall of Dead — per-cycle report generator.
// =============================================================================
// Renders a traceable markdown report for one cycle: the goal scoreboard (both
// signals), an embedded screenshot gallery (the visual source of truth), the
// code changes made this cycle, and an explicit "Remaining gaps" list to drive
// the next iteration.
//
// Used in-process by qa/loop.mjs (import { renderReport }).
// =============================================================================

const tick = (b) => (b ? "✅" : "❌");

function signalCell(sig) {
  if (!sig) return "—";
  return `${tick(sig.pass)} ${sig.detail || ""}`.trim();
}

export function renderReport({ cycle, ts, results, changes, snap, prev }) {
  const when = new Date(ts || Date.now()).toISOString();
  const { met, total, allMet } = results.summary;
  const lines = [];

  lines.push(`# QA Cycle ${cycle} — ${met}/${total} goals met${allMet ? " ✅ ALL MET" : ""}`);
  lines.push("");
  lines.push(`_Generated ${when}_`);
  lines.push("");

  // Delta vs previous cycle.
  if (prev) {
    const newlyMet = results.goals.filter((g) => g.met && !prev.metIds.includes(g.id)).map((g) => g.id);
    const regressed = results.goals.filter((g) => !g.met && prev.metIds.includes(g.id)).map((g) => g.id);
    lines.push(
      `**Since cycle ${prev.cycle}:** ` +
        `${prev.met}/${prev.total} → ${met}/${total}` +
        (newlyMet.length ? ` · newly met: ${newlyMet.join(", ")}` : "") +
        (regressed.length ? ` · ⚠️ REGRESSED: ${regressed.join(", ")}` : "")
    );
    lines.push("");
  }

  // Scoreboard.
  lines.push("## Goal scoreboard");
  lines.push("");
  lines.push("| | Goal | Category | Logic | Visual |");
  lines.push("|---|---|---|---|---|");
  for (const g of results.goals) {
    lines.push(
      `| ${tick(g.met)} | ${g.title} | ${g.category} | ${signalCell(g.signals.logic)} | ${signalCell(g.signals.visual)} |`
    );
  }
  lines.push("");

  // Remaining gaps (the next cycle's work-list).
  const gaps = results.goals.filter((g) => !g.met);
  lines.push("## Remaining gaps");
  lines.push("");
  if (!gaps.length) {
    lines.push("None — every goal's logical assertion and screenshot evidence pass. 🎯");
  } else {
    for (const g of gaps) {
      const failing = Object.entries(g.signals)
        .filter(([, v]) => !v.pass)
        .map(([k, v]) => `**${k}** — ${v.detail || "failed"}${v.expect ? ` (want: ${v.expect})` : ""}`);
      lines.push(`- **${g.id}**: ${g.title}`);
      for (const f of failing) lines.push(`  - ${f}`);
      const lv = g.signals.logic?.value;
      if (lv && Array.isArray(lv) && lv.length) lines.push("  - sample: `" + JSON.stringify(lv).slice(0, 300) + "`");
    }
  }
  lines.push("");

  // Screenshot gallery — the visual source of truth, for AI/human review.
  lines.push("## Screenshots (visual source of truth)");
  lines.push("");
  const shotNames = Object.keys(snap.shots || {});
  if (!shotNames.length) {
    lines.push("_No screenshots captured (capture step failed — see errors)._");
  } else {
    for (const name of shotNames) {
      const st = snap.shots[name];
      lines.push(`### ${name}`);
      lines.push(`luminance mean=${st.mean} std=${st.std} (${st.w}×${st.h})`);
      lines.push("");
      lines.push(`![${name}](shots/${name})`);
      lines.push("");
    }
  }

  // Captured state dump (compact) for traceability.
  lines.push("## Captured state");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify({ errors: (snap.errors || []).slice(0, 12), steps: snap.steps }, null, 2));
  lines.push("```");
  lines.push("");

  // Code changes this cycle.
  lines.push("## Code changes this cycle (git diff --stat)");
  lines.push("");
  lines.push("```");
  lines.push((changes || "").trim() || "(no changes recorded)");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
