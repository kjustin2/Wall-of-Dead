/* eslint-disable */
// Packaging smoke: reproduce the EXACT production serving path — fs.readFile
// from inside app.asar over a loopback HTTP server — and capture the packaged
// window's own rendered frame via win.capturePage(). This isolates the one risk
// that the normal smoke (which runs against unpacked dist/) can't see: that the
// asar-packed build serves and draws. Run with the packaged electron:
//   electron scripts/pkg-smoke.cjs <path-to-app.asar-dir-containing-dist>
const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const outPng = path.join(__dirname, "..", "release", "_pkg-smoke.png");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff": "font/woff", ".woff2": "font/woff2",
  ".mp3": "audio/mpeg", ".svg": "image/svg+xml",
};

const errors = [];

function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let u = decodeURIComponent((req.url || "/").split("?")[0]);
      if (u === "/" || u === "") u = "/index.html";
      const f = path.join(distDir, u);
      fs.readFile(f, (err, data) => {
        if (err) { errors.push("404 " + u); res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
        res.end(data);
      });
    });
    s.listen(0, "127.0.0.1", () => resolve(s.address().port));
  });
}

app.whenReady().then(async () => {
  const port = await serve();
  const win = new BrowserWindow({
    width: 1280, height: 720, show: false,
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });
  win.webContents.on("console-message", (_e, level, msg) => {
    if (level >= 2) errors.push("console: " + msg);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    errors.push(`did-fail-load ${code} ${desc} ${url}`));

  win.showInactive(); // visible (so WebGL composits) but never steals focus
  await win.loadURL(`http://127.0.0.1:${port}/?lowfx`);

  // Let the title screen settle a few seconds, then capture the real frame.
  await new Promise((r) => setTimeout(r, 6000));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outPng, img.toPNG());

  const title = win.getTitle();
  const stats = await win.webContents.executeJavaScript(
    "({hasGame: !!window.__wod, state: window.__wod && window.__wod.ctx && window.__wod.ctx.state})"
  ).catch((e) => ({ err: String(e) }));

  console.log("PKG_SMOKE_RESULT " + JSON.stringify({ title, stats, errors }));
  app.quit();
});
