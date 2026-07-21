/* eslint-disable */
// Supply-run "feel" capture: frames the NEW in-run feedback — the objective
// chevron (amber → green) that leads you through the dark, the close-call pips,
// and the survivable-grab setback. Also runs sceneAudit so a bad-geometry arrow
// (the black-screen bug class) can't slip through.
const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const outDir = path.join(root, "qa", "scenarios", "supplyfeel");
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
  win.showInactive();
  const js = (s) => win.webContents.executeJavaScript(s);
  const errors = [];
  win.webContents.on("console-message", (_e, level, message) => { if (level >= 3) errors.push("CONSOLE: " + message); });
  async function shot(name, rect) {
    let img = await win.webContents.capturePage();
    if (rect) img = img.crop(rect);
    fs.writeFileSync(path.join(outDir, name), img.toPNG());
    console.log("  shot", name);
  }
  // Camera follows the avatar, so it sits near screen center (800,450). Crop a
  // window around it to read the in-world objective chevron; crop the top strip
  // to read the HUD pips.
  const CENTER = { x: 470, y: 200, width: 660, height: 520 };
  const HUDTOP = { x: 540, y: 18, width: 520, height: 210 };
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await sleep(2500);
  await js(`localStorage.setItem('wod-played','1'); localStorage.removeItem('wod-save');`);

  // 1) Lead frame — objective chevron + intact close-call pips, near the entrance
  // strip (guard-light, so the alarm doesn't wash the frame and we can read the arrow).
  await js(`window.__wod.scenario('supply-outer')`);
  await js(`window.__wod.scavengeTeleport(-4, -12)`);
  await sleep(3600); // wait out the opening banner
  await js(`window.__wod.scavengeTeleport(-4, -12)`);
  await sleep(900);
  await shot(`01-full.png`);
  await shot(`01-objective-arrow.png`, CENTER);
  await shot(`01-pips-intact.png`, HUDTOP);
  const audit1 = await js(`JSON.stringify(window.__wod.sceneAudit())`);
  console.log("  sceneAudit(lead):", audit1);

  // 2) After a grab — one pip spent, "GRABBED · 2 LEFT" feedback.
  await js(`window.__wod.grabDay(1)`);
  await sleep(260);
  await shot(`02-grabbed-full.png`);
  await shot(`02-grabbed-pips.png`, HUDTOP);

  // 3) Two pips spent (one more grab = overrun).
  await js(`window.__wod.grabDay(1)`);
  await sleep(600);
  await shot(`03-two-pips.png`, HUDTOP);

  console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
  try { server.close(); } catch (_) {}
  win.destroy();
  app.exit(0);
});
