/* eslint-disable */
// Focused real-renderer hitch test. Run after build via `npm run test:perf`.
// It boots the production bundle in Electron, enters a night, spawns every enemy
// and act boss type, and samples requestAnimationFrame gaps. This is aimed at
// catching multi-second main-action stalls from lazy geometry/material/shader work.

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("No dist/ build found. Run `npm run build` first.");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
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
    if (level >= 3) errors.push("CONSOLE: " + message);
  });
  win.webContents.on("render-process-gone", (_e, d) => errors.push("RENDERER GONE: " + d.reason));
  win.webContents.on("unresponsive", () => errors.push("UNRESPONSIVE"));

  const js = (s) => win.webContents.executeJavaScript(s);
  try {
    await win.loadURL(`http://127.0.0.1:${port}/`);
    await sleep(2200);
    await js(`localStorage.setItem('wod-played','1'); localStorage.setItem('wod-settings', JSON.stringify({quality:'high',qualityTouched:true,volume:0,music:0,muted:true}));`);
    await js(`window.__wod.startRun()`);
    await sleep(600);
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`);
    await sleep(1200);
    const st = await js(`window.__wod.state()`);
    if (st !== "night") errors.push("FLOW: expected night, got " + st);

    await js(`window.__wod.setNightProgress(0.45); window.__wod.ctx.enemies.clear();`);
    await sleep(300);
    await js(`(()=>{
      window.__wodPerf = { gaps: [], last: performance.now(), on: true };
      const tick = (t) => {
        const p = window.__wodPerf;
        if (!p || !p.on) return;
        p.gaps.push(t - p.last);
        p.last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    await sleep(160);
    await js(`(()=>{
      const spawn = window.__wod.spawnWave;
      const types = ['shambler','runner','crawler','brute','spitter','armored','screamer','leaper','shielded','exploder','tank'];
      for (const t of types) spawn(t, t === 'brute' || t === 'tank' ? 2 : 4);
      spawn('roadblock', 1);
      spawn('drowned', 1);
      spawn('behemoth', 1);
    })()`);
    await sleep(4500);
    const perf = await js(`(()=>{
      const p = window.__wodPerf;
      p.on = false;
      const gaps = p.gaps.slice(5);
      const maxGap = Math.max(...gaps);
      const avgGap = gaps.reduce((a,b)=>a+b,0) / Math.max(1, gaps.length);
      return {
        frames: gaps.length,
        maxGap,
        avgGap,
        over100: gaps.filter(g => g > 100).length,
        over250: gaps.filter(g => g > 250).length,
        over750: gaps.filter(g => g > 750).length
      };
    })()`);
    console.log("perf:", JSON.stringify(perf));
    if (perf.frames < 90) errors.push("PERF: too few sampled frames (" + perf.frames + ")");
    if (perf.maxGap > 750 || perf.over750 > 0) errors.push("PERF: large hitch detected, max gap " + Math.round(perf.maxGap) + "ms");
    if (perf.over250 > 1) errors.push("PERF: repeated >250ms frame gaps (" + perf.over250 + ")");
  } catch (e) {
    errors.push("EXCEPTION: " + (e && e.message ? e.message : String(e)));
  }

  console.log(errors.length ? "\nERRORS:\n" + errors.join("\n") : "\nNO PERF ERRORS");
  try {
    server.close();
  } catch (_) {}
  win.destroy();
  app.exit(errors.length ? 1 : 0);
});
