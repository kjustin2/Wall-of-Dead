/* eslint-disable */
// =============================================================================
// Wall of Dead — capture step of the self-improvement loop.
// =============================================================================
// Boots the built game in a real Electron/Chromium window (the actual WebGL
// renderer), drives the full slice title -> night -> day -> victory, and emits
// TWO machine-readable artifacts into CYCLE_DIR:
//
//   shots/<name>.png   screenshots at each meaningful step
//   snapshots.json     { errors, shots:{name:{mean,std,w,h}}, steps:{...} }
//
// The luminance stats are computed from the real rendered pixels via
// nativeImage.getBitmap(), so a black/dropped frame is objectively detectable.
//
// Run standalone:  CYCLE_DIR=qa/cycles/adhoc electron qa/capture.cjs
// Normally invoked by qa/loop.mjs (which sets CYCLE_DIR + builds first).
// =============================================================================

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const cycleDir = process.env.CYCLE_DIR
  ? path.resolve(process.env.CYCLE_DIR)
  : path.join(root, "qa", "cycles", "adhoc");
const shotDir = path.join(cycleDir, "shots");
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
const snap = { errors, shots: {}, steps: {}, ts: Date.now() };

function writeSnapshots() {
  const tmp = path.join(cycleDir, "snapshots.tmp.json");
  fs.writeFileSync(tmp, JSON.stringify(snap, null, 2));
  fs.renameSync(tmp, path.join(cycleDir, "snapshots.json")); // atomic-ish
}

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    // Created hidden, then shown with showInactive() (below) so the window is
    // visible to the compositor — the rAF-driven game loop runs at full speed
    // (a never-shown window throttles requestAnimationFrame) — yet it never takes
    // OS focus or yanks the cursor away from the editor during a capture run.
    show: false,
    backgroundColor: "#05070a",
    webPreferences: { backgroundThrottling: false, offscreen: false },
  });
  win.showInactive();

  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 3) errors.push("CONSOLE: " + message);
  });
  win.webContents.on("render-process-gone", (_e, d) => errors.push("RENDERER GONE: " + d.reason));
  win.webContents.on("unresponsive", () => errors.push("UNRESPONSIVE"));

  const js = (s) => win.webContents.executeJavaScript(s);
  const click = (sel) =>
    js(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(b){b.click(); return true;} return false;})()`);
  const has = (sel) => js(`!!document.querySelector(${JSON.stringify(sel)})`);

  // Screenshot + per-pixel luminance stats (mean brightness + stddev "content").
  async function shot(name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(shotDir, name), img.toPNG());
    let stats = null;
    try {
      const { width, height } = img.getSize();
      const bmp = img.getBitmap(); // BGRA, row-major
      let sum = 0,
        sumSq = 0,
        n = 0;
      // Stride-sample for speed (every 16th pixel is plenty for global stats).
      for (let i = 0; i < bmp.length; i += 4 * 16) {
        const lum = 0.114 * bmp[i] + 0.587 * bmp[i + 1] + 0.299 * bmp[i + 2];
        sum += lum;
        sumSq += lum * lum;
        n++;
      }
      const mean = n ? sum / n : 0;
      const variance = n ? Math.max(0, sumSq / n - mean * mean) : 0;
      stats = { mean: +mean.toFixed(2), std: +Math.sqrt(variance).toFixed(2), w: width, h: height };
    } catch (e) {
      stats = { mean: -1, std: -1, error: String((e && e.message) || e) };
    }
    snap.shots[name] = stats;
    console.log("  shot:", name, JSON.stringify(stats));
    return stats;
  }

  // Run one named checkpoint; never let a single step abort the whole capture.
  async function step(name, fn) {
    try {
      snap.steps[name] = (await fn()) || {};
    } catch (e) {
      const msg = String((e && e.message) || e);
      snap.steps[name] = { error: msg };
      errors.push("STEP " + name + ": " + msg);
      console.log("  step FAILED:", name, msg);
    }
  }

  try {
    await win.loadURL(`http://127.0.0.1:${port}/`);
    await sleep(2500);
    await shot("01-title.png");

    await step("title", async () => ({
      state: await js(`window.__wod.state()`),
      hasStart: await has(".act-start"),
    }));

    // --- Enter the first night (skip tutorial + opening cutscene) ----------
    await js(`localStorage.setItem('wod-played','1'); localStorage.removeItem('wod-save');`);
    await js(`window.__wod.startRun()`);
    await sleep(800);
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`); // skip story
    await sleep(1500);

    // Balance probe: the difficulty curve + per-act enemy identities across the
    // whole campaign (pure plan math, read before any combat).
    await step("balance", async () => {
      const stats = await js(`(()=>{ const out=[]; for(let n=1;n<=window.__wod.campaignTotal();n++) out.push(window.__wod.nightStats(n)); return out; })()`);
      return { stats };
    });

    await step("night", async () => ({
      state: await js(`window.__wod.state()`),
      banner: await js(`(()=>{const b=document.querySelector('.banner-main'); return b? b.textContent : '';})()`),
      levelChip: await js(`(()=>{const c=document.querySelector('.level-chip-v'); return c? c.textContent : '';})()`),
      wallSegs: await js(`window.__wod.ctx.wall.segments`),
      saved: await js(`!!localStorage.getItem('wod-save')`),
    }));

    // --- Populate the field + sample frame pacing under a full load --------
    await js(
      `window.__wod.spawnWave('shambler',6); window.__wod.spawnWave('runner',3); window.__wod.spawnWave('brute',1); window.__wod.spawnWave('spitter',2); window.__wod.spawnWave('crawler',3); window.__wod.spawnWave('armored',2); window.__wod.spawnWave('screamer',1); window.__wod.spawnWave('exploder',2); window.__wod.spawnWave('shielded',2); window.__wod.spawnWave('leaper',2); window.__wod.spawnWave('tank',1);`
    );
    await sleep(1600);
    await step("wave", async () => ({ alive: await js(`window.__wod.ctx.enemies.alive.length`) }));
    await shot("03-night-action.png");

    await step("perf", async () => {
      await js(`(()=>{ window.__wodPerf={gaps:[],last:performance.now(),on:true};
        const tick=(t)=>{const p=window.__wodPerf; if(!p||!p.on) return; p.gaps.push(t-p.last); p.last=t; requestAnimationFrame(tick);};
        requestAnimationFrame(tick); })()`);
      // Add the bosses on top of the existing crowd — worst-case geometry load.
      await js(`window.__wod.spawnWave('roadblock',1); window.__wod.spawnWave('drowned',1); window.__wod.spawnWave('behemoth',1);`);
      await sleep(3800);
      const gaps = await js(`(()=>{ const p=window.__wodPerf; p.on=false; const g=p.gaps.slice(5);
        const maxGap=g.length?Math.max(...g):0; const avg=g.reduce((a,b)=>a+b,0)/Math.max(1,g.length);
        return { frames:g.length, maxGap:+maxGap.toFixed(1), avgGap:+avg.toFixed(1),
                 over100:g.filter(x=>x>100).length, over250:g.filter(x=>x>250).length, over750:g.filter(x=>x>750).length }; })()`);
      // Worst-case GPU cost + scene-graph health under that same heavy load. The
      // draw-call / triangle counts make "did my optimization help" measurable;
      // the audit catches NaN/negative-radius geometry the luminance check can't.
      const render = await js(`window.__wod.renderStats()`).catch(() => null);
      const audit = await js(`window.__wod.sceneAudit()`).catch(() => null);
      return {
        ...gaps,
        render,
        sceneProblems: audit ? audit.problems.length : -1,
        sceneTris: audit ? audit.triangles : -1,
        problemSample: audit ? audit.problems.slice(0, 6) : [],
      };
    });

    // --- Mid-night lighting frame (the most-seen state) --------------------
    await js(`window.__wod.ctx.enemies.clear();`);
    await js(`window.__wod.setNightProgress(0.65)`);
    await sleep(700);
    await shot("03c-night-mid.png");

    // --- Adrenaline surge + Last Stand ------------------------------------
    await step("surge", async () => {
      await js(`
        const cv=document.getElementById('game');
        if(cv) cv.dispatchEvent(new PointerEvent('pointermove',{clientX:window.innerWidth/2,clientY:window.innerHeight*0.42}));
        window.__wod.ctx.adrenaline.gain(100);
      `);
      const zoneAtSurge = await js(`window.__wod.ctx.adrenaline.zone`);
      const before = await js(`window.__wod.ctx.adrenaline.value`);
      const lsBefore = await js(`window.__wod.ctx.stats.lastStands`);
      await js(`window.__wod.lastStand();`);
      await sleep(400);
      const after = await js(`window.__wod.ctx.adrenaline.value`);
      const lsAfter = await js(`window.__wod.ctx.stats.lastStands`);
      await sleep(700);
      await shot("04-grenade.png");
      return { zoneAtSurge, adrenSpent: after < before - 20, lastStands: lsAfter - lsBefore, before, after };
    });

    // --- Finale boss + health bar -----------------------------------------
    await step("boss", async () => {
      await js(`window.__wod.ctx.enemies.clear(); window.__wod.spawnWave('behemoth',1);`);
      await sleep(900);
      const bossAlive = await js(`window.__wod.ctx.enemies.bossAlive`);
      const barShown = await js(
        `(()=>{const b=document.querySelector('.boss-bar'); return !!b && getComputedStyle(b).display!=='none';})()`
      );
      await shot("04b-boss.png");
      return { bossAlive, barShown };
    });

    // --- Exploder chain-kill credit ---------------------------------------
    await step("exploder", async () => {
      await js(`(()=>{ const e=window.__wod.ctx.enemies; e.clear();
        for(let i=0;i<5;i++) e.spawn('crawler',-2+i,-40); e.spawn('exploder',0,-40); })()`);
      await sleep(220);
      const before = await js(`window.__wod.ctx.stats.kills`);
      await js(`(()=>{ const e=window.__wod.ctx.enemies; const ex=e.alive.find(z=>z.kind==='exploder');
        if(ex) window.__wod.ctx.combat.damageZombie(ex,99999,false,true); })()`);
      await sleep(160);
      const after = await js(`window.__wod.ctx.stats.kills`);
      const chainBadge = await js(`!!document.querySelector('.streak-badge.streak-badge--show')`);
      return { killsDelta: after - before, chainBadge };
    });

    // --- Every weapon selects + fires cleanly (probe, then RESTORE) --------
    await step("weapons", async () => {
      // Fire every weapon DEFINITION through the real bullet/combat path. We grant
      // the later-act weapons temporarily, then restore the run's armory so this
      // probe doesn't pollute the campaign (whose 5-weapon cap is asserted below).
      const orig = await js(`window.__wod.ctx.run.weapons.length`);
      await js(`(()=>{ const r=window.__wod.ctx.run;
        ['rifle','ar','dmr','autoshotgun','minigun','magnum','lmg'].forEach(id=>r.grantWeapon(id)); })()`);
      await js(`(()=>{ const e=window.__wod.ctx.enemies; e.clear(); for(let i=0;i<7;i++) e.spawn('shambler',-12+i*4,-34); })()`);
      const fired = await js(`(()=>{ const w=window.__wod.ctx; let n=0;
        for(let i=0;i<w.run.weapons.length;i++){ const def=w.run.weapons[i].def;
          for(const dx of [-0.12,0,0.12]) w.bullets.spawn(0,w.player.z,dx,-1,def,def.damage,true); n++; }
        return n; })()`);
      const peakDuringProbe = await js(`window.__wod.ctx.run.weapons.length`);
      // Restore: truncate the temporarily-granted weapons back to the real armory.
      await js(`(()=>{ const r=window.__wod.ctx.run; r.weapons.length=${orig}; r.weaponOwner.length=${orig}; r.weaponIndex=0; })()`);
      await sleep(250);
      await js(`window.__wod.ctx.enemies.clear();`);
      const restoredTo = await js(`window.__wod.ctx.run.weapons.length`);
      return { fired, peakDuringProbe, restoredTo };
    });

    // --- Weapons come ONLY from a collected weapon-case crate (not every run) ---
    await step("weaponCrate", async () => {
      // A run with NO weapon case grants no weapon; one WITH a collected case does.
      const noCrate = await js(
        `(()=>{ const r=window.__wod.ctx.run; r.start(); r.night=1; const b=r.weapons.length;
          window.__wod.startSupply('med', null); window.__wod.completeDay(); return r.weapons.length - b; })()`
      );
      const withCrate = await js(
        `(()=>{ const r=window.__wod.ctx.run; r.start(); r.night=1; const b=r.weapons.length;
          window.__wod.startSupply('med', 'rifle'); window.__wod.completeDay(); return r.weapons.length - b; })()`
      );
      // Clean up any loot/menu state the probe left, back to a known scene.
      await js(`window.__wod.startRun()`);
      await sleep(200);
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`);
      await sleep(900);
      return { noCrateDelta: noCrate, withCrateDelta: withCrate };
    });

    // --- Drive the rest of the campaign to victory (robust screen advancer)-
    await step("campaign", async () => {
      let endingChoices = 0;
      let sawDay = false;
      let dayObjects = -1;
      let scavengeShown = false;
      let maxWeapons = await js(`window.__wod.ctx.run.weapons.length`);
      let finalState = await js(`window.__wod.state()`);
      let shotEnding = false;

      for (let i = 0; i < 90; i++) {
        finalState = await js(`window.__wod.state()`);
        const wc = await js(`window.__wod.ctx.run.weapons.length`);
        if (wc > maxWeapons) maxWeapons = wc; // armory must never exceed the cap

        // Any choice screen — a dawn dilemma OR the Haven's-gate ending. The LAST
        // choice screen before the run ends is the two-option ending, so just
        // record the count each time we see one (the ending overwrites last).
        const choiceCount = await js(`document.querySelectorAll('.act-choice').length`);
        if (choiceCount > 0) {
          endingChoices = choiceCount;
          if (finalState === "victory" && !shotEnding) {
            shotEnding = true;
            await shot("08-victory.png"); // capture the actual ending-choice screen
          }
          await click(".act-choice-0");
          await sleep(700);
          continue;
        }
        if (finalState === "victory") break; // victory with no pending choices → done

        if (finalState === "night") {
          await js(`window.__wod.forceDawn();`);
          await sleep(1600);
          continue;
        }
        if (finalState === "day") {
          if (!sawDay) {
            sawDay = true;
            dayObjects = await js(`window.__wod.dayObjectCount()`);
            scavengeShown = await js(`window.__wod.scavengeShown()`);
            await sleep(900);
            await shot("06-day-scavenge.png");
          }
          await js(`window.__wod.completeDay();`);
          await sleep(1000);
          continue;
        }

        // Menu/report screens: click the most-advancing control present.
        if (await has(".act-supply-1")) {
          await click(".act-supply-1");
          await sleep(900);
          continue;
        }
        if (await has(".screen--road .act-cont")) {
          await click(".screen--road .act-cont");
          await sleep(1200);
          continue;
        }
        if (await has(".act-cont")) {
          await click(".act-cont");
          await sleep(700);
          continue;
        }
        if (await has(".act-start")) {
          await click(".act-start");
          await sleep(500);
          continue;
        }
        await sleep(400); // nothing matched; let a transition settle
      }

      await sleep(300);
      if (!shotEnding) await shot("08-victory.png");
      const saveClearedOnWin = await js(`!localStorage.getItem('wod-save')`);
      return { finalState, endingChoices, maxWeapons, dayObjects, scavengeShown, saveClearedOnWin };
    });
    // Lift the day-render facts up to where the goal reads them.
    snap.steps.day = {
      dayObjects: snap.steps.campaign?.dayObjects,
      scavengeShown: snap.steps.campaign?.scavengeShown,
    };
  } catch (e) {
    errors.push("EXCEPTION: " + ((e && e.message) || String(e)));
  }

  writeSnapshots();
  console.log(
    errors.length ? `\nCAPTURE ERRORS (${errors.length}):\n` + errors.slice(0, 20).join("\n") : "\nCAPTURE OK — no errors."
  );
  try {
    server.close();
  } catch (_) {}
  win.destroy();
  app.exit(0); // never fail the process on game errors — they're data in snapshots.json
});
