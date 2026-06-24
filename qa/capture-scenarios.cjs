/* eslint-disable */
// Scenario capture: drives the in-game DEBUG SCENARIO system (window.__wod.scenario)
// to cut straight to each defined scenario and screenshot it. This is how
// automated tests jump to a specific moment (an act's night, a boss fight, a
// supply run, the dawn dilemma, an ending, defeat) and see how it looks.
//
//   SCEN_DIR=qa/scenarios/run electron qa/capture-scenarios.cjs   (needs dist/)
//
// Exits non-zero if any scenario throws / logs a console error.

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const outDir = path.resolve(process.env.SCEN_DIR || path.join(root, "qa", "scenarios", "run"));
fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("No dist/ build. Run `npm run build` first.");
  process.exit(1);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg" };
let server;
const startServer = () =>
  new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/") p = "/index.html";
      fs.readFile(path.join(distDir, p), (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({ width: 1600, height: 900, show: false, backgroundColor: "#05070a", webPreferences: { backgroundThrottling: false, offscreen: false } });
  win.showInactive(); // visible to the compositor (no rAF throttle) but never steals OS focus/cursor
  const js = (s) => win.webContents.executeJavaScript(s);
  win.webContents.on("console-message", (_e, level, message) => { if (level >= 3) errors.push("CONSOLE: " + message); });
  win.webContents.on("render-process-gone", (_e, d) => errors.push("RENDERER GONE: " + d.reason));

  async function shot(name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name), img.toPNG());
    console.log("  shot:", name);
  }

  const result = { scenarios: [], errors };
  try {
    await win.loadURL(`http://127.0.0.1:${port}/`);
    await sleep(2500);
    await js(`localStorage.setItem('wod-played','1'); localStorage.removeItem('wod-save');`);

    const list = await js(`window.__wod.scenarios()`);
    console.log(`Driving ${list.length} debug scenarios…`);
    for (const { name, desc } of list) {
      const before = errors.length;
      let appliedDesc = "";
      try {
        appliedDesc = await js(`window.__wod.scenario(${JSON.stringify(name)})`);
      } catch (e) {
        errors.push(`SCENARIO ${name}: threw ${(e && e.message) || e}`);
      }
      await sleep(1900); // let the scene/menus settle + opening banners fade
      const state = await js(`window.__wod.state()`).catch(() => "?");
      await shot(`scenario-${name}.png`);
      const ok = errors.length === before && appliedDesc !== `unknown scenario: ${name}`;
      result.scenarios.push({ name, desc, appliedDesc, state, ok });
      console.log(`  ${ok ? "OK" : "FAIL"} ${name} → state=${state} (${desc})`);
    }
  } catch (e) {
    errors.push("EXCEPTION: " + ((e && e.message) || e));
  }

  fs.writeFileSync(path.join(outDir, "scenarios.json"), JSON.stringify(result, null, 2));
  console.log(errors.length ? `\nERRORS (${errors.length}):\n` + errors.slice(0, 20).join("\n") : "\nALL SCENARIOS OK — no errors.");
  try { server.close(); } catch (_) {}
  win.destroy();
  app.exit(errors.length ? 1 : 0);
});
