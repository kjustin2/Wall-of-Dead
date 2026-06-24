/* eslint-disable */
// Map showcase capture: screenshots each ACT night zone and each SUPPLY-RUN
// theme so map uniqueness/interest can be judged from the real renderer.
// Output: <MAPS_DIR>/act{1,2,3}-night.png and supply-{outer,flood,haven}.png
//   MAPS_DIR=qa/maps/baseline electron qa/capture-maps.cjs   (needs a dist/ build)

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const outDir = path.resolve(process.env.MAPS_DIR || path.join(root, "qa", "maps", "adhoc"));
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
const stats = {}; // name -> {mean,std} luminance signature

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({ width: 1600, height: 900, show: false, backgroundColor: "#05070a", webPreferences: { backgroundThrottling: false, offscreen: false } });
  win.showInactive(); // visible to the compositor (no rAF throttle) but never steals OS focus/cursor
  const js = (s) => win.webContents.executeJavaScript(s);
  async function shot(name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name), img.toPNG());
    const bmp = img.getBitmap(); // BGRA
    let sum = 0, sq = 0, n = 0, rs = 0, gs = 0, bs = 0;
    for (let i = 0; i < bmp.length; i += 64) {
      const b = bmp[i], g = bmp[i + 1], r = bmp[i + 2];
      const l = 0.114 * b + 0.587 * g + 0.299 * r;
      sum += l; sq += l * l; rs += r; gs += g; bs += b; n++;
    }
    const m = sum / n;
    const sd = Math.sqrt(Math.max(0, sq / n - m * m));
    stats[name] = { mean: +m.toFixed(1), std: +sd.toFixed(1), r: +(rs / n).toFixed(1), g: +(gs / n).toFixed(1), b: +(bs / n).toFixed(1) };
    console.log("  shot:", name, `mean=${m.toFixed(1)} std=${sd.toFixed(1)} rgb=${stats[name].r},${stats[name].g},${stats[name].b}`);
  }

  try {
    await win.loadURL(`http://127.0.0.1:${port}/`);
    await sleep(2500);
    await js(`localStorage.setItem('wod-played','1'); localStorage.removeItem('wod-save');`);
    await js(`window.__wod.startRun()`);
    await sleep(800);
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`); // skip story → night
    await sleep(1500);

    // Hide the HUD/banner layer so the shots show the MAP, not the overlay.
    const hideHud = `(()=>{const h=document.getElementById('hud'); if(h) h.style.display='none';})()`;
    await js(hideHud);

    // --- Act night zones (zone 1=Outer, 2=Flood, 3=Haven). Populate for life. ---
    const actNames = { 1: "act1-outer", 2: "act2-flood", 3: "act3-haven" };
    for (const zone of [1, 2, 3]) {
      await js(`(()=>{ const w=window.__wod; w.ctx.enemies.clear();
        w.ctx.world.setZone(${zone}); w.setNightProgress(0.55);
        for(let i=0;i<7;i++) w.ctx.enemies.spawn('shambler', -22+i*6, -28 - (i%3)*12);
        for(let i=0;i<3;i++) w.ctx.enemies.spawn('runner',  -12+i*12, -48);
      })()`);
      await sleep(1300);
      await js(hideHud);
      await shot(`${actNames[zone]}-night.png`);
    }
    await js(`window.__wod.ctx.enemies.clear();`);

    // --- Supply-run maps (one per act theme), richest density for most props. ---
    const supplies = [[1, "outer"], [4, "flood"], [7, "haven"]];
    for (const [night, theme] of supplies) {
      await js(`window.__wod.ctx.run.night = ${night}; window.__wod.startSupply('high');`);
      await sleep(1500); // let the intro title fade + scene settle
      // Teleport deep into the lot so the camera frames the themed INTERIOR detail
      // (tanker / dinghy / bunkers + the weapon case), not the identical entrance.
      await js(`window.__wod.scavengeTeleport(0, -46)`);
      await sleep(700);
      await js(hideHud);
      await shot(`supply-${theme}.png`);
    }

    // --- Objective uniqueness signal: the act trio and supply trio must each be
    // pairwise-distinct in luminance signature (guards against maps collapsing to
    // the same look). Coarse — the screenshots remain the source of truth. ---
    // Signature distance combines brightness, contrast, AND hue (avg R/G/B) so
    // two maps that differ only in colour (amber vs red) still read as distinct.
    const dist = (a, b) => Math.hypot(a.mean - b.mean, a.std - b.std, a.r - b.r, a.g - b.g, a.b - b.b);
    const trios = {
      acts: ["act1-outer-night.png", "act2-flood-night.png", "act3-haven-night.png"],
      supply: ["supply-outer.png", "supply-flood.png", "supply-haven.png"],
    };
    // Per-trio distinctness floors. The night ACTS must read as dramatically
    // different PLACES (high bar). The SUPPLY lots intentionally share one dark
    // urban-stealth base (concrete blocks under the avatar's flashlight) and are
    // differentiated by props + accent colour (flood by a full-lot water sheet),
    // so their average-signature floor is lower — the screenshots are the primary
    // proof of identity, this is just a coarse "didn't collapse to identical" guard.
    const THRESH = { acts: 10, supply: 4 };
    const report = { stats, thresholds: THRESH, trios: {} };
    let allDistinct = true;
    for (const [name, shots] of Object.entries(trios)) {
      const min = THRESH[name];
      const pairs = [];
      for (let i = 0; i < shots.length; i++)
        for (let j = i + 1; j < shots.length; j++) {
          const d = stats[shots[i]] && stats[shots[j]] ? +dist(stats[shots[i]], stats[shots[j]]).toFixed(1) : 0;
          const ok = d >= min;
          if (!ok) allDistinct = false;
          pairs.push({ a: shots[i], b: shots[j], dist: d, ok });
          console.log(`  ${name} distinct ${shots[i]} vs ${shots[j]}: ${d} (min ${min}) ${ok ? "OK" : "TOO SIMILAR"}`);
        }
      report.trios[name] = pairs;
    }
    report.allDistinct = allDistinct;
    fs.writeFileSync(path.join(outDir, "maps.json"), JSON.stringify(report, null, 2));
    console.log(allDistinct ? "\nMAPS OK — act + supply trios are pairwise-distinct." : "\nMAPS WARN — some maps look too similar.");
  } catch (e) {
    console.log("EXCEPTION:", (e && e.message) || e);
  }

  try { server.close(); } catch (_) {}
  win.destroy();
  app.exit(0);
});
