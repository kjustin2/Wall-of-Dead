// Headless smoke: stub the browser globals main.js touches at module-eval
// time, then dynamically import each module and exercise a tiny slice of the
// runtime so we catch import-graph errors, missing exports, and obvious
// type mistakes before opening the page.

class FakeCtx {
  constructor() {
    this.canvas = { width: 1280, height: 720 };
    this.fillStyle = ''; this.strokeStyle = ''; this.font = '';
    this.lineWidth = 0; this.globalAlpha = 1;
    this.textAlign = ''; this.shadowColor = ''; this.shadowBlur = 0;
    this.filter = ''; this.globalCompositeOperation = '';
  }
  save() {} restore() {} translate() {} rotate() {} scale() {}
  beginPath() {} moveTo() {} lineTo() {} arc() {} ellipse() {} arcTo() {}
  bezierCurveTo() {} quadraticCurveTo() {} closePath() {} clip() {}
  stroke() {} fill() {}
  fillRect() {} strokeRect() {} clearRect() {} fillText() {} strokeText() {}
  drawImage() {} setLineDash() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  measureText() { return { width: 100 }; }
}

const fakeCanvas = {
  width: 1280, height: 720,
  style: {},
  getContext: () => new FakeCtx(),
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }),
  addEventListener: () => {},
  removeEventListener: () => {},
};

globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? { ...fakeCanvas, getContext: () => new FakeCtx() } : {},
  getElementById: () => fakeCanvas,
};
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1280, innerHeight: 720,
  navigator: { getGamepads: () => [] },
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => 0; // never actually fire
globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] || null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
globalThis.sessionStorage = {
  _s: {},
  getItem(k) { return this._s[k] || null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
// Node 20+ has a read-only `navigator` global; just inject getGamepads on it.
try { globalThis.navigator.getGamepads = () => []; } catch {}

const mods = [
  './src/Config.js',
  './src/util/geom.js',
  './src/util/rng.js',
  './src/engine/EventBus.js',
  './src/engine/Engine.js',
  './src/engine/Input.js',
  './src/engine/Renderer.js',
  './src/engine/SceneManager.js',
  './src/engine/SpatialHash.js',
  './src/engine/Particles.js',
  './src/engine/Audio.js',
  './src/engine/MetaProgress.js',
  './src/core/Entity.js',
  './src/core/Projectile.js',
  './src/weapons/AmmoTypes.js',
  './src/weapons/WeaponDefs.js',
  './src/weapons/Weapon.js',
  './src/core/Player.js',
  './src/world/Arena.js',
  './src/world/NodeGraphGen.js',
  './src/world/RunState.js',
  './src/zombies/Zombie.js',
  './src/zombies/Shambler.js',
  './src/zombies/Runner.js',
  './src/zombies/Spitter.js',
  './src/data/WaveTemplates.js',
  './src/world/WaveDirector.js',
  './src/ui/HUD.js',
  './src/ui/MapUI.js',
  './src/scenes/Scene.js',
  './src/scenes/BootScene.js',
  './src/scenes/IntroScene.js',
  './src/scenes/BaseCampScene.js',
  './src/scenes/MapScene.js',
  './src/scenes/ScavengeScene.js',
  './src/scenes/ShopScene.js',
  './src/scenes/EventScene.js',
  './src/scenes/CombatScene.js',
  './src/scenes/GameOverScene.js',
  './src/scenes/VictoryScene.js',
  './src/scenes/MetaScene.js',
  './src/minigames/Minigame.js',
  './src/minigames/LockpickGame.js',
];

for (const m of mods) {
  try {
    await import(m);
    process.stdout.write('.');
  } catch (e) {
    console.error(`\n[FAIL] ${m}: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  }
}
console.log('\n[ok] all modules import cleanly');

// Smoke-test the runtime: build a CombatScene, run a couple update ticks,
// confirm zombies spawn, projectiles fire, and no exceptions surface.
const { InputManager } = await import('./src/engine/Input.js');
const { CombatScene }  = await import('./src/scenes/CombatScene.js');

const input = new InputManager(fakeCanvas);
const audio = { playSfx() {}, playBGM() {}, stopBGM() {} };
const scene = new CombatScene(input, audio);
scene.enter({ seed: 42, nightNum: 1 });

// Move mouse to right of player so aim is sane and simulate left-click hold
input.mouse.x = 800;
input.mouse.y = 400;
input.mouse.leftDown = true;
input.keys.add('d');

// Smoke runs the auto-fire SMG so the test doesn't have to simulate
// click-release-click for the semi-auto pistol.
scene.player.swap(1);  // SMG

const ctx = new FakeCtx();
const dt = 1 / 60;
let frames = 0;
const maxFrames = 60 * 60; // 60s cap
while (!scene.cleared && !scene.dead && frames < maxFrames) {
  let bx = scene.player.x + 100, by = scene.player.y;
  let bestD = Infinity;
  for (const z of scene.director.zombies) {
    if (!z.alive || z.spawnTimer > 0) continue;
    const dx = z.x - scene.player.x, dy = z.y - scene.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; bx = z.x; by = z.y; }
  }
  input.mouse.x = bx; input.mouse.y = by;
  input.mouse.leftDown = true;
  scene.update(dt);
  scene.render(ctx);
  input.clearFrame();
  frames++;
}

const elapsed = (frames * dt).toFixed(1);
console.log(
  `[ok] night1 after ${elapsed}s: kills=${scene.player.kills} scrap=${scene.player.scrap} ` +
  `hp=${scene.player.hp.toFixed(1)} cleared=${scene.cleared} dead=${scene.dead} ` +
  `zombies=${scene.director.zombies.length} projectiles=${scene.projectiles.list.length}`
);

// Listener leak check — spawn 5 fresh CombatScenes (enter+exit cycle) and
// confirm listener counts don't grow. This is the regression test the plan
// flags as the #1 risk.
import { events as bus } from './src/engine/EventBus.js';
const baselineCounts = JSON.stringify(bus.counts());
for (let i = 0; i < 5; i++) {
  const s = new CombatScene(input, audio);
  s.enter({ seed: 7 + i, nightNum: 1 });
  s.exit();
}
const afterCounts = JSON.stringify(bus.counts());
if (baselineCounts === afterCounts) {
  console.log('[ok] no listener leak across 5 enter/exit cycles');
} else {
  console.error('[FAIL] listener leak detected');
  console.error('before:', baselineCounts);
  console.error(' after:', afterCounts);
  process.exit(1);
}

// Night-3 stress: shamblers + runners + spitters + weapon swap to shotgun.
const scene3 = new CombatScene(input, audio);
scene3.enter({ seed: 99, nightNum: 3 });
scene3.player.swap(2);  // shotgun
input.mouse.leftDown = false;
let f3 = 0;
while (!scene3.cleared && !scene3.dead && f3 < 60 * 90) {
  let bx = scene3.player.x + 100, by = scene3.player.y;
  let bestD = Infinity;
  for (const z of scene3.director.zombies) {
    if (!z.alive || z.spawnTimer > 0) continue;
    const dx = z.x - scene3.player.x, dy = z.y - scene3.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; bx = z.x; by = z.y; }
  }
  input.mouse.x = bx; input.mouse.y = by;
  // Shotgun is semi-auto: edge-trigger by toggling leftDown. Click-release-click pattern.
  input.mouse.leftDown = (f3 % 4 < 2);
  scene3.update(dt);
  scene3.render(ctx);
  input.clearFrame();
  f3++;
}
console.log(
  `[ok] night3 after ${(f3 * dt).toFixed(1)}s: kills=${scene3.player.kills} scrap=${scene3.player.scrap} ` +
  `hp=${scene3.player.hp.toFixed(1)} cleared=${scene3.cleared} dead=${scene3.dead} ` +
  `weapon=${scene3.player.weapon.id} mag=${scene3.player.weapon.mag}/${scene3.player.weapon.reserve}`
);

// ── M3: run state + node graph + persistence ──
const { runState } = await import('./src/world/RunState.js');
const { meta } = await import('./src/engine/MetaProgress.js');

// Reset persisted state for a clean test
sessionStorage.removeItem('wod_run_v1');
localStorage.removeItem('wall_of_dead_meta');

// Start a run, walk the graph picking the first reachable each step
runState.start({ seed: 12345, starterId: 'pistol' });
console.log(`[ok] run started: graph layers=${runState.graph.maxLayers} startId=${runState.currentNodeId}`);

let steps = 0;
const visited = [];
while (runState.currentNodeId !== runState.graph.endId && steps < 20) {
  const cur = runState.graph.nodeMap[runState.currentNodeId];
  visited.push({ id: cur.id, type: cur.type });
  if (cur.next.length === 0) break;
  runState.advanceTo(cur.next[0]);
  steps++;
}
const finalNode = runState.graph.nodeMap[runState.currentNodeId];
visited.push({ id: finalNode.id, type: finalNode.type });
console.log(`[ok] graph walk: ${steps} steps, reached ${finalNode.type} (boss=${runState.isAtBoss()})`);
console.log(`     path: ${visited.map(v => v.type[0]).join('→')}`);

// Save → resume round-trip
runState.persist();
const beforeSeed = runState.seed;
const beforeNight = runState.nightNum;
const beforeNode = runState.currentNodeId;
runState.active = false;  // simulate page reload
runState.graph = null;
runState.currentNodeId = null;
const resumed = runState.resume();
if (!resumed || runState.seed !== beforeSeed || runState.currentNodeId !== beforeNode || runState.nightNum !== beforeNight) {
  console.error('[FAIL] resume did not restore state');
  process.exit(1);
}
console.log(`[ok] resume restored: seed=${runState.seed} nightNum=${runState.nightNum} node=${runState.currentNodeId}`);

// MetaProgress: record a run, then read it back
meta.recordRun({ won: false, nightReached: 4, kills: 27, scrapEarned: 12 });
meta.recordRun({ won: true,  nightReached: 7, kills: 88, scrapEarned: 40 });
if (meta.state.totalRuns !== 2 || meta.state.totalWins !== 1 || meta.state.bestNight !== 7) {
  console.error('[FAIL] meta state wrong after recordRun', meta.state);
  process.exit(1);
}
console.log(`[ok] meta: runs=${meta.state.totalRuns} wins=${meta.state.totalWins} bestNight=${meta.state.bestNight} scrap=${meta.state.scrap}`);

// Confirm meta survives a "reload" via the same localStorage stub
const { meta: meta2 } = await import('./src/engine/MetaProgress.js?v=2').catch(async () => {
  // Module caching: just call .load() to re-pull from localStorage
  meta.load();
  return { meta };
});
if (meta2.state.totalRuns !== 2) {
  console.error('[FAIL] meta did not survive reload');
  process.exit(1);
}
console.log(`[ok] meta survives reload: ${meta2.state.totalRuns} runs persisted`);

// ── M4: Lockpick minigame ──
const { LockpickGame } = await import('./src/minigames/LockpickGame.js');
const game = new LockpickGame();
game.start({ difficulty: 'easy' });

// Auto-play emulating a careful human — wait until the pin is near the
// dead-center of the wedge before locking, not just barely inside it.
let mgFrames = 0;
const SNAP_THRESHOLD = game.wedgeWidth * 0.18;  // ~10% of half-wedge → A/S tier
while (!game.done && mgFrames < 60 * 30) {
  for (let i = 0; i < game.pins.length; i++) {
    const p = game.pins[i];
    if (p.locked) continue;
    let d = Math.abs(p.rot - p.wedgeCenter) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d <= SNAP_THRESHOLD) {
      input.justPressed.add(String(i + 1));
      break;
    }
  }
  game.update(1 / 60, input);
  input.clearFrame();
  mgFrames++;
}
const r = game.getResult();
console.log(`[ok] lockpick auto-play: tier=${r.tier} score=${(r.score*100).toFixed(0)}% missed=${r.missed} time=${r.timeUsed.toFixed(1)}s`);
if (!['B','A','S'].includes(r.tier)) {
  console.error('[FAIL] auto-play should consistently land at least B-tier');
  process.exit(1);
}
