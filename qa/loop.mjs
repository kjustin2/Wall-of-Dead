// =============================================================================
// Wall of Dead — closed-loop orchestrator (one measurement cycle).
// =============================================================================
// Ties the deterministic half of the improvement loop together:
//
//   build  ->  capture (screenshots + state)  ->  check (goals)  ->  report
//
// The "observe + implement" half is performed by the AI/human between runs:
// read qa/cycles/<n>/report.md (it embeds the screenshots + remaining gaps),
// make code changes, then run this again. The cycle counter, history, and
// per-cycle artifacts are persisted so the loop is safe to stop and resume.
//
//   npm run qa:cycle              # run the next cycle
//   QA_MAX_CYCLES=20 npm run qa:cycle
//
// Exit codes: 0 = all goals met · 2 = gaps remain · 3 = budget reached ·
//             1 = infrastructure failure (build/capture).
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { evaluate } from "./check.mjs";
import { renderReport } from "./report.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const qaDir = __dirname;
const cyclesDir = path.join(qaDir, "cycles");
const progressPath = path.join(qaDir, "progress.json");
fs.mkdirSync(cyclesDir, { recursive: true });

const MAX_CYCLES = Number(process.env.QA_MAX_CYCLES || 20);
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function loadProgress() {
  if (fs.existsSync(progressPath)) {
    try {
      return JSON.parse(fs.readFileSync(progressPath, "utf8"));
    } catch {
      /* fall through to fresh */
    }
  }
  return { goal: "Self-improve Wall of Dead until all QA goals pass", cycles: [] };
}

function saveProgress(p) {
  const tmp = progressPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2));
  fs.renameSync(tmp, progressPath);
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", ...opts });
}

function gitDiffStat() {
  const r = spawnSync("git", ["diff", "--stat", "HEAD"], { cwd: root, encoding: "utf8" });
  return (r.stdout || "") + (r.stderr || "");
}

// ---- main -------------------------------------------------------------------
const progress = loadProgress();
const last = progress.cycles[progress.cycles.length - 1];
const cycle = (last?.cycle || 0) + 1;

if (cycle > MAX_CYCLES) {
  console.error(`\n⛔ Budget reached: ${MAX_CYCLES} cycles already run. Raise QA_MAX_CYCLES to continue.`);
  process.exit(3);
}

const cycleDir = path.join(cyclesDir, String(cycle));
fs.mkdirSync(path.join(cycleDir, "shots"), { recursive: true });
console.log(`\n=== QA cycle ${cycle} (budget ${MAX_CYCLES}) → ${path.relative(root, cycleDir)} ===\n`);

const record = { cycle, ts: Date.now(), buildOk: false, captureOk: false, met: 0, total: 0, allMet: false, failed: [] };

// 1) BUILD ---------------------------------------------------------------------
console.log("→ build (tsc --noEmit && vite build)…");
const build = sh(npmCmd, ["run", "build"]);
record.buildOk = build.status === 0;
if (!record.buildOk) {
  const md =
    `# QA Cycle ${cycle} — BUILD FAILED ❌\n\n` +
    `The build gate failed, so no playthrough was captured. Fix the type/build error and re-run.\n\n` +
    `Exit code: ${build.status}\n`;
  fs.writeFileSync(path.join(cycleDir, "report.md"), md);
  fs.writeFileSync(path.join(qaDir, "LATEST.md"), md);
  progress.cycles.push(record);
  saveProgress(progress);
  console.error("\n❌ Build failed — see output above. Cycle recorded, no capture run.");
  process.exit(1);
}

// 2) CAPTURE -------------------------------------------------------------------
console.log("\n→ capture (real-renderer playthrough)…");
const electronPath = require("electron"); // path to the electron binary
const cap = spawnSync(electronPath, [path.join(qaDir, "capture.cjs")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, CYCLE_DIR: cycleDir },
  timeout: 5 * 60 * 1000,
});
const snapPath = path.join(cycleDir, "snapshots.json");
record.captureOk = cap.status === 0 && fs.existsSync(snapPath);

const snap = fs.existsSync(snapPath)
  ? JSON.parse(fs.readFileSync(snapPath, "utf8"))
  : { errors: ["capture produced no snapshots.json (harness crashed/timed out)"], shots: {}, steps: {} };

// 3) CHECK ---------------------------------------------------------------------
console.log("\n→ check (evaluate goals)…");
const results = evaluate(snap);
fs.writeFileSync(path.join(cycleDir, "results.json"), JSON.stringify(results, null, 2));
record.met = results.summary.met;
record.total = results.summary.total;
record.allMet = results.summary.allMet;
record.failed = results.goals.filter((g) => !g.met).map((g) => g.id);

// 4) REPORT --------------------------------------------------------------------
console.log("→ report…");
const changes = gitDiffStat();
fs.writeFileSync(path.join(cycleDir, "changes.txt"), changes);
const prev = last
  ? { cycle: last.cycle, met: last.met, total: last.total, metIds: last.metIds || [] }
  : null;
const md = renderReport({ cycle, ts: record.ts, results, changes, snap, prev });
fs.writeFileSync(path.join(cycleDir, "report.md"), md);
fs.writeFileSync(path.join(qaDir, "LATEST.md"), md);

record.metIds = results.goals.filter((g) => g.met).map((g) => g.id);
progress.cycles.push(record);
saveProgress(progress);

// 5) DECIDE --------------------------------------------------------------------
console.log("\n────────────────────────────────────────────────────");
for (const g of results.goals) console.log(`${g.met ? "✅" : "❌"} ${g.id} — ${g.title}`);
console.log("────────────────────────────────────────────────────");
console.log(`Cycle ${cycle}: ${results.summary.met}/${results.summary.total} goals met.`);
console.log(`Report: ${path.relative(root, path.join(cycleDir, "report.md"))}  (also qa/LATEST.md)`);

if (!record.captureOk) {
  console.error("\n⚠️  Capture did not complete cleanly — results may be partial.");
}
if (results.summary.allMet) {
  console.log("\n🎯 ALL GOALS MET. Loop complete.");
  process.exit(0);
} else {
  console.log(`\n↻ Gaps remain (${record.failed.join(", ")}). Implement fixes, then run \`npm run qa:cycle\` again.`);
  process.exit(2);
}
