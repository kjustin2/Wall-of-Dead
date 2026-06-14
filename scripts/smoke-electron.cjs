/* eslint-disable */
// Real-renderer smoke test. Boots the built game in an Electron/Chromium window
// (the actual WebGL renderer — the only thing that catches shader/geometry bugs
// the way the project's prior Canvas2D mock could not), drives the full slice
// title → night → day → victory, captures every uncaught/console error, and
// screenshots each scene to shots/. Run: npm run smoke  (after npm run build).
//
// Uses Electron's bundled Chromium, so there is no Playwright browser download.

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
const shotDir = path.join(__dirname, "..", "shots");
fs.mkdirSync(shotDir, { recursive: true });

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
};

let server;
function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = path.join(distDir, p);
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(shotDir, name), img.toPNG());
  console.log("  shot:", name);
}

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    show: true,
    backgroundColor: "#05070a",
    webPreferences: { backgroundThrottling: false, offscreen: false },
  });

  win.webContents.on("console-message", (_e, level, message) => {
    // level 3 = error
    if (level >= 3) errors.push("CONSOLE: " + message);
  });
  win.webContents.on("render-process-gone", (_e, d) => errors.push("RENDERER GONE: " + d.reason));
  win.webContents.on("unresponsive", () => errors.push("UNRESPONSIVE"));

  const run = async () => {
    try {
      await win.loadURL(`http://127.0.0.1:${port}/`);
      await sleep(2500);
      await shot(win, "01-title.png");

      // Begin run → opening cutscene
      await win.webContents.executeJavaScript(`document.querySelector('.act-start').click()`);
      await sleep(1800);
      await shot(win, "02-cutscene.png");

      // Skip the story → night
      await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`);
      await sleep(1400);
      const ns = await win.webContents.executeJavaScript(`window.__wod.state()`);
      if (ns !== "night") errors.push("FLOW: expected night after cutscene, got " + ns);

      // Let a wave build, then force some action
      await win.webContents.executeJavaScript(`window.__wod.spawnWave('shambler', 8); window.__wod.spawnWave('runner', 4); window.__wod.spawnWave('brute', 1); window.__wod.spawnWave('spitter', 2);`);
      await sleep(3500);
      await shot(win, "03-night-action.png");

      // Charge + trigger a Last Stand
      await win.webContents.executeJavaScript(`window.__wod.ctx.adrenaline.gain(100); window.__wod.lastStand();`);
      await sleep(900);
      await shot(win, "04-last-stand.png");

      // Skip to dawn → report
      await win.webContents.executeJavaScript(`window.__wod.forceDawn();`);
      await sleep(1800);
      await shot(win, "05-day-report.png");

      // Start the supply run
      const started = await win.webContents.executeJavaScript(
        `(()=>{const b=document.querySelector('.act-start'); if(b){b.click(); return true;} return false;})()`
      );
      if (!started) errors.push("FLOW: no Supply Run button on report");
      await sleep(2000);
      await shot(win, "06-day-scavenge.png");

      // Complete the day → loot
      await win.webContents.executeJavaScript(`window.__wod.completeDay();`);
      await sleep(1200);
      await shot(win, "07-day-loot.png");

      // Continue → victory (slice ends after one cycle)
      await win.webContents.executeJavaScript(
        `(()=>{const b=document.querySelector('.act-cont'); if(b) b.click();})()`
      );
      await sleep(1500);
      const finalState = await win.webContents.executeJavaScript(`window.__wod.state()`);
      await shot(win, "08-victory.png");
      if (finalState !== "victory") errors.push("FLOW: expected victory, got " + finalState);
      console.log("  final state:", finalState);
    } catch (e) {
      errors.push("EXCEPTION: " + (e && e.message ? e.message : String(e)));
    }
  };

  await run();

  console.log(
    errors.length ? `\nERRORS (${errors.length}):\n` + errors.slice(0, 20).join("\n") : "\nNO ERRORS — slice rendered & reached victory."
  );
  try {
    server.close();
  } catch (_) {}
  win.destroy();
  app.exit(errors.length ? 1 : 0);
});
