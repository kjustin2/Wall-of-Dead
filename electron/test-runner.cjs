// Visual playthrough test. Launches the game in the REAL Electron/Chromium
// renderer (the same file:// load path as `npm start`), captures console
// output + uncaught errors, drives the game through every scene, and writes
// screenshots to shots/. This is what catches real-canvas / browser issues the
// headless logic test (check.mjs, mock 2D context) cannot.
//
//   npm run test:play        (or: npx electron electron/test-runner.cjs)
//
// Exit code is 0 only if the game booted with zero page errors.

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const consoleLogs = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(win, name) {
  try {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS, name + '.png'), img.toPNG());
    console.log('  [shot] ' + name + '.png');
  } catch (e) {
    console.log('  [shot FAILED] ' + name + ' :: ' + e.message);
  }
}

// Run an expression in the page; swallow + report errors instead of throwing.
async function ev(win, expr) {
  try { return await win.webContents.executeJavaScript('(()=>{' + expr + '})()', true); }
  catch (e) { consoleLogs.push('[eval error] ' + e.message + ' :: ' + expr.slice(0, 80)); return undefined; }
}

async function run() {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: true,            // shown so the GPU paints reliably
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'test-preload.cjs'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);

  win.webContents.on('console-message', (...args) => {
    let level, message, line, source;
    if (args.length >= 3 && typeof args[1] !== 'object') {
      [, level, message, line, source] = args;             // classic signature
    } else {
      const e = args[0] || {};
      level = e.level; message = e.message; line = e.lineNumber; source = e.sourceId;
    }
    consoleLogs.push(`[console:${level}] ${message}${source ? ` (${source}:${line})` : ''}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => consoleLogs.push('[render-process-gone] ' + JSON.stringify(d)));
  win.webContents.on('preload-error', (_e, p, err) => consoleLogs.push('[preload-error] ' + err));

  // Load exactly like the shipping app (electron/main.cjs uses loadFile).
  await win.loadFile(path.join(ROOT, 'index.html'));
  await delay(900);

  const booted = await ev(win, 'return !!(window._wod && window._wod.game);');
  let errors = (await ev(win, 'return window.__errors || [];')) || [];

  console.log('\n[scene captures]');
  await capture(win, '01-title');

  if (booted) {
    await ev(win, 'window._wod.game.startRun();');
    await delay(500); await capture(win, '02-night-start');

    // Inject a varied horde so the action shot shows every zombie type.
    await delay(1200);
    await ev(win, "const s=window._wod.game.scene; const T=['shambler','shambler','shambler','runner','runner','spitter','brute']; for(let i=0;i<28;i++) s._spawn(T[i%T.length]);");
    await delay(2600);
    await ev(win, "const i=window._wod.game.input; i.mouse.x=560; i.mouse.y=250; i.mouse.down=true; i.mouse.clicked=true;");
    await delay(1000); await capture(win, '03-night-action');

    // Move the player and keep firing for a second snapshot.
    await ev(win, "const k=window._wod.game.input.keys; k.add('d'); const i=window._wod.game.input; i.mouse.x=820; i.mouse.y=300; i.mouse.clicked=true;");
    await delay(1200); await capture(win, '04-night-firing');
    await ev(win, "const k=window._wod.game.input.keys; k.delete('d'); window._wod.game.input.mouse.down=false;");

    // Pause menu via a real Escape keydown, then the Settings sub-view.
    // Park the cursor in a corner so keyboard selection isn't overridden by hover.
    await ev(win, "const i=window._wod.game.input; i.mouse.x=4; i.mouse.y=4;");
    await ev(win, "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));");
    await delay(250); await capture(win, '05-pause');
    await ev(win, "window._wod.game.overlay.menu.sel=2; window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));");
    await delay(250); await capture(win, '06-settings');
    await ev(win, "window._wod.game.resume();");

    // Force dawn → DayScene report.
    await ev(win, "const s=window._wod.game.scene; if(s&&s.director){s.director.elapsed=s.director.duration+1;}");
    await delay(4200); await capture(win, '07-day-report');

    // Expedition choice screen.
    await ev(win, "window._wod.game.scene.phase='choose';");
    await delay(300); await capture(win, '08-day-choose');

    // Pick the high-risk action run and play it for a couple of shots.
    await ev(win, "window._wod.game.scene._choose(1);");
    await delay(900); await capture(win, '09-minigame');
    await ev(win, "const k=window._wod.game.input.keys; k.add('d'); k.add('w');");
    await delay(1100); await capture(win, '10-minigame-action');
    await ev(win, "const k=window._wod.game.input.keys; k.delete('d'); k.delete('w');");

    // End the run and show the loot screen.
    await ev(win, "const m=window._wod.game.scene.minigame; if(m){m.timeLeft=0;}");
    await delay(600); await capture(win, '11-day-loot');

    // Win + lose screens.
    await ev(win, "window._wod.game.toVictory();");
    await delay(600); await capture(win, '12-victory');
    await ev(win, "window._wod.game.run.deathReason='The wall collapsed. The horde poured through.'; window._wod.game.toGameOver();");
    await delay(600); await capture(win, '13-gameover');

    errors = (await ev(win, 'return window.__errors || [];')) || errors;
  }

  // Dedupe — a per-frame render bug produces thousands of identical lines.
  const tally = (arr) => {
    const m = new Map();
    for (const e of arr) { const k = String(e).split('\n')[0]; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()];
  };

  console.log('\n==== TEST PLAY SUMMARY ====');
  console.log('booted:', booted);
  const uniqErr = tally(errors);
  console.log(`page errors: ${errors.length} total, ${uniqErr.length} unique`);
  for (const [msg, n] of uniqErr) console.log(`  ! (x${n}) ${msg}`);
  const uniqLog = tally(consoleLogs.filter((l) => l.includes(':error') || l.includes(':warn')));
  console.log(`console warnings/errors: ${uniqLog.length} unique`);
  for (const [msg, n] of uniqLog) console.log(`  (x${n}) ${msg}`);
  console.log('screenshots in:', SHOTS);

  process.exitCode = booted && errors.length === 0 ? 0 : 1;
  win.destroy();
  app.quit();
}

// Safety net so the harness can never hang a session.
setTimeout(() => { console.log('[timeout] forcing exit'); process.exit(1); }, 60000);

app.whenReady().then(run).catch((err) => { console.error('[fatal]', err); process.exitCode = 1; app.quit(); });
app.on('window-all-closed', () => app.quit());
