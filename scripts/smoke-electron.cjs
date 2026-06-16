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
    const js = (s) => win.webContents.executeJavaScript(s);
    try {
      await win.loadURL(`http://127.0.0.1:${port}/`);
      await sleep(2500);
      await shot(win, "01-title.png");

      // Settings round-trip: open from the title, set Nightmare, confirm it
      // applies to the difficulty multipliers, then back.
      await js(`(()=>{const b=document.querySelector('.act-settings'); if(b) b.click();})()`);
      await sleep(300);
      const diffOk = await js(`(()=>{const s=document.querySelector('.set-diff'); if(!s) return false; s.value='nightmare'; s.dispatchEvent(new Event('change')); return true;})()`);
      await sleep(200);
      const zhp = await js(`window.__wod.ctx.tuning.zHp`);
      if (!diffOk) errors.push("SETTINGS: no difficulty selector");
      if (!(zhp > 1)) errors.push("SETTINGS: Nightmare did not apply (zHp=" + zhp + ")");
      await shot(win, "01c-settings.png");
      // The settings list must fit the viewport (BACK reachable, not cut off).
      const fits = await js(`(()=>{const b=document.querySelector('.act-back'); if(!b) return false; const r=b.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.top >= 0;})()`);
      if (!fits) errors.push("SETTINGS: panel overflows the screen (BACK off-screen)");
      // Restore Normal so the rest of the run is on baseline, then leave settings.
      await js(`(()=>{const s=document.querySelector('.set-diff'); if(s){s.value='normal'; s.dispatchEvent(new Event('change'));}})()`);
      await js(`(()=>{const b=document.querySelector('.act-back'); if(b) b.click();})()`);
      await sleep(400);

      // Begin run → first-play tutorial → opening cutscene
      await win.webContents.executeJavaScript(`localStorage.removeItem('wod-played')`);
      await win.webContents.executeJavaScript(`document.querySelector('.act-start').click()`);
      await sleep(700);
      const tut = await win.webContents.executeJavaScript(`!!document.querySelector('.screen--help')`);
      if (!tut) errors.push("FLOW: first-play tutorial did not appear");
      await shot(win, "01b-tutorial.png");
      await win.webContents.executeJavaScript(`document.querySelector('.act-back').click()`); // START
      await sleep(1500);
      await shot(win, "02-cutscene.png");

      // Skip the story → night
      await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`);
      await sleep(1400);
      const ns = await win.webContents.executeJavaScript(`window.__wod.state()`);
      if (ns !== "night") errors.push("FLOW: expected night after cutscene, got " + ns);
      // Save & resume: a checkpoint is written when the night begins.
      const saved = await win.webContents.executeJavaScript(`!!localStorage.getItem('wod-save')`);
      if (!saved) errors.push("SAVE: no checkpoint after the night began");

      // Pause / resume round-trip.
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`);
      await sleep(350);
      if ((await js(`window.__wod.state()`)) !== "paused") errors.push("FLOW: Esc did not pause");

      // Bail to the main menu, then CONTINUE back into the run from the save.
      await js(`(()=>{const b=document.querySelector('.act-title'); if(b) b.click();})()`);
      await sleep(800);
      const hasCont = await js(`!!document.querySelector('.act-continue')`);
      if (!hasCont) errors.push("RESUME: title has no CONTINUE with a save present");
      await js(`(()=>{const b=document.querySelector('.act-continue'); if(b) b.click();})()`);
      await sleep(1200);
      const rs = await js(`window.__wod.state()`);
      if (rs !== "night") errors.push("RESUME: CONTINUE did not return to night, got " + rs);

      // Let a wave build, then force some action (every zombie type renders here)
      await win.webContents.executeJavaScript(`window.__wod.spawnWave('shambler', 6); window.__wod.spawnWave('runner', 3); window.__wod.spawnWave('brute', 1); window.__wod.spawnWave('spitter', 2); window.__wod.spawnWave('crawler', 3); window.__wod.spawnWave('armored', 2); window.__wod.spawnWave('screamer', 1); window.__wod.spawnWave('exploder', 2); window.__wod.spawnWave('shielded', 2); window.__wod.spawnWave('leaper', 2); window.__wod.spawnWave('tank', 1);`);
      await sleep(2000);
      // Drop a trap + flare (tactics) so those render paths run too.
      await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT'})); window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG'})); window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC'}));`);
      await sleep(300);
      // Exercise the melee bash (Space) swing path
      await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));`);
      await sleep(120);
      await shot(win, "03b-shove.png");
      await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}));`);
      await sleep(1400);
      await shot(win, "03-night-action.png");
      // Mid-night frame (dawn ramp partway up) — this is what the player sees most
      // of the night, and where late-night lighting issues actually show.
      await win.webContents.executeJavaScript(`window.__wod.setNightProgress(0.65)`);
      await sleep(700);
      await shot(win, "03c-night-mid.png");

      // Aim downfield, charge the meter, throw the Last Stand grenade
      await win.webContents.executeJavaScript(`
        const cv = document.getElementById('game');
        cv.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth/2, clientY: window.innerHeight*0.42 }));
        window.__wod.ctx.adrenaline.gain(100);
        window.__wod.lastStand();
      `);
      await sleep(1150);
      await shot(win, "04-grenade.png");

      // Finale boss: spawn the Behemoth, confirm it lives + its bar shows, then
      // shoot it a bit (drives boss phase logic + the wide-slam render path).
      await win.webContents.executeJavaScript(`window.__wod.spawnWave('behemoth', 1);`);
      await sleep(900);
      const bossAlive = await win.webContents.executeJavaScript(`window.__wod.ctx.enemies.bossAlive`);
      if (!bossAlive) errors.push("FINALE: behemoth boss did not spawn/register");
      const barShown = await win.webContents.executeJavaScript(
        `(()=>{const b=document.querySelector('.boss-bar'); return b && getComputedStyle(b).display !== 'none';})()`
      );
      if (!barShown) errors.push("FINALE: boss health bar not visible");
      await shot(win, "04b-boss.png");

      // Regression: exploder splash must CREDIT chain kills (kills + ZOMBIE_KILLED).
      // Spawn a tight cluster of weak zombies + an exploder, all in blast range,
      // then kill the exploder and confirm kills jumped by more than 1.
      await js(`(()=>{ const e=window.__wod.ctx.enemies; e.clear();
        for (let i=0;i<5;i++) e.spawn('crawler', -2+i, -40);
        e.spawn('exploder', 0, -40);
      })()`);
      await sleep(200);
      const killsBefore = await js(`window.__wod.ctx.stats.kills`);
      await js(`(()=>{ const e=window.__wod.ctx.enemies; const ex=e.alive.find(z=>z.kind==='exploder');
        if (ex) window.__wod.ctx.combat.damageZombie(ex, 99999, false, true);
      })()`);
      await sleep(120);
      const killsAfter = await js(`window.__wod.ctx.stats.kills`);
      if (!(killsAfter - killsBefore >= 2)) {
        errors.push("EXPLODER: chain kills not credited (kills +" + (killsAfter - killsBefore) + ")");
      }

      // Loop the night -> day -> continue cycle until the safe zone (multi-night).
      let finalState = "";
      for (let leg = 0; leg < 5; leg++) {
        await win.webContents.executeJavaScript(`window.__wod.forceDawn();`);
        await sleep(1700);
        if (leg === 0) {
          // Perf/leak: clearing the field should recycle actors into the pool,
          // and leave none alive (no orphaned enemy meshes across nights).
          const alive = await win.webContents.executeJavaScript(`window.__wod.ctx.enemies.alive.length`);
          if (alive !== 0) errors.push("LEAK: " + alive + " enemies still alive after dawn");
          const pooled = await win.webContents.executeJavaScript(`window.__wod.ctx.enemies.poolSize()`);
          if (pooled <= 0) errors.push("PERF: zombie pool not reused after clear");
        }
        if (leg === 0) await shot(win, "05-day-report.png");
        const started = await win.webContents.executeJavaScript(
          `(()=>{const b=document.querySelector('.act-start'); if(b){b.click(); return true;} return false;})()`
        );
        if (!started) errors.push("FLOW: no Supply Run button on report (leg " + leg + ")");
        await sleep(1200);
        if (leg === 0) {
          // Exercise the stealth verbs (toggle flashlight + lure) while backing to
          // the safe entrance edge, away from the guards deeper in the lot — caught
          // now ends the run on first contact, so don't wander into one.
          await win.webContents.executeJavaScript(`(()=>{
            const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type || 'keydown', { code }));
            fire('KeyF'); fire('KeyQ'); fire('KeyF'); fire('KeyS','keydown');
          })()`);
          // Let the opening banner fade so the shot shows the lot, not the title.
          await sleep(1700);
          // Graphics regression guard: the run scene actually built its props.
          const dayObjs = await win.webContents.executeJavaScript(`window.__wod.dayObjectCount()`);
          if (!(dayObjs > 60)) errors.push("GRAPHICS: supply-run scene sparse (" + dayObjs + " objects)");
          await shot(win, "06-day-scavenge.png");
          await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyS'}))`);
        }
        await win.webContents.executeJavaScript(`window.__wod.completeDay();`);
        await sleep(1100);
        if (leg === 0) await shot(win, "07-day-loot.png");
        await win.webContents.executeJavaScript(
          `(()=>{const b=document.querySelector('.act-cont'); if(b) b.click();})()`
        );
        await sleep(700);
        // A dawn dilemma may appear before the next night — pick the first option.
        const dilemma = await win.webContents.executeJavaScript(
          `(()=>{const b=document.querySelector('.act-choice-0'); if(b){b.click(); return true;} return false;})()`
        );
        if (leg === 0 && !dilemma) errors.push("STAKES: no dawn dilemma after the first day");
        await sleep(700);
        // Then the road-map interstitial (story + advancing convoy).
        const road = await win.webContents.executeJavaScript(`!!document.querySelector('.screen--road')`);
        if (leg === 0 && !road) errors.push("STORY: no road-map interstitial between nights");
        if (leg === 0 && road) await shot(win, "07b-roadmap.png");
        await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.screen--road .act-cont'); if(b) b.click();})()`);
        await sleep(1400);
        finalState = await win.webContents.executeJavaScript(`window.__wod.state()`);
        if (finalState === "victory") break;
      }
      await shot(win, "08-victory.png");
      if (finalState !== "victory") errors.push("FLOW: expected victory, got " + finalState);
      const clearedOnWin = await win.webContents.executeJavaScript(`!localStorage.getItem('wod-save')`);
      if (!clearedOnWin) errors.push("SAVE: checkpoint not cleared on victory");
      console.log("  final state:", finalState);

      // Edge case: restarting while the supply run is on screen must clear it.
      await js(`(()=>{const b=document.querySelector('.act-replay'); if(b) b.click();})()`);
      await sleep(900);
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`); // skip story
      await sleep(1200);
      await js(`window.__wod.forceDawn();`);
      await sleep(1600);
      await js(`(()=>{const b=document.querySelector('.act-start'); if(b) b.click();})()`); // start supply run
      await sleep(1200);
      if (!(await js(`window.__wod.scavengeShown()`))) errors.push("EDGE: supply run not shown during day");
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`); // pause
      await sleep(400);
      await js(`(()=>{const b=document.querySelector('.act-restart'); if(b) b.click();})()`); // restart run
      await sleep(1100);
      if (await js(`window.__wod.scavengeShown()`)) errors.push("EDGE: supply-run map still visible after restart");
      await shot(win, "09-restart-clean.png");

      // Defeat path: skip into the night, kill the player, confirm the death
      // screen and that the save is cleared (this transition is otherwise untested).
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`); // skip story → night
      await sleep(1300);
      if ((await js(`window.__wod.state()`)) === "night") {
        await js(`window.__wod.ctx.combat.damagePlayer(9999, 0, 1)`);
        await sleep(900);
        const st = await js(`window.__wod.state()`);
        if (st !== "dead") errors.push("DEFEAT: player death did not reach 'dead' (got " + st + ")");
        if (!(await js(`!!document.querySelector('.screen--death')`))) errors.push("DEFEAT: death screen not shown");
        if (!(await js(`!localStorage.getItem('wod-save')`))) errors.push("DEFEAT: save not cleared on death");
        await shot(win, "10-defeat.png");
      } else {
        errors.push("DEFEAT: could not reach night to test the death path");
      }
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
