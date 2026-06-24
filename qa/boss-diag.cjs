/* eslint-disable */
// One-off boss diagnostic: cut to each boss, end the cinematic, frame the boss
// cleanly from the rampart, dump material/position/render data, and screenshot at
// a couple of moments. Writes qa/scenarios/bossdiag/*.png + bossdiag.json.
const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const outDir = path.join(root, "qa", "scenarios", "bossdiag");
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
  }

  const out = { bosses: [], errors };
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await sleep(2500);
  await js(`localStorage.setItem('wod-played','1'); localStorage.removeItem('wod-save');`);

  for (const name of ["boss-roadblock", "boss-drowned", "boss-behemoth"]) {
    await js(`window.__wod.scenario(${JSON.stringify(name)})`);
    // Let the cinematic run a moment (worst-case close-up of the head glow), shoot
    // it, then let it end + the boss advance and shoot the in-play rampart view.
    await sleep(1200);
    await shot(`${name}-cine.png`);
    await sleep(5000);
    await shot(`${name}-play.png`);
    // Worst case: shove the boss right up to the wall under the player's flashlight
    // (point-blank rampart view) to check for blow-out.
    await js(`(() => { const b = window.__wod.ctx.enemies.boss; if (b) { b.z = -6; b.group.position.z = -6; } })()`);
    await sleep(900);
    await shot(`${name}-wall.png`);
    // End the cinematic + dump boss/camera/material data after a settle.
    const data = await js(`(() => {
      const w = window.__wod, ctx = w.ctx;
      const b = ctx.enemies.boss;
      const cam = ctx.stage.camera;
      let mat = null, body = null;
      if (b) {
        // find the body mesh (MeshStandardMaterial) under the group
        b.group.traverse(o => {
          if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !mat) {
            mat = o.material; body = o;
          }
        });
      }
      const c = mat && mat.color, e = mat && mat.emissive;
      return {
        boss: b ? { x: +b.x.toFixed(2), z: +b.z.toFixed(2), hp: Math.round(b.hp), kind: b.kind } : null,
        cam: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2), fov: +cam.fov.toFixed(1) },
        camToBoss: b ? +Math.hypot(cam.position.x-b.x, cam.position.z-b.z).toFixed(2) : null,
        color: c ? '#'+c.getHexString() : null,
        emissive: e ? '#'+e.getHexString() : null,
        emissiveIntensity: mat ? mat.emissiveIntensity : null,
        scale: b ? b.group.scale.x : null,
        render: w.renderStats(),
        audit: w.sceneAudit(),
      };
    })()`).catch((e) => ({ err: String(e) }));
    out.bosses.push({ name, data });
    console.log(name, JSON.stringify(data && data.boss), 'camToBoss=' + (data && data.camToBoss), 'color=' + (data && data.color), 'emissive=' + (data && data.emissive));
  }

  fs.writeFileSync(path.join(outDir, "bossdiag.json"), JSON.stringify(out, null, 2));
  console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
  try { server.close(); } catch (_) {}
  win.destroy();
  app.exit(0);
});
