/* eslint-disable */
// =============================================================================
// Wall of Dead — unified visual / perf / scene-health diagnostic pass.
// =============================================================================
// The "look harder" companion to the smoke + QA loop. Boots the built game in
// the real Electron/Chromium renderer, cuts to every debug SCENARIO, and for
// each one captures FOUR kinds of objective evidence:
//
//   • a screenshot (saved full-res)                         → shots/<name>.png
//   • a luminance GRID (6×4 cells)                           → localized "black
//        regions" detection (a hole in the wall, a dropped post layer)
//   • renderStats()  — draw calls / triangles / resident GPU resources
//   • sceneAudit()   — NaN/negative-radius geometry, bad transforms, visible tris
//
// Then it produces the two things this harness was built to give Claude:
//
//   1) contact-sheet.png — every scene tiled into ONE labelled image, each cell
//      stamped with its draw-call / triangle cost and a red dot if it has a
//      scene-graph problem or a console error. One Read shows the whole slice.
//   2) REPORT.md + diagnostics.json — the structured evidence, plus a PERF
//      REGRESSION check against qa/perf-baseline.json (draw calls / triangles
//      climbing past a known-good baseline is flagged per scene).
//
//   npm run qa:diagnose                  # build + run, score vs baseline
//   DIAG_UPDATE_BASELINE=1 npm run qa:diagnose   # also (re)write the baseline
//   DIAG_DIR=qa/diagnostics electron qa/diagnose.cjs   # run against an existing dist/
// =============================================================================

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const outDir = path.resolve(process.env.DIAG_DIR || path.join(root, "qa", "diagnostics"));
const shotDir = path.join(outDir, "shots");
fs.mkdirSync(shotDir, { recursive: true });
const baselinePath = path.join(root, "qa", "perf-baseline.json");
const updateBaseline = process.env.DIAG_UPDATE_BASELINE === "1" || process.argv.includes("--baseline");

// A scene is flagged as a perf regression when it exceeds the baseline by more
// than this factor (plus a small absolute floor so tiny scenes aren't noisy).
const REG_FACTOR = 1.25;

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("No dist/ build found. Run `npm run build` first.");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};

let server;
function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/") p = "/index.html";
      fs.readFile(path.join(distDir, p), (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Per-pixel luminance: global mean/std + a cols×rows grid (localized darkness).
function lumStats(img, cols = 6, rows = 4) {
  const { width, height } = img.getSize();
  const bmp = img.getBitmap(); // BGRA, row-major
  let sum = 0, sq = 0, n = 0;
  const cells = Array.from({ length: rows * cols }, () => ({ sum: 0, n: 0 }));
  for (let y = 0; y < height; y += 4) {
    const cy = Math.min(rows - 1, Math.floor((y / height) * rows));
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const l = 0.114 * bmp[i] + 0.587 * bmp[i + 1] + 0.299 * bmp[i + 2];
      sum += l;
      sq += l * l;
      n++;
      const cx = Math.min(cols - 1, Math.floor((x / width) * cols));
      const c = cells[cy * cols + cx];
      c.sum += l;
      c.n++;
    }
  }
  const mean = n ? sum / n : 0;
  const std = Math.sqrt(Math.max(0, n ? sq / n - mean * mean : 0));
  const grid = cells.map((c) => +(c.sum / Math.max(1, c.n)).toFixed(1));
  return {
    mean: +mean.toFixed(2),
    std: +std.toFixed(2),
    w: width,
    h: height,
    cols,
    rows,
    grid,
    blackCells: grid.filter((m) => m < 2).length,
  };
}

function loadBaseline() {
  try {
    return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch {
    return null;
  }
}

// Compare one scene's render stats to its baseline; return the list of metrics
// that climbed past REG_FACTOR (with a small absolute floor to mute noise).
// Only the PER-FRAME metrics (calls/triangles) are checked: scenes run in
// sequence on one page, so the resident geometries/textures counts are
// order-dependent (cumulative) and belong to the leak probe, not per-scene
// regression flags.
function regressionsFor(name, stats, baseline) {
  if (!stats || !baseline || !baseline.scenes || !baseline.scenes[name]) return [];
  const base = baseline.scenes[name];
  // Absolute floors are sized above procedural run-to-run noise: the supply lots
  // are generated fresh each run and naturally swing ~±40 draw calls / ~±1k
  // triangles, so a real regression must clear BOTH the % factor and a floor
  // that noise can't reach. Heavy scenes still trip on the % alone.
  const checks = [
    ["calls", 100],
    ["triangles", 6000],
  ];
  const out = [];
  for (const [k, floor] of checks) {
    const cur = stats[k];
    const was = base[k];
    if (typeof cur !== "number" || typeof was !== "number") continue;
    if (cur > was * REG_FACTOR && cur - was > floor) {
      out.push(`${k} ${was}→${cur} (+${(((cur - was) / Math.max(1, was)) * 100).toFixed(0)}%)`);
    }
  }
  return out;
}

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    // Created hidden, then shown with showInactive() (below) so the window is
    // visible to the compositor — the rAF-driven game loop runs at full speed
    // (a never-shown window throttles requestAnimationFrame) — yet it never takes
    // OS focus or yanks the cursor away from the editor during a diagnose run.
    show: false,
    backgroundColor: "#05070a",
    webPreferences: { backgroundThrottling: false, offscreen: false },
  });
  win.showInactive();

  const errors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 3) errors.push("CONSOLE: " + message);
  });
  win.webContents.on("render-process-gone", (_e, d) => errors.push("RENDERER GONE: " + d.reason));
  win.webContents.on("unresponsive", () => errors.push("UNRESPONSIVE"));

  const js = (s) => win.webContents.executeJavaScript(s);
  const records = [];
  const cells = []; // contact-sheet inputs: { name, dataUrl, l1, l2, status }
  const baseline = loadBaseline();
  const newBaselineScenes = {};

  try {
    await win.loadURL(`http://127.0.0.1:${port}/`);
    await sleep(2500);
    await js(`localStorage.setItem('wod-played','1'); localStorage.removeItem('wod-save');`);

    const list = await js(`window.__wod.scenarios()`);
    console.log(`Diagnosing ${list.length} scenarios…`);

    for (const { name, desc } of list) {
      const errBefore = errors.length;
      try {
        await js(`window.__wod.scenario(${JSON.stringify(name)})`);
      } catch (e) {
        errors.push(`SCENARIO ${name}: ${(e && e.message) || e}`);
      }
      await sleep(1700); // let the scene + any opening banner settle

      const state = await js(`window.__wod.state()`).catch(() => "?");
      const stats = await js(`window.__wod.renderStats()`).catch(() => null);
      const audit = await js(`window.__wod.sceneAudit()`).catch(() => null);

      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(shotDir, `${name}.png`), img.toPNG());
      const lum = lumStats(img);

      const sceneErrors = errors.length - errBefore;
      const problems = audit ? audit.problems.length : 0;
      const regressions = regressionsFor(name, stats, baseline);
      if (stats) newBaselineScenes[name] = stats;

      records.push({ name, desc, state, lum, stats, audit, sceneErrors, regressions });

      // Contact-sheet cell (JPEG thumbnail keeps the in-page payload small).
      const thumb = img.resize({ width: 440 });
      const dataUrl = "data:image/jpeg;base64," + thumb.toJPEG(72).toString("base64");
      const tris = stats ? (stats.triangles >= 1000 ? (stats.triangles / 1000).toFixed(0) + "k" : String(stats.triangles)) : "?";
      // blackCells fires only on a LARGE dark region (>6 of 24 grid cells) — a
      // real rendering hole — not the normal dark periphery of a stealth lot.
      const bigBlack = lum.blackCells > 6;
      const status =
        sceneErrors > 0 || problems > 0 ? "bad" : regressions.length || bigBlack ? "warn" : "ok";
      cells.push({
        name,
        dataUrl,
        l1: `${name}  ·  ${state}`,
        l2: `${stats ? stats.calls : "?"} draws · ${tris} tris${problems ? ` · ⚠${problems}` : ""}${sceneErrors ? ` · ✖${sceneErrors}` : ""}`,
        status,
      });

      const flags = [
        sceneErrors ? `${sceneErrors} err` : "",
        problems ? `${problems} scene-problem(s)` : "",
        regressions.length ? `regressed: ${regressions.join(", ")}` : "",
        bigBlack ? `${lum.blackCells} black grid cells` : "",
      ].filter(Boolean);
      console.log(
        `  ${status === "ok" ? "OK  " : status === "warn" ? "WARN" : "FAIL"} ${name.padEnd(16)} ` +
          `${stats ? String(stats.calls).padStart(4) : "   ?"} draws  ${String(stats ? stats.triangles : "?").padStart(7)} tris` +
          (flags.length ? `  — ${flags.join("; ")}` : "")
      );
    }

    // --- Leak probe: re-enter ONE night scene repeatedly --------------------
    // Pooling should make resident geometry plateau. A steady climb across
    // identical re-entries is a per-entry dispose leak (the kind a single
    // playthrough hides). Ignore the first two entries (first-time creation).
    console.log("\nLeak probe (re-entering night-act1)…");
    const leakSeries = [];
    for (let i = 0; i < 6; i++) {
      await js(`window.__wod.scenario('night-act1')`).catch(() => {});
      await sleep(450);
      const rs = await js(`window.__wod.renderStats()`).catch(() => null);
      leakSeries.push(rs ? rs.geometries : -1);
    }
    const warm = leakSeries.slice(2).filter((n) => n >= 0);
    const grew = warm.length ? warm[warm.length - 1] - warm[0] : 0;
    const leak = { series: leakSeries, grewAfterWarmup: grew, leaked: grew > 30 };
    if (leak.leaked) errors.push(`LEAK: resident geometries climbed +${grew} across identical re-entries (${leakSeries.join("→")})`);
    console.log(`  geometries ${leakSeries.join(" → ")}  (Δ after warmup ${grew}, ${leak.leaked ? "LEAK" : "stable"})`);

    // --- Composite the contact sheet in-page (canvas), write it out ----------
    console.log("\nBuilding contact sheet…");
    const summary = {
      scenarios: records.length,
      problems: records.reduce((a, r) => a + (r.audit ? r.audit.problems.length : 0), 0),
      errors: errors.length,
      regressed: records.filter((r) => r.regressions.length).map((r) => r.name),
      leaked: leak.leaked,
    };
    const sheetDataUrl = await js(
      `(${buildSheetInPage.toString()})(${JSON.stringify(cells)}, ${JSON.stringify(summary)})`
    );
    if (typeof sheetDataUrl === "string" && sheetDataUrl.startsWith("data:image/png")) {
      const b64 = sheetDataUrl.slice(sheetDataUrl.indexOf(",") + 1);
      fs.writeFileSync(path.join(outDir, "contact-sheet.png"), Buffer.from(b64, "base64"));
      console.log("  wrote contact-sheet.png");
    } else {
      errors.push("CONTACT SHEET: page compositor returned no image");
    }

    // --- Baseline write / report --------------------------------------------
    const baselineExisted = !!baseline;
    if (updateBaseline || !baselineExisted) {
      fs.writeFileSync(
        baselinePath,
        JSON.stringify({ ts: new Date().toISOString().slice(0, 10), regFactor: REG_FACTOR, scenes: newBaselineScenes }, null, 2)
      );
      console.log(`  ${baselineExisted ? "updated" : "created"} perf-baseline.json`);
    }

    const diag = { ts: Date.now(), summary, errors, records, leak, baselineExisted };
    fs.writeFileSync(path.join(outDir, "diagnostics.json"), JSON.stringify(diag, null, 2));
    fs.writeFileSync(path.join(outDir, "REPORT.md"), renderReport(diag, baselineExisted, updateBaseline));
    console.log("  wrote diagnostics.json + REPORT.md");

    console.log(
      `\n${summary.problems === 0 && errors.length === 0 ? "CLEAN" : "ISSUES"} — ` +
        `${records.length} scenes, ${summary.problems} scene-problems, ${errors.length} errors, ` +
        `${summary.regressed.length} perf regressions${summary.regressed.length ? ` (${summary.regressed.join(", ")})` : ""}.`
    );
  } catch (e) {
    errors.push("EXCEPTION: " + ((e && e.message) || e));
    console.log("EXCEPTION:", (e && e.message) || e);
  }

  try {
    server.close();
  } catch (_) {}
  win.destroy();
  // Non-zero exit only on UNAMBIGUOUS bugs — console/runtime errors (which
  // include the leak probe), or scene-graph problems (NaN/negative-radius
  // geometry, bad transforms). Perf regressions are REPORTED (contact-sheet
  // WARN border + REPORT.md) but don't hard-fail: a draw-call bump can be an
  // intended content change and needs a human/AI call, not a red CI build.
  const fail = errors.length > 0 || records.some((r) => r.audit && r.audit.problems.length);
  app.exit(fail ? 1 : 0);
});

// ---------------------------------------------------------------------------
// Runs INSIDE the page (serialized via .toString()). Tiles every scene's
// thumbnail into one labelled PNG and returns it as a data URL.
// ---------------------------------------------------------------------------
function buildSheetInPage(cells, summary) {
  return new Promise((resolve) => {
    const COLS = 4;
    const CW = 440;
    const CH = Math.round((CW * 9) / 16); // 248
    const LABEL = 48;
    const PAD = 12;
    const HEADER = 86;
    const rows = Math.ceil(cells.length / COLS);
    const W = PAD + COLS * (CW + PAD);
    const H = HEADER + rows * (CH + LABEL + PAD) + PAD;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d");
    g.fillStyle = "#0a0d12";
    g.fillRect(0, 0, W, H);

    // Header
    g.fillStyle = "#e8eef5";
    g.font = "700 30px Oswald, sans-serif";
    g.fillText("WALL OF DEAD — Diagnostic Contact Sheet", PAD + 2, 40);
    g.font = "500 18px Rajdhani, sans-serif";
    const ok = summary.problems === 0 && summary.errors === 0 && summary.regressed.length === 0;
    g.fillStyle = ok ? "#6fe08a" : "#ff9a55";
    g.fillText(
      `${summary.scenarios} scenes · ${summary.problems} scene-problems · ${summary.errors} errors · ` +
        `${summary.regressed.length} perf regressions${summary.regressed.length ? " (" + summary.regressed.join(", ") + ")" : ""}`,
      PAD + 2,
      68
    );
    g.fillStyle = "#7a8696";
    g.font = "400 14px Rajdhani, sans-serif";
    g.fillText(new Date().toISOString(), PAD + 2, 84);

    const load = (url) =>
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = url;
      });

    Promise.all(cells.map((c) => load(c.dataUrl))).then((imgs) => {
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const col = i % COLS;
        const rowi = Math.floor(i / COLS);
        const x = PAD + col * (CW + PAD);
        const y = HEADER + rowi * (CH + LABEL + PAD);
        // image
        g.fillStyle = "#000";
        g.fillRect(x, y, CW, CH);
        if (imgs[i]) g.drawImage(imgs[i], x, y, CW, CH);
        // border keyed to status
        g.strokeStyle = c.status === "bad" ? "#ff5252" : c.status === "warn" ? "#ffb455" : "#2f3a46";
        g.lineWidth = c.status === "ok" ? 1 : 3;
        g.strokeRect(x + 0.5, y + 0.5, CW - 1, CH - 1);
        // label strip
        g.fillStyle = "#11161d";
        g.fillRect(x, y + CH, CW, LABEL);
        // status dot
        g.fillStyle = c.status === "bad" ? "#ff5252" : c.status === "warn" ? "#ffb455" : "#6fe08a";
        g.beginPath();
        g.arc(x + 12, y + CH + 16, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#e8eef5";
        g.font = "600 16px Oswald, sans-serif";
        g.fillText(c.l1, x + 26, y + CH + 21);
        g.fillStyle = "#9fb0c2";
        g.font = "500 14px Rajdhani, sans-serif";
        g.fillText(c.l2, x + 10, y + CH + 40);
      }
      resolve(canvas.toDataURL("image/png"));
    });
  });
}

// ---------------------------------------------------------------------------
// Markdown report (Node side).
// ---------------------------------------------------------------------------
function renderReport(diag, baselineExisted, updatedBaseline) {
  const L = [];
  const s = diag.summary;
  const ok = s.problems === 0 && s.errors === 0 && s.regressed.length === 0 && !s.leaked;
  L.push(`# Wall of Dead — Diagnostics ${ok ? "✅" : "⚠️"}`);
  L.push("");
  L.push(`_Generated ${new Date(diag.ts).toISOString()}_`);
  L.push("");
  L.push(
    `**${s.scenarios} scenes** · **${s.problems}** scene-graph problems · **${s.errors}** console/runtime errors · **${s.regressed.length}** perf regressions`
  );
  if (!baselineExisted) L.push(`\n> No perf baseline existed — one was just written to \`qa/perf-baseline.json\`. Commit it so future runs can flag regressions.`);
  else if (updatedBaseline) L.push(`\n> Perf baseline was refreshed this run (\`DIAG_UPDATE_BASELINE=1\`).`);
  L.push("");
  L.push("## Contact sheet");
  L.push("");
  L.push("![contact sheet](contact-sheet.png)");
  L.push("");

  // Per-scene table.
  L.push("## Per-scene render cost & health");
  L.push("");
  L.push("| Scene | State | Draws | Tris | Geoms | Tex | VisMesh | BlackCells | Problems | Regression |");
  L.push("|---|---|--:|--:|--:|--:|--:|--:|---|---|");
  for (const r of diag.records) {
    const st = r.stats || {};
    const a = r.audit || {};
    const prob = a.problems && a.problems.length ? `⚠️ ${a.problems.length}` : "—";
    const reg = r.regressions.length ? "🔺 " + r.regressions.join("; ") : "—";
    L.push(
      `| ${r.name} | ${r.state} | ${st.calls ?? "?"} | ${st.triangles ?? "?"} | ${st.geometries ?? "?"} | ${st.textures ?? "?"} | ${a.visibleMeshes ?? "?"} | ${r.lum.blackCells} | ${prob} | ${reg} |`
    );
  }
  L.push("");

  // Scene-graph problems detail (the bugs).
  const withProblems = diag.records.filter((r) => r.audit && r.audit.problems.length);
  L.push("## Scene-graph problems");
  L.push("");
  if (!withProblems.length) {
    L.push("None — no NaN/negative-radius geometry or bad transforms in any scene. 🎯");
  } else {
    for (const r of withProblems) {
      L.push(`- **${r.name}** (${r.audit.problems.length}):`);
      for (const p of r.audit.problems.slice(0, 12)) L.push(`  - \`${p.kind}\` — ${p.object}: ${p.detail}`);
    }
  }
  L.push("");

  // Errors.
  L.push("## Console / runtime errors");
  L.push("");
  if (!diag.errors.length) L.push("None. 🎯");
  else for (const e of diag.errors.slice(0, 30)) L.push("- `" + String(e).slice(0, 240) + "`");
  L.push("");

  // Leak probe.
  L.push("## Resident-geometry leak probe");
  L.push("");
  if (diag.leak) {
    L.push(
      `Re-entered \`night-act1\` ${diag.leak.series.length}× — resident geometries: ` +
        `\`${diag.leak.series.join(" → ")}\` · Δ after warmup **${diag.leak.grewAfterWarmup}** · ` +
        `${diag.leak.leaked ? "🔺 **LEAK** (climbed past +30 — meshes not being pooled/disposed on re-entry)" : "✅ stable (pooling holds)"}`
    );
  } else {
    L.push("_not run_");
  }
  L.push("");

  // Perf leaders (optimization targets).
  const byCalls = [...diag.records].filter((r) => r.stats).sort((a, b) => b.stats.calls - a.stats.calls);
  const byTris = [...diag.records].filter((r) => r.stats).sort((a, b) => b.stats.triangles - a.stats.triangles);
  L.push("## Heaviest scenes (optimization targets)");
  L.push("");
  L.push("**By draw calls:** " + byCalls.slice(0, 5).map((r) => `${r.name} (${r.stats.calls})`).join(", "));
  L.push("");
  L.push("**By triangles:** " + byTris.slice(0, 5).map((r) => `${r.name} (${r.stats.triangles.toLocaleString()})`).join(", "));
  L.push("");

  return L.join("\n");
}
