// Entry point. Wires the engine, renderer, input, and scene manager, then
// hands control to the scene currently registered. Stays small on purpose:
// roguehero2's main.js grew to ~9925 lines because every state machine
// branch lived here. We keep that complexity inside individual Scenes.

import { events } from './engine/EventBus.js';
import { Engine } from './engine/Engine.js';
import { InputManager } from './engine/Input.js';
import { Renderer } from './engine/Renderer.js';
import { SceneManager } from './engine/SceneManager.js';
import { AudioSystem, bindAudioEvents } from './engine/Audio.js';
import { CANVAS } from './Config.js';

import { BootScene }     from './scenes/BootScene.js';
import { IntroScene }    from './scenes/IntroScene.js';
import { BaseCampScene } from './scenes/BaseCampScene.js';
import { MapScene }      from './scenes/MapScene.js';
import { ScavengeScene } from './scenes/ScavengeScene.js';
import { ShopScene }     from './scenes/ShopScene.js';
import { EventScene }    from './scenes/EventScene.js';
import { CombatScene }   from './scenes/CombatScene.js';
import { RoadScene }     from './scenes/RoadScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { VictoryScene }  from './scenes/VictoryScene.js';
import { MetaScene }     from './scenes/MetaScene.js';
import { meta }          from './engine/MetaProgress.js';
import { runState }      from './world/RunState.js';
import { installDevConsole } from './DevConsole.js';

// ── Canvas setup ──
const canvas = document.getElementById('game');
canvas.width = CANVAS.width;
canvas.height = CANVAS.height;

function fitCanvasToWindow() {
  // Keep an internal logical resolution but scale via CSS so any window size
  // shows the full play area without changing game-coordinate units.
  const ratio = CANVAS.width / CANVAS.height;
  const winRatio = window.innerWidth / window.innerHeight;
  let cssW, cssH;
  if (winRatio > ratio) {
    cssH = window.innerHeight;
    cssW = cssH * ratio;
  } else {
    cssW = window.innerWidth;
    cssH = cssW / ratio;
  }
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
}
fitCanvasToWindow();
window.addEventListener('resize', fitCanvasToWindow);

// ── Core systems ──
const input = new InputManager(canvas);
const renderer = new Renderer(canvas);
const sceneManager = new SceneManager();

const audio = new AudioSystem();
bindAudioEvents(audio);
// First user gesture unlocks AudioContext per browser policy. BootScene's
// "click to begin" routes here so SFX work from the very first transition.
events.on('SCENE_ENTERED', ({ name }) => {
  if (name !== 'boot' && !audio.ctx) audio.init();
});

// Apply persisted volume on boot.
audio.setMasterVolume(meta.state.masterVolume);

// ── Scenes ──
sceneManager.register('boot',     new BootScene(input));
sceneManager.register('intro',    new IntroScene(input));
sceneManager.register('baseCamp', new BaseCampScene(input));
sceneManager.register('map',      new MapScene(input));
sceneManager.register('scavenge', new ScavengeScene(input));
sceneManager.register('shop',     new ShopScene(input));
sceneManager.register('event',    new EventScene(input));
sceneManager.register('combat',   new CombatScene(input, audio));
sceneManager.register('road',     new RoadScene(input, audio));
sceneManager.register('gameOver', new GameOverScene(input));
sceneManager.register('victory',  new VictoryScene(input));
sceneManager.register('meta',     new MetaScene(input));

// ── Engine ──
function update(dt, realDt) {
  sceneManager.update(dt, realDt);
  renderer.updateShake(realDt);
  renderer.updateCA(realDt);
  input.clearFrame();
}

function render() {
  const ctx = renderer.ctx;
  renderer.clear();
  renderer.beginShakeScope();
  sceneManager.render(ctx);
  renderer.endShakeScope();
  renderer.drawCAFlash();
  renderer.drawVignette();
  renderer.drawScanlines();
}

const engine = new Engine(update, render, () => sceneManager.getState());

// ── Boot ──
sceneManager.go('boot');
engine.start();

// ── Dev hooks ──
window._wod = {
  events,
  input,
  renderer,
  sceneManager,
  engine,
  audio,
  meta,
  runState,
  go: (name, params) => events.emit('SCENE_CHANGE', { name, params }),
  listenerCounts: () => events.counts(),
  resetMeta: () => meta.resetAll(),
};
installDevConsole({ sceneManager, audio, renderer, engine });
