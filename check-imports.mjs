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
  './src/minigames/WireCutGame.js',
  './src/zombies/Bloater.js',
  './src/zombies/Brute.js',
  './src/zombies/Screamer.js',
  './src/zombies/Crawler.js',
  './src/core/Mine.js',
  './src/core/Grenade.js',
  './src/util/text.js',
  './src/zombies/BossPatientZero.js',
  './src/engine/Lighting.js',
  './src/DevConsole.js',
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
  // First two frames release the click so Player._fireArmed flips true
  // (mirrors a real human pressing-then-holding after scene transition).
  input.mouse.leftDown = (frames >= 2);
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
  // Shotgun is semi-auto: leftDown must edge-trigger AND _fireArmed must be set.
  // First couple frames left up so fire arms; then click/release pattern.
  input.mouse.leftDown = f3 >= 2 && (f3 % 4 < 2);
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

// ── Bug-fix regression: click-through must not fire on first combat frame ──
const sceneArm = new CombatScene(input, audio);
sceneArm.enter({ seed: 1, nightNum: 1 });
input.mouse.leftDown = true;          // simulate user still holding from a map click
const projBefore = sceneArm.projectiles.list.length;
sceneArm.update(1 / 60);              // one frame
const projAfter = sceneArm.projectiles.list.length;
if (projAfter > projBefore) {
  console.error('[FAIL] held click from prior scene fired on first combat frame');
  process.exit(1);
}
console.log('[ok] click-through regression: held LMB does not fire on first frame');

// ── Backup knife: dries every weapon, holds LMB, expects a knife hit ──
const sceneK = new CombatScene(input, audio);
sceneK.enter({ seed: 1, nightNum: 1 });
for (const w of sceneK.player.inventory) { w.mag = 0; w.reserve = 0; }
input.mouse.leftDown = false;
sceneK.update(1 / 60);                // arm the fire
// Spawn a zombie near the player so the knife arc lands.
const { Shambler } = await import('./src/zombies/Shambler.js');
const z = new Shambler(sceneK.player.x + 35, sceneK.player.y);
z.spawnTimer = 0;                     // skip invuln window
sceneK.director.zombies.push(z);
input.mouse.leftDown = true;
input.mouse.x = z.x; input.mouse.y = z.y;
const zHpBefore = z.hp;
for (let i = 0; i < 6; i++) { sceneK.update(1 / 60); input.clearFrame(); input.mouse.leftDown = true; }
if (z.hp >= zHpBefore) {
  console.error('[FAIL] knife backup did not damage zombie when all weapons dry');
  process.exit(1);
}
console.log(`[ok] backup knife: damaged zombie ${zHpBefore - z.hp} HP via melee when all weapons dry`);

// ── M5: rocket AoE explosion damages multiple zombies ──
const sceneRkt = new CombatScene(input, audio);
sceneRkt.enter({ seed: 1, nightNum: 1 });
sceneRkt.player.inventory.length = 0;
const { Weapon } = await import('./src/weapons/Weapon.js');
const { WEAPONS } = await import('./src/weapons/WeaponDefs.js');
sceneRkt.player.inventory.push(new Weapon(WEAPONS.rocket));
sceneRkt.player.currentWeaponIdx = 0;
sceneRkt.director.zombies.length = 0;
const { Shambler: Sh2 } = await import('./src/zombies/Shambler.js');
const cluster = [];
for (let i = 0; i < 3; i++) {
  const z = new Sh2(800 + (i - 1) * 25, 360);
  z.spawnTimer = 0;
  cluster.push(z);
  sceneRkt.director.zombies.push(z);
}
input.mouse.x = 800; input.mouse.y = 360;
input.mouse.leftDown = false;
sceneRkt.update(1 / 60);
input.mouse.leftDown = true;
for (let i = 0; i < 90; i++) { sceneRkt.update(1 / 60); input.clearFrame(); input.mouse.leftDown = false; }
// Track THIS cluster only — the WaveDirector keeps spawning, so the array
// is a moving target; test against the original references.
const clusterDead = cluster.filter(z => !z.alive).length;
console.log(`[ok] rocket AoE: cleared ${clusterDead}/3 of the original cluster`);
if (clusterDead < 2) {
  console.error('[FAIL] rocket AoE should clear at least 2 of 3 clustered zombies');
  process.exit(1);
}

// ── M5: bloater explodes on death ──
const sceneBloat = new CombatScene(input, audio);
sceneBloat.enter({ seed: 1, nightNum: 1 });
sceneBloat.director.zombies.length = 0;
const { Bloater } = await import('./src/zombies/Bloater.js');
const bloater = new Bloater(800, 360);
bloater.spawnTimer = 0;
sceneBloat.director.zombies.push(bloater);
const sh3 = new Sh2(820, 360);
sh3.spawnTimer = 0;
sceneBloat.director.zombies.push(sh3);
const sh3HpBefore = sh3.hp;
bloater.hp = 1;
bloater.takeDamage(99);              // kill it → triggers AOE_EXPLOSION
sceneBloat.update(1 / 60);
if (sh3.hp >= sh3HpBefore) {
  console.error('[FAIL] bloater death AoE did not damage adjacent zombie');
  process.exit(1);
}
console.log(`[ok] bloater AoE: adjacent zombie took ${sh3HpBefore - sh3.hp} HP from death blast`);

// ── M5: WireCut auto-play to A/S tier ──
const { WireCutGame } = await import('./src/minigames/WireCutGame.js');
const wc = new WireCutGame();
wc.start({ difficulty: 'normal' });
let wcFrames = 0;
while (!wc.done && wcFrames < 60 * 30) {
  const target = wc.prompts[wc.cursor];
  if (target) input.justPressed.add(String(target.id + 1));
  wc.update(1 / 60, input);
  input.clearFrame();
  wcFrames++;
}
const wcr = wc.getResult();
console.log(`[ok] wirecut auto-play: tier=${wcr.tier} cleared=${wc.cursor}/${wc.prompts.length} reason=${wcr.reason}`);
if (wcr.tier === 'D') {
  console.error('[FAIL] perfect wirecut auto-play scored D-tier');
  process.exit(1);
}

// ── M5: bat swing kills zombies in arc ──
const sceneBat = new CombatScene(input, audio);
sceneBat.enter({ seed: 1, nightNum: 1 });
sceneBat.player.inventory.length = 0;
sceneBat.player.inventory.push(new Weapon(WEAPONS.bat));
sceneBat.player.currentWeaponIdx = 0;
sceneBat.director.zombies.length = 0;
const target = new Sh2(sceneBat.player.x + 35, sceneBat.player.y);
target.spawnTimer = 0;
sceneBat.director.zombies.push(target);
input.mouse.x = target.x; input.mouse.y = target.y;
input.mouse.leftDown = false;
sceneBat.update(1 / 60);   // arm
const batHpBefore = target.hp;
input.mouse.leftDown = true;
sceneBat.update(1 / 60);
input.clearFrame();
if (target.hp >= batHpBefore) {
  console.error('[FAIL] bat swing did not damage adjacent zombie');
  process.exit(1);
}
console.log(`[ok] bat melee: dealt ${batHpBefore - target.hp} HP to zombie in front arc`);

// ── M5: grenade emits THROW_GRENADE → grenade entity exists in scene ──
const sceneGrn = new CombatScene(input, audio);
sceneGrn.enter({ seed: 1, nightNum: 1 });
sceneGrn.player.inventory.length = 0;
sceneGrn.player.inventory.push(new Weapon(WEAPONS.grenade));
sceneGrn.player.currentWeaponIdx = 0;
input.mouse.x = sceneGrn.player.x + 200; input.mouse.y = sceneGrn.player.y;
input.mouse.leftDown = false;
sceneGrn.update(1 / 60);   // arm
input.mouse.leftDown = true;
sceneGrn.update(1 / 60);   // throw
input.clearFrame();
if (sceneGrn.grenades.length === 0) {
  console.error('[FAIL] grenade weapon did not produce a Grenade entity');
  process.exit(1);
}
console.log(`[ok] grenade thrown: ${sceneGrn.grenades.length} grenade(s) in flight`);

// ── M5: mine placed at player's feet ──
const sceneMine = new CombatScene(input, audio);
sceneMine.enter({ seed: 1, nightNum: 1 });
sceneMine.player.inventory.length = 0;
sceneMine.player.inventory.push(new Weapon(WEAPONS.mine));
sceneMine.player.currentWeaponIdx = 0;
input.mouse.leftDown = false;
sceneMine.update(1 / 60);   // arm
input.mouse.leftDown = true;
sceneMine.update(1 / 60);   // place
input.clearFrame();
if (sceneMine.mines.length !== 1) {
  console.error('[FAIL] mine weapon did not place a mine');
  process.exit(1);
}
console.log(`[ok] mine placed: ${sceneMine.mines.length} mine(s) on the ground`);

// ── M5: brute charges at player after telegraph ──
const sceneBrute = new CombatScene(input, audio);
sceneBrute.enter({ seed: 1, nightNum: 1 });
sceneBrute.director.zombies.length = 0;
const { Brute } = await import('./src/zombies/Brute.js');
const brute = new Brute(sceneBrute.player.x + 200, sceneBrute.player.y);
brute.spawnTimer = 0;
brute.chargeCD = 0;            // ready to charge
sceneBrute.director.zombies.push(brute);
let phaseSeen = new Set();
for (let i = 0; i < 60 * 3; i++) {
  sceneBrute.update(1 / 60);
  phaseSeen.add(brute.chargePhase);
  input.clearFrame();
  if (phaseSeen.has('charging')) break;
}
if (!phaseSeen.has('telegraph') || !phaseSeen.has('charging')) {
  console.error('[FAIL] brute did not telegraph + charge', [...phaseSeen]);
  process.exit(1);
}
console.log(`[ok] brute attack: phases seen = ${[...phaseSeen].join(', ')}`);

// ── M5: screamer spawns reinforcements ──
const sceneScr = new CombatScene(input, audio);
sceneScr.enter({ seed: 1, nightNum: 1 });
sceneScr.director.zombies.length = 0;
const { Screamer } = await import('./src/zombies/Screamer.js');
const scr = new Screamer(sceneScr.player.x + 250, sceneScr.player.y);
scr.spawnTimer = 0;
scr.screamCD = 0;            // ready to scream
sceneScr.director.zombies.push(scr);
const beforeCount = sceneScr.director.zombies.length;
for (let i = 0; i < 60 * 1; i++) { sceneScr.update(1 / 60); input.clearFrame(); }
const afterCount = sceneScr.director.zombies.length;
if (afterCount <= beforeCount) {
  console.error('[FAIL] screamer call did not spawn reinforcements');
  process.exit(1);
}
console.log(`[ok] screamer call: spawned ${afterCount - beforeCount} reinforcements`);

// ── M6: BossPatientZero phase transitions ──
const sceneBoss = new CombatScene(input, audio);
sceneBoss.enter({ seed: 1, nightNum: 7, boss: true });
sceneBoss.director.zombies.length = 0;
const { BossPatientZero } = await import('./src/zombies/BossPatientZero.js');
const bz = new BossPatientZero(800, 360);
bz.spawnTimer = 0;
sceneBoss.director.zombies.push(bz);
const phasesSeen = new Set([bz.phase]);
// Drop HP in increments and watch phase transitions.
bz.takeDamage(bz.maxHp * 0.40);  // → phase 2
phasesSeen.add(bz.phase);
bz.takeDamage(bz.maxHp * 0.40);  // → phase 3
phasesSeen.add(bz.phase);
let bossDefeated = false;
const handler = () => { bossDefeated = true; };
const { events: busM6 } = await import('./src/engine/EventBus.js');
busM6.on('BOSS_DEFEATED', handler);
bz.takeDamage(bz.maxHp);          // kill
busM6.off('BOSS_DEFEATED', handler);
if (!phasesSeen.has(2) || !phasesSeen.has(3) || !bossDefeated) {
  console.error('[FAIL] boss did not transition phases or emit defeat');
  process.exit(1);
}
console.log(`[ok] boss phases: ${[...phasesSeen].join(' → ')}, defeated=${bossDefeated}`);

// ── M7: dev console smoke ──
const { installDevConsole } = await import('./src/DevConsole.js');
const { SceneManager } = await import('./src/engine/SceneManager.js');
const fakeSM = new SceneManager();
fakeSM.current = sceneBoss;
fakeSM.currentName = 'combat';
const dev = installDevConsole({
  sceneManager: fakeSM,
  audio,
  renderer: null,
  engine: { stop() {}, start() {} },
});
const snapBefore = dev.snapshot();
dev.giveAllWeapons();
dev.refillAmmo();
const snapAfter = dev.snapshot();
if (snapAfter.player.inventory.length <= snapBefore.player.inventory.length) {
  console.error('[FAIL] dev.giveAllWeapons did not extend inventory');
  process.exit(1);
}
console.log(`[ok] dev console: snapshot.inventory ${snapBefore.player.inventory.length} → ${snapAfter.player.inventory.length} weapons`);

// godmode
dev.godmode(true);
const hpBefore = sceneBoss.player.hp;
sceneBoss.player.takeDamage(99);
if (sceneBoss.player.hp !== hpBefore) {
  console.error('[FAIL] godmode did not block damage');
  process.exit(1);
}
dev.godmode(false);
console.log('[ok] dev.godmode prevents player damage');
