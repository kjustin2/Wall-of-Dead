/* eslint-disable */
// Supply-run interior diagnostic: cut to each supply scenario, drop the avatar
// deep into the lot (where the detail + new crate beacons + sweep light live),
// let FX settle, and screenshot the actual top-down play view.
const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const outDir = path.join(root, "qa", "scenarios", "supplydiag");
fs.mkdirSync(outDir, { recursive: true });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg" };
let server;
const startServer = () => new Promise((resolve) => {
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

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({ width: 1600, height: 900, show: false, backgroundColor: "#05070a", webPreferences: { backgroundThrottling: false, offscreen: false } });
  win.showInactive(); // visible to the compositor (no rAF throttle) but never steals OS focus/cursor
  const js = (s) => win.webContents.executeJavaScript(s);
  const errors = [];
  win.webContents.on("console-message", (_e, level, message) => { if (level >= 3) errors.push("CONSOLE: " + message); });
  async function shot(name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name), img.toPNG());
    console.log("  shot", name);
  }
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await sleep(2500);
  await js(`localStorage.setItem('wod-played','1'); localStorage.removeItem('wod-save');`);

  for (const [name, x, z] of [["supply-outer", 0, -40], ["supply-flood", 0, -38], ["supply-haven", 0, -36]]) {
    await js(`window.__wod.scenario(${JSON.stringify(name)})`);
    // Drop the avatar deep into the lot so the camera frames the interior detail.
    await js(`window.__wod.scavengeTeleport(${x}, ${z})`);
    // Wait out the opening banner (2.6s) so it doesn't cover the frame.
    await sleep(3600);
    await js(`window.__wod.scavengeTeleport(${x}, ${z})`);
    await sleep(700);
    await shot(`${name}-interior.png`);
  }
  console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
  try { server.close(); } catch (_) {}
  win.destroy();
  app.exit(0);
});
