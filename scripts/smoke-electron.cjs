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
    // Created hidden, then shown with showInactive() (below) so the window is
    // visible to the compositor — the rAF-driven game loop runs at full speed
    // (a never-shown window throttles requestAnimationFrame) — yet it never takes
    // OS focus or yanks the cursor away from the editor during a test run.
    show: false,
    backgroundColor: "#05070a",
    webPreferences: { backgroundThrottling: false, offscreen: false },
  });
  win.showInactive();

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
      const nightLabel = await js(`(()=>{const b=document.querySelector('.banner-main'); return b ? b.textContent : '';})()`);
      if (!nightLabel.includes("LEVEL 1-1")) errors.push("LABEL: opening banner should show LEVEL 1-1, got " + nightLabel);
      if (nightLabel.includes("/")) errors.push("LABEL: opening banner still shows campaign total (" + nightLabel + ")");
      const levelChip = await js(`(()=>{const c=document.querySelector('.level-chip-v'); return c ? c.textContent : '';})()`);
      if (!levelChip.includes("LEVEL 1-1")) errors.push("POLISH: level chip missing opening level (" + levelChip + ")");
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

      // Scene-graph health + render cost at the heaviest night moment. A geometry
      // with a NaN/negative bounding radius (the class that shipped a black screen
      // here, that no mocked canvas caught) is a hard failure — not a screenshot
      // we have to eyeball. renderStats also proves the renderer drew real work.
      const audit = await js(`window.__wod.sceneAudit()`);
      if (audit && audit.problems && audit.problems.length) {
        errors.push(
          "SCENE: " + audit.problems.length + " scene-graph problem(s): " +
            audit.problems.slice(0, 4).map((p) => p.kind + " @ " + p.object).join(", ")
        );
      }
      const rstats = await js(`window.__wod.renderStats()`);
      if (!(rstats && rstats.calls > 0 && Number.isFinite(rstats.triangles))) {
        errors.push("RENDERSTATS: renderer.info unavailable or zero draw calls");
      } else {
        console.log("  renderStats(night):", JSON.stringify(rstats), "| audit tris:", audit && audit.triangles);
      }

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
      const chainBadge = await js(`document.querySelector('.streak-badge')?.classList.contains('streak-badge--show')`);
      if (!chainBadge) errors.push("POLISH: chain badge did not appear after confirmed kills");

      // Model showcase: a lit row of varied zombies right at the wall so the
      // enhanced silhouettes (armor, maws, sacs, etc.) are actually visible.
      await js(`(()=>{ const e=window.__wod.ctx.enemies; e.clear();
        const types=['shambler','runner','brute','spitter','armored','screamer','exploder','leaper','tank'];
        for(let i=0;i<types.length;i++) e.spawn(types[i], -18+i*4.4, -7);
        window.__wod.ctx.world.setDawn(0.6);
      })()`);
      await sleep(700);
      await shot(win, "03e-zombie-models.png");
      await js(`window.__wod.ctx.enemies.clear(); window.__wod.ctx.world.setDawn(0.05);`);

      // Loop the night -> day -> continue cycle until the safe zone (full campaign).
      const totalLegs = await js(`window.__wod.campaignTotal()`);
      let finalState = "";
      let endingSeen = false;
      let swapSeen = false;
      for (let leg = 0; leg < totalLegs; leg++) {
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
        if (leg === 0) {
          // Loadout (ally weapon assignment): it opens, the sidearm row is locked,
          // and assigning a real weapon to an ally sticks (doesn't reset others).
          await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.act-loadout'); if(b) b.click();})()`);
          await sleep(450);
          const lockedSidearm = await win.webContents.executeJavaScript(
            `!!document.querySelector('.lo-row--locked')`
          );
          if (!lockedSidearm) errors.push("LOADOUT: sidearm row is not locked / assignable");
          await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.lo-row:not(.lo-row--locked)'); if(r) r.click();})()`);
          await sleep(300);
          await shot(win, "05b-loadout.png");
          await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.act-back'); if(b) b.click();})()`);
          await sleep(400);
        }
        const started = await win.webContents.executeJavaScript(
          `(()=>{const b=document.querySelector('.act-start'); if(b){b.click(); return true;} return false;})()`
        );
        if (!started) errors.push("FLOW: no Supply Run button on report (leg " + leg + ")");
        await sleep(450);
        // New: a population choice (loot vs. risk) precedes the run — pick "medium".
        if (leg === 0) {
          const hasChoice = await js(`!!document.querySelector('.act-supply-1')`);
          if (!hasChoice) errors.push("SUPPLY: no population choice screen before the run");
          else await shot(win, "06a-supply-choice.png");
        }
        // Force this run to carry a weapon case for an unowned gun, so the armory
        // fills deterministically and a found-at-cap weapon reliably triggers the
        // ARMORY FULL swap (the organic find is RNG-gated → otherwise flaky).
        await js(`(()=>{
          const FIND=["rifle","ar","lmg","dmr","autoshotgun","minigun","magnum"];
          const owned=new Set(window.__wod.ctx.run.weapons.map(w=>w.def.id));
          window.__wod.forceNextWeaponCase(FIND.find(id=>!owned.has(id)) || FIND[0]);
        })()`);
        await js(`(()=>{const b=document.querySelector('.act-supply-1'); if(b) b.click();})()`);
        await sleep(900);
        if (leg === 0) {
          // Exercise the stealth verbs (toggle flashlight) while backing to the
          // safe entrance edge, away from the guards deeper in the lot — caught now
          // ends the run on first contact, so don't wander into one.
          await win.webContents.executeJavaScript(`(()=>{
            const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type || 'keydown', { code }));
            fire('KeyF'); fire('KeyF'); fire('KeyS','keydown');
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
        // A dawn dilemma — or, on the final leg, the Haven "freedom isn't free"
        // ending choice — may appear. Capture its title, then pick the first option.
        const dTitle = await js(`(()=>{const t=document.querySelector('.screen--report .panel-title'); return t? t.textContent : '';})()`);
        if (dTitle && dTitle.indexOf("HAVEN") >= 0) endingSeen = true;
        if (dTitle && dTitle.indexOf("ARMORY FULL") >= 0) swapSeen = true;
        // Latch-based fallback: the single DOM read above races with the transient
        // dilemma paint under load — the game-state latch catches it reliably.
        if (!swapSeen) swapSeen = await js(`!!(window.__wod.armorySwapOffered && window.__wod.armorySwapOffered())`);
        const dilemma = await win.webContents.executeJavaScript(
          `(()=>{const b=document.querySelector('.act-choice-0'); if(b){b.click(); return true;} return false;})()`
        );
        if (leg === 0 && !dilemma) errors.push("STAKES: no dawn dilemma after the first day");
        // Weapon cap: a found weapon at the cap becomes a swap, never a 6th gun.
        const wc = await js(`window.__wod.ctx.run.weapons.length`);
        if (wc > 5) errors.push("CAP: armory exceeded 5 weapons (" + wc + " on leg " + leg + ")");
        await sleep(700);
        // Then the road-map interstitial (story + advancing convoy).
        const road = await win.webContents.executeJavaScript(`!!document.querySelector('.screen--road')`);
        if (leg === 0 && !road) errors.push("STORY: no road-map interstitial between nights");
        if (leg === 0 && road) await shot(win, "07b-roadmap.png");
        await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.screen--road .act-cont'); if(b) b.click();})()`);
        await sleep(1400);
        finalState = await win.webContents.executeJavaScript(`window.__wod.state()`);
        // Each leg re-themes the environment (per-night zone + its signature
        // feature: refinery smog / floodwater / ashfall / Haven floodlights).
        // Capture every later night so a zone-retint regression shows in the shots.
        if (finalState === "night" && leg < 4) {
          await win.webContents.executeJavaScript(`window.__wod.setNightProgress(0.4)`);
          await sleep(500);
          await shot(win, "03z-night" + (leg + 2) + "-zone.png");
        }
        if (finalState === "victory") break;
      }
      await shot(win, "08-victory.png");
      if (finalState !== "victory") errors.push("FLOW: expected victory, got " + finalState);
      if (!endingSeen) errors.push("ENDING: Haven's-gate ending choice never appeared");
      if (!swapSeen) errors.push("CAP: a found weapon at the cap never forced a swap decision");
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
      await js(`(()=>{const b=document.querySelector('.act-start'); if(b) b.click();})()`); // report → supply choice
      await sleep(450);
      await js(`(()=>{const b=document.querySelector('.act-supply-1'); if(b) b.click();})()`); // pick population → run
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

      // ---- Extra coverage for the campaign systems (run on a fresh throwaway run) ----
      await js(`window.__wod.startRun()`);
      await sleep(700);
      await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))`); // skip story → night
      await sleep(1300);
      const probe = await js(`window.__wod.state()`);
      if (probe === "night") {
        // (a) Every weapon — including the new later-act finds — selects + fires
        // tracers through the real bullet/combat path without error.
        await js(`(()=>{ const r=window.__wod.ctx.run; ['rifle','ar','dmr','autoshotgun','minigun','magnum','lmg'].forEach(id=>r.grantWeapon(id)); })()`);
        await js(`(()=>{ const e=window.__wod.ctx.enemies; e.clear(); for(let i=0;i<7;i++) e.spawn('shambler', -12+i*4, -34); })()`);
        const fired = await js(`(()=>{ const w=window.__wod.ctx; let n=0;
          for(let i=0;i<w.run.weapons.length;i++){ const def=w.run.weapons[i].def;
            for(const dx of [-0.12,0,0.12]) w.bullets.spawn(0, w.player.z, dx, -1, def, def.damage, true);
            n++; }
          return n; })()`);
        if (!(fired >= 8)) errors.push("WEAPONS: expected 8+ distinct weapons to fire, fired " + fired);
        await sleep(380);
        await shot(win, "11-new-weapons.png");
      } else {
        errors.push("WEAPONS: could not reach a night for the weapon-fire test (got " + probe + ")");
      }

      // (b) The supply-run population choice changes BOTH the haul and the look
      // (open outskirts vs. a dense route), and every act has its own skin.
      await js(`window.__wod.ctx.run.night = 1`);
      await js(`window.__wod.startSupply('low')`);
      await sleep(550);
      const lowTotal = await js(`window.__wod.scavengeTotal()`);
      const lowEnv = await js(`window.__wod.envName()`);
      const supplyChip = await js(`(()=>{const c=document.querySelector('.level-chip-v'); return c ? c.textContent : '';})()`);
      if (!supplyChip.includes("SUPPLY")) errors.push("POLISH: supply run did not update level chip (" + supplyChip + ")");
      await shot(win, "12a-supply-outskirts.png");
      await js(`window.__wod.startSupply('med')`);
      await sleep(550);
      await shot(win, "12b-supply-blocks.png");
      await js(`window.__wod.startSupply('high')`);
      await sleep(550);
      const highTotal = await js(`window.__wod.scavengeTotal()`);
      const highEnv = await js(`window.__wod.envName()`);
      await shot(win, "12c-supply-crowded.png");
      if (!(highTotal > lowTotal)) errors.push("DENSITY: high-pop haul (" + highTotal + ") not richer than low (" + lowTotal + ")");
      if (!lowEnv.includes("QUIET")) errors.push("DENSITY: low route mislabeled (" + lowEnv + ")");
      if (!highEnv.includes("CROWDED")) errors.push("DENSITY: high route mislabeled (" + highEnv + ")");
      if (!highEnv.includes("OUTER ROAD")) errors.push("ACT SKIN: act 1 supply run mislabeled (" + highEnv + ")");

      await js(`window.__wod.ctx.run.night = 4; window.__wod.startSupply('med')`);
      await sleep(550);
      const floodEnv = await js(`window.__wod.envName()`);
      await shot(win, "12d-supply-floodline.png");
      if (!floodEnv.includes("FLOODLINE")) errors.push("ACT SKIN: act 2 supply run mislabeled (" + floodEnv + ")");

      await js(`window.__wod.ctx.run.night = 7; window.__wod.startSupply('med')`);
      await sleep(550);
      const havenEnv = await js(`window.__wod.envName()`);
      await shot(win, "12e-supply-haven.png");
      if (!havenEnv.includes("HAVEN")) errors.push("ACT SKIN: act 3 supply run mislabeled (" + havenEnv + ")");

      // (c) Inter-night events: with a full roster, repeated marches both claim
      // allies (random ally-death) and sometimes pay off — both branches run.
      await js(`(()=>{ const r=window.__wod.ctx.run; r.companions=['Mara','Pike','Dunn']; r.companionTraits={Mara:'gunner',Pike:'marksman',Dunn:'medic'}; r.night=4; })()`);
      const ev = await js(`(()=>{ let deaths=0, lines=0;
        for(let i=0;i<60 && window.__wod.ctx.run.companions.length>0;i++){
          const before=window.__wod.ctx.run.companions.length;
          const line=window.__wod.interNightEvent();
          if(line) lines++;
          if(window.__wod.ctx.run.companions.length<before) deaths++;
        }
        return {deaths,lines}; })()`);
      if (!(ev.deaths >= 1)) errors.push("EVENT: inter-night ally-death never fired across 60 marches");
      if (!(ev.lines >= 1)) errors.push("EVENT: inter-night events produced no narrative lines");

      // (d) The "leave" Haven ending — the branch the main run didn't take.
      await js(`window.__wod.forceVictory()`);
      await sleep(400);
      const choiceN = await js(`document.querySelectorAll('.act-choice').length`);
      if (choiceN < 2) errors.push("ENDING: Haven gate did not offer two endings (" + choiceN + ")");
      await js(`(()=>{const b=document.querySelector('.act-choice-1'); if(b) b.click();})()`); // walk back into the dark
      await sleep(500);
      if (!(await js(`!!document.querySelector('.screen--victory')`))) errors.push("ENDING: leave-ending did not reach the victory screen");
      await shot(win, "13-ending-leave.png");
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
