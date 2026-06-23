/* eslint-disable */
// Supply-run frame-pacing probe. Boots the built game, cuts to each supply
// scenario via the debug system, moves the avatar around to stress the scene,
// and samples requestAnimationFrame gaps. Pinpoints supply-run lag.
//   SUPPLY_PERF_DIR=qa/perf electron qa/perf-supply.cjs   (needs dist/)

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
if (!fs.existsSync(path.join(distDir, "index.html"))) { console.error("No dist/ build."); process.exit(1); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg" };
let server;
const startServer = () => new Promise((resolve) => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]); if (p === "/") p = "/index.html";
    fs.readFile(path.join(distDir, p), (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" }); res.end(data); });
  });
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({ width: 1600, height: 900, show: true, backgroundColor: "#05070a", webPreferences: { backgroundThrottling: false, offscreen: false } });
  const js = (s) => win.webContents.executeJavaScript(s);
  const fire = (code, type) => js(`window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)},{code:${JSON.stringify(code)}}))`);
  const errors = [];
  win.webContents.on("console-message", (_e, l, m) => { if (l >= 3) errors.push("CONSOLE: " + m); });

  const results = {};
  try {
    await win.loadURL(`http://127.0.0.1:${port}/`);
    await sleep(2200);
    await js(`localStorage.setItem('wod-played','1'); localStorage.setItem('wod-settings', JSON.stringify({quality:'high',qualityTouched:true,volume:0,music:0,muted:true}));`);

    for (const scen of ["supply-outer", "supply-flood", "supply-haven"]) {
      await js(`window.__wod.scenario(${JSON.stringify(scen)})`);
      await sleep(1500);
      // start sampler
      await js(`(()=>{ window.__p={gaps:[],last:performance.now(),on:true}; const t=(x)=>{const p=window.__p; if(!p||!p.on)return; p.gaps.push(x-p.last); p.last=x; requestAnimationFrame(t);}; requestAnimationFrame(t); })()`);
      // stress: walk around the lot for a few seconds
      for (const k of ["KeyW", "KeyA", "KeyD", "KeyS"]) { await fire(k, "keydown"); await sleep(900); await fire(k, "keyup"); }
      const perf = await js(`(()=>{ const p=window.__p; p.on=false; const g=p.gaps.slice(5); const max=g.length?Math.max(...g):0; const avg=g.reduce((a,b)=>a+b,0)/Math.max(1,g.length); return { frames:g.length, maxGap:+max.toFixed(1), avgGap:+avg.toFixed(1), fps:+(1000/Math.max(1,avg)).toFixed(1), over50:g.filter(x=>x>50).length, over100:g.filter(x=>x>100).length, over250:g.filter(x=>x>250).length }; })()`);
      results[scen] = perf;
      console.log(`${scen}: ${JSON.stringify(perf)}`);
    }

    // Leak test: re-enter the supply run many times; fps must NOT degrade across
    // starts (a per-run dispose leak shows up as a steady fps slide here).
    const heap0 = await js(`(performance.memory ? performance.memory.usedJSHeapSize : 0)`);
    const trend = [];
    for (let i = 0; i < 16; i++) {
      await js(`window.__wod.scenario('supply-flood')`);
      await sleep(550);
      await js(`(()=>{ window.__p={gaps:[],last:performance.now(),on:true}; const t=(x)=>{const p=window.__p; if(!p||!p.on)return; p.gaps.push(x-p.last); p.last=x; requestAnimationFrame(t);}; requestAnimationFrame(t); })()`);
      await sleep(700);
      const fps = await js(`(()=>{ const p=window.__p; p.on=false; const g=p.gaps.slice(3); const avg=g.reduce((a,b)=>a+b,0)/Math.max(1,g.length); return +(1000/Math.max(1,avg)).toFixed(1); })()`);
      trend.push(fps);
    }
    const heap1 = await js(`(performance.memory ? performance.memory.usedJSHeapSize : 0)`);
    const first3 = trend.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last3 = trend.slice(-3).reduce((a, b) => a + b, 0) / 3;
    results.leak = {
      trendFps: trend,
      first3: +first3.toFixed(1),
      last3: +last3.toFixed(1),
      degraded: last3 < first3 * 0.7,
      heapMB0: +(heap0 / 1048576).toFixed(1),
      heapMB1: +(heap1 / 1048576).toFixed(1),
    };
    console.log(`leak: 16 starts fps ${trend.join(", ")}`);
    console.log(`leak verdict: first3=${results.leak.first3} last3=${results.leak.last3} degraded=${results.leak.degraded} heap ${results.leak.heapMB0}→${results.leak.heapMB1} MB`);
  } catch (e) { errors.push("EXCEPTION: " + ((e && e.message) || e)); }

  const outDir = path.resolve(process.env.SUPPLY_PERF_DIR || path.join(root, "qa", "perf"));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "supply-perf.json"), JSON.stringify({ results, errors }, null, 2));
  if (errors.length) console.log("ERRORS:\n" + errors.slice(0, 10).join("\n"));
  try { server.close(); } catch (_) {}
  win.destroy();
  app.exit(0);
});
