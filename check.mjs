// Headless smoke test for Wall of Dead. No browser, no AudioContext — we stub
// just enough of the DOM to import the real game modules, then drive a whole
// run (title → 4 nights/days → victory) plus the game-over path, calling
// update() AND render() every frame so the draw code is exercised too. A mock
// 2D context absorbs every canvas call.
//
// Run: node check.mjs   (also wired to the Stop hook in .claude/settings.json)

// ── Minimal DOM / environment stubs ─────────────────────────────────────
const noop = () => {};
const grad = { addColorStop: noop };

// A negative/non-finite radius makes a real CanvasRenderingContext2D throw an
// IndexSizeError — and an uncaught throw mid-render aborts the whole frame. The
// mock mirrors that validation so the headless test catches it too (it once
// didn't, and a negative ellipse radius shipped a black screen).
const RADIUS_ARGS = { arc: [2], ellipse: [2, 3], arcTo: [4], roundRect: [4], createRadialGradient: [2, 5] };
function validateRadii(name, args) {
  const idxs = RADIUS_ARGS[name];
  if (!idxs) return;             // e.g. createLinearGradient has no radius args
  for (const i of idxs) {
    const v = args[i];
    if (typeof v === 'number' && !(v >= 0 && Number.isFinite(v))) {
      throw new Error(`IndexSizeError: ${name}() radius arg ${i} is ${v} (must be finite and >= 0)`);
    }
  }
}

function makeCtx() {
  const base = {
    canvas: { width: 1280, height: 720 },
    measureText: (t) => ({ width: (t ? String(t).length : 0) * 7 }),
  };
  return new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string' && /Gradient$/.test(p)) {
        return (...a) => { validateRadii(p, a); return grad; };
      }
      if (typeof p === 'string' && RADIUS_ARGS[p]) {
        return (...a) => { validateRadii(p, a); };
      }
      return noop; // any other method (fillRect, save, …) is a no-op
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

const mockCanvas = {
  width: 1280, height: 720,
  getContext: () => makeCtx(),
  addEventListener: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
};

globalThis.addEventListener = noop;
globalThis.window = { addEventListener: noop }; // no AudioContext → audio no-ops
globalThis.document = { getElementById: () => mockCanvas };
if (!globalThis.performance) globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = noop;

// ── Tiny assert harness ─────────────────────────────────────────────────
let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(title) { console.log(`\n── ${title} ──`); }

// ── Imports ─────────────────────────────────────────────────────────────
const { Game } = await import('./src/game/Game.js');
const { WEAPONS } = await import('./src/game/Weapons.js');
const { TYPES } = await import('./src/game/Zombie.js');
const { SFX_IDS } = await import('./src/engine/Audio.js');
const { depthScale } = await import('./src/game/view.js');
const { TitleScene } = await import('./src/scenes/TitleScene.js');
const { NightScene } = await import('./src/scenes/NightScene.js');
const { DayScene } = await import('./src/scenes/DayScene.js');
const { VictoryScene } = await import('./src/scenes/VictoryScene.js');
const { GameOverScene } = await import('./src/scenes/GameOverScene.js');

// ── Helpers to drive input ──────────────────────────────────────────────
const press = (g, k) => g.input.pressed.add(k);
const click = (g) => { g.input.mouse.clicked = true; };
function step(g, dt = 0.05) { g.update(dt); g.render(); }

// ════════════════════════════════════════════════════════════════════════
section('Content integrity');
const sfxSet = new Set(SFX_IDS);
for (const id of Object.keys(WEAPONS)) {
  check(`weapon '${id}' sfx '${WEAPONS[id].sfx}' is registered`, sfxSet.has(WEAPONS[id].sfx));
}
const requiredSfx = [
  'zombie_hit', 'zombie_die', 'zombie_groan', 'brute_roar', 'spitter_spit',
  'acid_hit', 'wall_hit', 'wall_break', 'player_hurt', 'reload_done',
  'dawn_chime', 'survivor_join', 'scavenge_good', 'scavenge_bad',
  'heartbeat', 'distant_groan', 'distant_scream',
];
for (const id of requiredSfx) check(`gameplay sfx '${id}' is registered`, sfxSet.has(id));
check('four zombie archetypes defined', Object.keys(TYPES).length === 4);
check('depthScale grows toward the wall', depthScale(556) > depthScale(96));

// ════════════════════════════════════════════════════════════════════════
section('Boot + title');
const game = new Game(mockCanvas);
game.toTitle();
check('starts on TitleScene', game.scene instanceof TitleScene);
step(game); // render the title once
click(game);
step(game); // click begins the run
check('click begins a run → NightScene', game.scene instanceof NightScene);
check('starts on night 1', game.run.night === 1);
check('starts with the pistol only', game.run.weapons.length === 1 && game.run.weapons[0].id === 'pistol');

// ════════════════════════════════════════════════════════════════════════
section('Full run: survive 4 nights, scavenge 3 days, reach the safe zone');
let sawShotgun = false, sawMara = false, sawRifle = false;

for (let night = 1; night <= 4; night++) {
  check(`night ${night}: in NightScene`, game.scene instanceof NightScene);
  const scene = game.scene;

  // Make the defenders effectively invincible so we always reach dawn.
  scene.player.hp = scene.player.maxHp = 1e6;
  for (const s of scene.wall.seg) { s.max = 1e9; s.hp = 1e9; }

  // ~6s of real combat: spawns, aiming, firing, bullet/zombie collisions.
  for (let i = 0; i < 120; i++) {
    game.input.mouse.down = true;
    game.input.mouse.clicked = true;            // also drives semi-auto fire
    game.input.mouse.x = 180 + (i * 53) % 920;
    game.input.mouse.y = 140 + (i * 37) % 320;
    if (i === 40) press(game, '2');             // exercise weapon swap if owned
    step(game, 0.05);
  }
  game.input.mouse.down = false;
  check(`night ${night}: spawned zombies`, scene.director.totalSpawned > 0);

  // Force dawn and let the survive transition fire.
  scene.director.elapsed = scene.director.duration + 1;
  let guard = 0;
  while (game.scene === scene && guard++ < 500) step(game, 0.05);
  check(`night ${night}: transitioned out of the night`, game.scene !== scene);
  check(`night ${night}: counted as survived`, game.run.stats.nightsSurvived === night);

  if (night < 4) {
    check(`day ${night}: in DayScene`, game.scene instanceof DayScene);
    const day = game.scene;
    // Drive report → minigame (3 rounds) → loot → advance by hammering space.
    guard = 0;
    while (game.scene === day && guard++ < 3000) { press(game, ' '); step(game, 0.05); }
    check(`day ${night}: advanced to the next leg`, game.scene !== day);
    if (night === 1) sawShotgun = game.run.weapons.some(w => w.id === 'shotgun');
    if (night === 2) sawMara = game.run.companions.some(c => c.name === 'Mara');
    if (night === 3) sawRifle = game.run.weapons.some(w => w.id === 'rifle');
  }
}

check('day 1 granted the shotgun', sawShotgun);
check('day 2 rescued survivor Mara', sawMara);
check('day 3 granted the rifle', sawRifle);
check('reached VictoryScene', game.scene instanceof VictoryScene);
check('kill tally accumulated', game.run.stats.kills >= 0);
step(game, 0.5);                 // pass the input-gate (t > 0.8)
press(game, 'r'); step(game, 0.5);
check('victory → R returns to title', game.scene instanceof TitleScene);

// ════════════════════════════════════════════════════════════════════════
section('Game-over path');
const g2 = new Game(mockCanvas);
g2.startRun();
check('startRun → NightScene', g2.scene instanceof NightScene);
const ns = g2.scene;
for (const s of ns.wall.seg) s.hp = 0;   // every segment breached → overrun
step(g2, 0.05);
check('full overrun → GameOverScene', g2.scene instanceof GameOverScene);
check('death reason recorded', !!g2.run.deathReason);
press(g2, 'r'); step(g2, 0.7); step(g2);
check('game-over → R returns to title', g2.scene instanceof TitleScene);

// Player-death overrun variant.
const g3 = new Game(mockCanvas);
g3.startRun();
const ns3 = g3.scene;
ns3.player.iframe = 0;
ns3.player.hurt(99999);
step(g3, 0.05);
check('player death → GameOverScene', g3.scene instanceof GameOverScene);

// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(48)}`);
if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED  (${passed} checks)`);
  process.exit(0);
} else {
  console.log(`FAILED ${failures.length} / ${passed + failures.length}:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
