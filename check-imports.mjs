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
  './src/world/Floor.js',
  './src/world/FloorDefs.js',
  './src/world/Interactables.js',
  './src/world/ScareEvents.js',
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
  './src/world/Narrative.js',
  './src/world/RoadDefs.js',
  './src/scenes/RoadScene.js',
  './src/world/ChaseEntity.js',
  './src/world/Zone.js',
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
sessionStorage.removeItem('wod_run_v2');
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

// ── Horror overhaul checkpoints ───────────────────────────────────────

// FloorDef structural validation — every interactable.type, scareEvent.do,
// and ambientCue resolves to a real implementation. Catches typos like
// the `distant_scream` vs `scream_distant` mix-up at author-time.
const { FLOORS, validateFloorDefs, getFloorForNight } = await import('./src/world/FloorDefs.js');
const floorErrors = validateFloorDefs();
if (floorErrors.length) {
  console.error('[FAIL] FloorDef validation:');
  for (const e of floorErrors) console.error('  -', e);
  process.exit(1);
}
// Also verify ambient sfxIds resolve to real synth entries.
const audioMod = await import('./src/engine/Audio.js');
// We don't have direct access to the SFX dict (it's not exported), but we
// can introspect via a stub AudioSystem and rely on bindAudioEvents not
// throwing. Instead, rebuild the expected catalog by inspecting playSfx
// behavior: every cue in every FloorDef.ambientCues must be a string.
let cueCount = 0;
for (const f of FLOORS) {
  for (const id of (f.ambientCues || [])) {
    if (typeof id !== 'string' || !id) {
      console.error(`[FAIL] floor ${f.id} has bad ambient cue:`, id);
      process.exit(1);
    }
    cueCount++;
  }
}
console.log(`[ok] FloorDefs: ${FLOORS.length} floors validated, ${cueCount} ambient cues`);

// Multi-gun starter: a fresh run begins with TWO weapons (primary + bat).
// Anything other than 2 means the starter loadout was reverted accidentally.
sessionStorage.removeItem('wod_run_v1');
sessionStorage.removeItem('wod_run_v2');
runState.start({ seed: 7777, starterId: 'pistol' });
if (runState.player.inventory.length !== 2) {
  console.error('[FAIL] starter inventory should have 2 weapons (primary + bat), got',
    runState.player.inventory.length);
  process.exit(1);
}
const ids = runState.player.inventory.map(w => w.id);
if (!ids.includes('pistol') || !ids.includes('bat')) {
  console.error('[FAIL] starter inventory missing pistol or bat:', ids);
  process.exit(1);
}
console.log(`[ok] starter loadout: ${ids.join(' + ')}`);

// BGM disabled: playBgm should NOT create an HTMLAudioElement under the
// current flag. Probe by calling it and checking the system's `_bgm` slot.
const bgmAudio = new audioMod.AudioSystem();
bgmAudio.init();
bgmAudio.playBgm('night');
if (bgmAudio._bgm !== null) {
  console.error('[FAIL] BGM should be disabled but playBgm() created an Audio element');
  process.exit(1);
}
console.log('[ok] BGM_DISABLED: playBgm() is a no-op as expected');

// Floor instantiation: build a Floor from a real FloorDef, verify clamp
// pushes a circle out of an authored wall, and perimeterSpawn returns a
// point inside the bounds. Uses the parking garage (single-zone) since
// Night 1 is now multi-zone — see the Phase 2 block below for that.
const { Floor } = await import('./src/world/Floor.js');
const def = FLOORS[1];                  // parking_garage (flat, single-zone)
const floor = new Floor(def);
const ent = { x: def.walls[0].x + def.walls[0].w / 2, y: def.walls[0].y + def.walls[0].h / 2, r: 14 };
floor.clamp(ent);
const inside = ent.x > def.walls[0].x && ent.x < def.walls[0].x + def.walls[0].w
            && ent.y > def.walls[0].y && ent.y < def.walls[0].y + def.walls[0].h;
if (inside) {
  console.error('[FAIL] Floor.clamp did not push entity out of authored wall');
  process.exit(1);
}
const sp = floor.perimeterSpawn(Math.random);
if (sp.x < 0 || sp.x > floor.w || sp.y < 0 || sp.y > floor.h) {
  console.error('[FAIL] perimeterSpawn returned out-of-bounds point:', sp);
  process.exit(1);
}
console.log(`[ok] Floor (${def.id}): clamp pushes out walls, spawn returns valid point`);

// Interactable factory: every type from FloorDefs builds successfully and
// has the required runtime fields. Walks zone interactables for multi-
// zone floors (Phase 2) and the flat list for single-zone legacy floors.
const { buildInteractable } = await import('./src/world/Interactables.js');
let builtCount = 0;
function _floorSpecs(f) {
  if (Array.isArray(f.zones) && f.zones.length > 0) {
    const out = [];
    for (const z of f.zones) for (const s of (z.interactables || [])) out.push({ s, zoneId: z.id });
    return out;
  }
  return (f.interactables || []).map(s => ({ s, zoneId: null }));
}
for (const f of FLOORS) {
  for (const { s: spec, zoneId } of _floorSpecs(f)) {
    const it = buildInteractable(spec);
    if (!it || it.type !== spec.type || typeof it.update !== 'function' || typeof it.draw !== 'function') {
      console.error(`[FAIL] interactable ${spec.type} on floor ${f.id}${zoneId ? '/' + zoneId : ''} not built correctly`);
      process.exit(1);
    }
    builtCount++;
  }
}
console.log(`[ok] interactables: ${builtCount} built across ${FLOORS.length} floors`);

// ScareEventRunner: tick on a stub scene with elapsed=20s; expect at
// least one time-trigger to fire when elapsed crosses its `after`.
const { ScareEventRunner } = await import('./src/world/ScareEvents.js');
const stubScene = {
  player: { x: 640, y: 360, hp: 100, maxHp: 100, kills: 0 },
  director: { zombies: [], spawnedInWave: 1, waveIdx: 0 },
  audio: { playSfx() {} },
  particles: { _pushParticle() {} },
  interactables: [],
};
// Multi-zone Night 1's scare events live on each zone — pull the lobby
// zone's events for this check so we test the runner on a non-empty list.
const _scareSrc = (FLOORS[0].zones && FLOORS[0].zones[0]) || FLOORS[0];
const runner = new ScareEventRunner({ scareEvents: _scareSrc.scareEvents || [] });
runner.tick(20, stubScene);
const firedCount = runner.triggers.filter(t => t.fired).length;
if (firedCount < 1) {
  console.error('[FAIL] no scare events fired after 20s on apartment_lobby');
  process.exit(1);
}
console.log(`[ok] scare events: ${firedCount}/${runner.triggers.length} triggers fired by t=20s`);

// Floor selection by night number: nights 1..6 should map to non-boss
// floors, night 7 (boss flag) should map to the boss floor.
const f1 = getFloorForNight(1, false);
const fBoss = getFloorForNight(7, true);
if (!f1 || !fBoss || f1.id === fBoss.id || fBoss.id !== 'boss_floor') {
  console.error('[FAIL] getFloorForNight wiring wrong:', f1 && f1.id, '/', fBoss && fBoss.id);
  process.exit(1);
}
console.log(`[ok] floor selection: night1=${f1.id}, boss=${fBoss.id}`);

// MapUI render path: build a map UI, lay it out against a real graph, and
// call draw() with the FakeCtx — confirms the apocalypse-road rewrite
// doesn't throw on any code path the headless harness can reach.
const { MapUI } = await import('./src/ui/MapUI.js');
const mapUi = new MapUI();
mapUi.layout(runState.graph, 1280, 720);
mapUi.updateHover(640, 360, runState.currentNodeId, runState.graph);
mapUi.draw(new FakeCtx(), runState.graph, runState.currentNodeId);
console.log('[ok] MapUI apocalypse road: layout + hover + draw run without exception');

// ── Phase 1: combat impact baseline ──
// Each test below isolates one piece of the "feels big" overhaul. The
// shared rig drives a single shambler in a fresh CombatScene so the
// WaveDirector's ambient spawns don't pollute the kill/knockback math.
function _phase1Rig(weaponId) {
  const s = new CombatScene(input, audio);
  s.enter({ seed: 1, nightNum: 1 });
  s.player.inventory.length = 0;
  s.player.inventory.push(new Weapon(WEAPONS[weaponId]));
  s.player.currentWeaponIdx = 0;
  s.director.zombies.length = 0;
  const z = new Sh2(s.player.x + 80, s.player.y);
  z.spawnTimer = 0;
  s.director.zombies.push(z);
  return { scene: s, target: z };
}

// 1. Universal hit-stop fires on every bullet impact (not just opt-in weapons).
{
  const { scene, target } = _phase1Rig('pistol');
  let stopFired = false;
  const onStop = () => { stopFired = true; };
  bus.on('HIT_STOP', onStop);
  // Drive a single pistol shot.
  input.mouse.x = target.x; input.mouse.y = target.y;
  input.mouse.leftDown = false;
  scene.update(1 / 60);                      // arm fire
  input.mouse.leftDown = true;
  for (let i = 0; i < 30 && !stopFired; i++) {
    scene.update(1 / 60); input.clearFrame();
    input.mouse.leftDown = (i % 2 === 0);    // semi-auto edge-trigger
  }
  bus.off('HIT_STOP', onStop);
  if (!stopFired) {
    console.error('[FAIL] pistol hit did not fire universal HIT_STOP');
    process.exit(1);
  }
  console.log('[ok] universal hit-stop: pistol shot emitted HIT_STOP');
}

// 2. Casing ejected on bullet fire (particle pool grew by at least one).
{
  const { scene, target } = _phase1Rig('pistol');
  input.mouse.x = target.x; input.mouse.y = target.y;
  input.mouse.leftDown = false;
  scene.update(1 / 60);                      // arm
  const before = scene.particles.particles.length;
  input.mouse.leftDown = true;
  scene.update(1 / 60);                      // first shot frame
  input.clearFrame();
  const after = scene.particles.particles.length;
  if (after <= before) {
    console.error(`[FAIL] no casing/muzzle particles spawned on pistol fire (before=${before} after=${after})`);
    process.exit(1);
  }
  console.log(`[ok] casings + muzzle: particles grew ${before}→${after} on pistol fire`);
}

// 3. Shotgun knocks a zombie back along the impact direction.
{
  const { scene, target } = _phase1Rig('shotgun');
  const xBefore = target.x;
  input.mouse.x = target.x; input.mouse.y = target.y;
  input.mouse.leftDown = false;
  scene.update(1 / 60);                      // arm
  input.mouse.leftDown = true;
  // One shotgun pull, then let knockback play out a few frames.
  for (let i = 0; i < 18; i++) {
    scene.update(1 / 60); input.clearFrame();
    input.mouse.leftDown = false;
  }
  // Either the target was knocked back (if alive) OR it was killed outright
  // (8 pellets × 9 dmg ≫ 32 HP shambler). Either is a pass — the absence of
  // BOTH means knockback didn't apply.
  const knocked = !target.alive || target.x > xBefore + 4;
  if (!knocked) {
    console.error(`[FAIL] shotgun knockback: target.x ${xBefore}→${target.x}, alive=${target.alive}`);
    process.exit(1);
  }
  console.log(`[ok] shotgun knockback: target ${xBefore.toFixed(1)}→${target.x.toFixed(1)} alive=${target.alive}`);
}

// ── Phase 2: multi-zone Floor + zone transitions ──
// Apartment Night 1 has 4 zones: lobby → stairwell → hallway → roof.
// Walking the player into the lobby's eastern WallDoor should swap the
// active zone to 'stairwell' on the very next update tick — no scene
// change, no listener leak, just a data swap.
{
  // Suspend the active run so CombatScene takes the runState path
  // (which uses Floor instead of Arena).
  if (!runState.active) {
    sessionStorage.removeItem('wod_run_v2');
    runState.start({ seed: 4242, starterId: 'pistol' });
  }
  const beforeCounts = JSON.stringify(bus.counts());
  const sceneZ = new CombatScene(input, audio);
  sceneZ.enter({ seed: 4242, nightNum: 1 });
  if (!sceneZ.arena.isMultiZone) {
    console.error('[FAIL] Apartment Night 1 should be a multi-zone Floor');
    process.exit(1);
  }
  if (sceneZ.arena.activeZoneId !== 'lobby') {
    console.error(`[FAIL] expected entry zone 'lobby', got '${sceneZ.arena.activeZoneId}'`);
    process.exit(1);
  }
  // Find the lobby's WallDoor → stairwell. Place the player on top of
  // the door and tick once.
  const door = sceneZ.interactables.find(it => it.type === 'WallDoor' && it.targetZoneId === 'stairwell');
  if (!door) {
    console.error('[FAIL] lobby WallDoor → stairwell missing');
    process.exit(1);
  }
  sceneZ.player.x = door.x;
  sceneZ.player.y = door.y;
  sceneZ.update(1 / 60);
  if (sceneZ.arena.activeZoneId !== 'stairwell') {
    console.error(`[FAIL] zone did not swap on door overlap; activeZoneId=${sceneZ.arena.activeZoneId}`);
    process.exit(1);
  }
  // Player should now be at the entry point inside stairwell, not still
  // on top of the door.
  if (sceneZ.player.x === door.x) {
    console.error('[FAIL] player not repositioned on zone transition');
    process.exit(1);
  }
  // Interactables should be from the stairwell now (two WallDoors).
  const wdCount = sceneZ.interactables.filter(it => it.type === 'WallDoor').length;
  if (wdCount !== 2) {
    console.error(`[FAIL] stairwell should have 2 WallDoors, has ${wdCount}`);
    process.exit(1);
  }
  // Listener counts should not have grown — zone change must be a data
  // swap, not new bus subscriptions.
  sceneZ.exit();
  const afterCounts = JSON.stringify(bus.counts());
  if (beforeCounts !== afterCounts) {
    console.error('[FAIL] listener leak across multi-zone enter/exit');
    console.error('before:', beforeCounts);
    console.error(' after:', afterCounts);
    process.exit(1);
  }
  console.log(`[ok] multi-zone: lobby → stairwell on door overlap, no listener leak`);
}

// ── Phase 3: fork checkpoints + chase pursuer + respawn ──
// Hallway is a fork (3 WallDoors); stairwell_down is the chase branch.
// Stepping into the basement-shortcut WallDoor should:
//   - swap zone to stairwell_down
//   - spawn a ChaseEntity in scene.hazards
//   - run the slam_doors scare without throwing
// And: the player should already have a checkpoint pushed at the fork
// (the moment they entered the hallway).
{
  if (!runState.active) {
    sessionStorage.removeItem('wod_run_v2');
    runState.start({ seed: 5151, starterId: 'pistol' });
  }
  // Drop any leftover checkpoints from earlier tests so the assertions
  // below are reasoning about THIS scene only.
  runState.checkpointStack.length = 0;

  const sceneFork = new CombatScene(input, audio);
  sceneFork.enter({ seed: 5151, nightNum: 1 });
  // Manually warp to the hallway (the fork) — skip the lobby/stairwell.
  sceneFork.arena.setActiveZone('hallway', { x: 640, y: 360 });
  if (sceneFork.arena.activeZoneId !== 'hallway' || sceneFork.arena.activeZone.kind !== 'fork') {
    console.error(`[FAIL] hallway zone wrong: id=${sceneFork.arena.activeZoneId} kind=${sceneFork.arena.activeZone.kind}`);
    process.exit(1);
  }
  if (runState.checkpointStack.length === 0) {
    console.error('[FAIL] checkpoint not pushed on fork entry');
    process.exit(1);
  }
  if (runState.checkpointStack[runState.checkpointStack.length - 1].currentZoneId !== 'hallway') {
    console.error('[FAIL] checkpoint top is not hallway');
    process.exit(1);
  }
  console.log('[ok] fork entry pushed checkpoint at hallway');

  // Find the hallway → stairwell_down WallDoor and step on it.
  const chaseDoor = sceneFork.interactables.find(it => it.type === 'WallDoor' && it.targetZoneId === 'stairwell_down');
  if (!chaseDoor) { console.error('[FAIL] basement WallDoor missing from hallway'); process.exit(1); }
  sceneFork.player.x = chaseDoor.x;
  sceneFork.player.y = chaseDoor.y;
  sceneFork.update(1 / 60);
  if (sceneFork.arena.activeZoneId !== 'stairwell_down') {
    console.error(`[FAIL] basement transition failed; activeZoneId=${sceneFork.arena.activeZoneId}`);
    process.exit(1);
  }
  if (sceneFork.hazards.length === 0) {
    console.error('[FAIL] ChaseEntity not spawned in chase zone');
    process.exit(1);
  }
  console.log(`[ok] chase zone: ChaseEntity spawned, hazards=${sceneFork.hazards.length}`);

  // Tick a frame so the scare runner has a chance to fire slam_doors
  // (its trigger is time-after 0.4s; 1 frame at dt=1/60 is too short,
  // so we tick 30 frames). Verify no exception escapes.
  for (let i = 0; i < 30; i++) sceneFork.update(1 / 60);
  // The Door interactable should have closed=true after slam_doors fired.
  const doorIA = sceneFork.interactables.find(it => it.type === 'Door');
  if (!doorIA || !doorIA.closed) {
    console.error(`[FAIL] slam_doors did not close the chase entry Door (closed=${doorIA && doorIA.closed})`);
    process.exit(1);
  }
  console.log('[ok] slam_doors fired — chase entry Door is closed');

  // Stand still and let the chase catch us. Earlier tests held 'd' / LMB
  // — clear them so the player actually stops, otherwise the player's
  // base speed (240) outpaces the chaser (220) and escape is automatic.
  input.keys.clear();
  input.justPressed.clear();
  input.mouse.leftDown = false;
  sceneFork.player.x = 200;
  sceneFork.player.y = 360;
  sceneFork.player.iframe = 0;
  // Snapshot the checkpoint stack BEFORE death so we can verify a
  // checkpoint exists for the respawn.
  if (runState.checkpointStack.length === 0) {
    console.error('[FAIL] no checkpoint available for respawn test');
    process.exit(1);
  }
  let caught = false;
  for (let i = 0; i < 60 * 8 && !sceneFork.dead; i++) {
    sceneFork.update(1 / 60);
    if (sceneFork.dead) caught = true;
  }
  if (!caught) {
    console.error('[FAIL] stationary player was not caught by chase entity in 8s');
    process.exit(1);
  }
  console.log('[ok] chase: stationary player caught, scene marked dead');

  // Tick past the deathDelay so the respawn handler runs.
  const hpBefore = sceneFork.player.hp;
  for (let i = 0; i < 60 * 3; i++) sceneFork.update(1 / 60);
  // Respawn either succeeded (player back in hallway, hp restored) OR
  // game over fired (no checkpoint). We pre-checked checkpoint exists,
  // so respawn should win.
  if (sceneFork.dead) {
    console.error('[FAIL] player still dead after respawn delay');
    process.exit(1);
  }
  if (sceneFork.arena.activeZoneId !== 'hallway') {
    console.error(`[FAIL] respawn did not return to hallway; activeZoneId=${sceneFork.arena.activeZoneId}`);
    process.exit(1);
  }
  if (sceneFork.player.hp <= hpBefore) {
    console.error(`[FAIL] respawn did not restore HP (before=${hpBefore} after=${sceneFork.player.hp})`);
    process.exit(1);
  }
  console.log(`[ok] respawn: player back in hallway with hp ${hpBefore.toFixed(0)} → ${sceneFork.player.hp.toFixed(0)}`);

  sceneFork.exit();
}

// ── Phase 4: narrative interactables (note + tape) ──
// The roof zone of Apartment Night 1 owns one NarrativeNote + one
// VoiceTape. Walking the player onto each should mark it consumed
// (alive=false) and add the id to runState.notesRead / tapesPlayed.
{
  // Make sure runState is active so NOTE_READ/TAPE_PLAYED listeners
  // actually persist the pickup.
  if (!runState.active) {
    sessionStorage.removeItem('wod_run_v2');
    runState.start({ seed: 6262, starterId: 'pistol' });
  }
  runState.notesRead.length = 0;
  runState.tapesPlayed.length = 0;

  const sceneN = new CombatScene(input, audio);
  sceneN.enter({ seed: 6262, nightNum: 1 });
  sceneN.arena.setActiveZone('roof', { x: 120, y: 540 });

  const note = sceneN.interactables.find(it => it.type === 'NarrativeNote');
  const tape = sceneN.interactables.find(it => it.type === 'VoiceTape');
  if (!note) { console.error('[FAIL] NarrativeNote missing from roof zone'); process.exit(1); }
  if (!tape) { console.error('[FAIL] VoiceTape missing from roof zone'); process.exit(1); }

  // Pickup note: place player on it, advance one frame.
  sceneN.player.x = note.x;
  sceneN.player.y = note.y;
  sceneN.update(1 / 60);
  if (note.alive) {
    console.error('[FAIL] NarrativeNote still alive after player overlap');
    process.exit(1);
  }
  if (!runState.notesRead.includes(note.noteId)) {
    console.error(`[FAIL] runState.notesRead missing '${note.noteId}'`);
    process.exit(1);
  }
  if (!sceneN.hud.loreToast || sceneN.hud.loreToast.lines.length === 0) {
    console.error('[FAIL] lore toast not surfaced after note pickup');
    process.exit(1);
  }
  console.log(`[ok] narrative note: '${note.noteId}' read, lore toast shown, latched alive=false`);

  // Pickup tape.
  sceneN.player.x = tape.x;
  sceneN.player.y = tape.y;
  sceneN.update(1 / 60);
  if (tape.alive) {
    console.error('[FAIL] VoiceTape still alive after player overlap');
    process.exit(1);
  }
  if (!runState.tapesPlayed.includes(tape.tapeId)) {
    console.error(`[FAIL] runState.tapesPlayed missing '${tape.tapeId}'`);
    process.exit(1);
  }
  console.log(`[ok] voice tape: '${tape.tapeId}' played, runState updated`);

  sceneN.exit();
}

// ── Phase 5: RoadScene as playable transition ──
{
  const { RoadScene } = await import('./src/scenes/RoadScene.js');
  if (!runState.active) {
    sessionStorage.removeItem('wod_run_v2');
    runState.start({ seed: 7373, starterId: 'pistol' });
  }

  // Smoke 1: building + entering RoadScene drips at least one ambient
  // zombie within 3 seconds and doesn't throw on the render path.
  const roadCtx = new FakeCtx();
  const roadScene = new RoadScene(input, audio);
  roadScene.enter({});
  // Re-arm input — the fire-armed gate stays from prior tests.
  input.keys.clear();
  input.justPressed.clear();
  input.mouse.leftDown = false;
  // Tick ~3 seconds (180 frames at dt=1/60). The drip-spawner fires
  // first at ~1.2s and the cap is 4 — within 3s we should see ≥1.
  for (let i = 0; i < 180; i++) {
    roadScene.update(1 / 60);
    roadScene.render(roadCtx);
    input.clearFrame();
  }
  if (roadScene.zombies.length === 0) {
    console.error('[FAIL] road segment did not drip-spawn any ambient zombies in 3s');
    process.exit(1);
  }
  console.log(`[ok] road: ${roadScene.zombies.length} ambient zombie(s) spawned within 3s`);

  // Smoke 2: walking past the east threshold emits SCENE_CHANGE → 'map'
  // and clears runState.onRoad.
  let scIdx = 0, gotMap = false;
  const onSC = ({ name }) => { scIdx++; if (name === 'map') gotMap = true; };
  bus.on('SCENE_CHANGE', onSC);
  roadScene.player.x = 1240;        // past ROAD_EXIT_X (1200)
  roadScene.update(1 / 60);
  bus.off('SCENE_CHANGE', onSC);
  if (!gotMap) {
    console.error('[FAIL] crossing east threshold did not emit SCENE_CHANGE → map');
    process.exit(1);
  }
  if (runState.onRoad) {
    console.error('[FAIL] runState.onRoad still true after road exit');
    process.exit(1);
  }
  console.log('[ok] road exit: SCENE_CHANGE → map fired, onRoad cleared');

  roadScene.exit();

  // Smoke 3: 5x enter/exit listener-leak loop on RoadScene. The plan
  // flagged this as the highest Phase 5 risk.
  const leakBefore = JSON.stringify(bus.counts());
  for (let i = 0; i < 5; i++) {
    const s = new RoadScene(input, audio);
    s.enter({});
    s.exit();
  }
  const leakAfter = JSON.stringify(bus.counts());
  if (leakBefore !== leakAfter) {
    console.error('[FAIL] listener leak across 5 RoadScene enter/exit cycles');
    console.error('before:', leakBefore);
    console.error(' after:', leakAfter);
    process.exit(1);
  }
  console.log('[ok] road: no listener leak across 5 enter/exit cycles');

  // Smoke 4: a v2 snapshot with onRoad:true / roadProgress:0.5 round-trips.
  runState.onRoad = true;
  runState.roadProgress = 0.5;
  runState.persist();
  // Reset RunState in-memory then resume — the persisted onRoad/progress
  // should survive the round trip.
  runState.active = false;
  runState.graph = null;
  runState.onRoad = false;
  runState.roadProgress = 0;
  const ok = runState.resume();
  if (!ok || !runState.onRoad || Math.abs(runState.roadProgress - 0.5) > 0.001) {
    console.error(`[FAIL] road resume: ok=${ok} onRoad=${runState.onRoad} progress=${runState.roadProgress}`);
    process.exit(1);
  }
  console.log(`[ok] road resume: onRoad=${runState.onRoad} progress=${runState.roadProgress}`);
  // Reset for the rest of the suite.
  runState.onRoad = false;
  runState.roadProgress = 0;
  runState.persist();
}

// v1 → v2 migration: write a legacy v1 snapshot, call resume(), confirm
// the run loads with zone fields defaulted and the storage now holds v2.
{
  sessionStorage.removeItem('wod_run_v1');
  sessionStorage.removeItem('wod_run_v2');
  // Synthesize a minimal v1 snapshot. resolvedIds may be empty; player
  // record matches the v1 shape (no zone fields).
  const v1 = {
    seed: 9001,
    currentNodeId: 'n0_0',
    nightNum: 0,
    starterId: 'pistol',
    resolvedIds: [],
    player: {
      hp: 90, maxHp: 100, scrap: 17, kills: 4,
      currentWeaponIdx: 0,
      inventory: [{ id: 'pistol', mag: 8, reserve: 24 }, { id: 'bat', mag: 1, reserve: 0 }],
    },
  };
  sessionStorage.setItem('wod_run_v1', JSON.stringify(v1));
  // Reset RunState to a clean state so resume() actually does a load.
  runState.active = false;
  runState.graph = null;
  const ok = runState.resume();
  if (!ok) {
    console.error('[FAIL] v1 snapshot resume() returned false');
    process.exit(1);
  }
  if (runState.seed !== 9001 || runState.player.hp !== 90 || runState.player.scrap !== 17) {
    console.error('[FAIL] v1 snapshot fields not preserved through migration');
    process.exit(1);
  }
  if (runState.currentZoneId !== null || typeof runState.zoneStates !== 'object') {
    console.error('[FAIL] v2 default fields not added during migration');
    process.exit(1);
  }
  if (sessionStorage.getItem('wod_run_v1') !== null) {
    console.error('[FAIL] legacy v1 key not cleared after migration');
    process.exit(1);
  }
  if (!sessionStorage.getItem('wod_run_v2')) {
    console.error('[FAIL] v2 snapshot not written after migration');
    process.exit(1);
  }
  console.log('[ok] save migration: v1 snapshot upgrades to v2 with zone defaults');
}

// 4. Heavy-weapon kill emits KILL_THUMP and spawns chunks (overkill).
{
  const { scene, target } = _phase1Rig('sniper');
  let thumpFired = false;
  const onThump = () => { thumpFired = true; };
  bus.on('KILL_THUMP', onThump);
  target.hp = target.maxHp;                  // ensure the sniper one-shot is genuine overkill
  const partsBefore = scene.particles.particles.length;
  input.mouse.x = target.x; input.mouse.y = target.y;
  input.mouse.leftDown = false;
  scene.update(1 / 60);                      // arm
  input.mouse.leftDown = true;
  for (let i = 0; i < 40 && target.alive; i++) {
    scene.update(1 / 60); input.clearFrame();
    input.mouse.leftDown = (i % 2 === 0);
  }
  bus.off('KILL_THUMP', onThump);
  const partsAfter = scene.particles.particles.length;
  if (target.alive) {
    console.error('[FAIL] sniper failed to kill the target shambler');
    process.exit(1);
  }
  if (!thumpFired) {
    console.error('[FAIL] heavy-weapon kill did not emit KILL_THUMP');
    process.exit(1);
  }
  // Sniper is overkill (60 dmg vs 32 HP shambler) — chunks should be present.
  if (partsAfter <= partsBefore + 4) {
    console.error(`[FAIL] overkill chunks not spawned (particles ${partsBefore}→${partsAfter})`);
    process.exit(1);
  }
  console.log(`[ok] heavy kill: KILL_THUMP fired, particles ${partsBefore}→${partsAfter} (chunks present)`);
}
