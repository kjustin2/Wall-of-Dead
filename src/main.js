// Entry point. Sets up the fixed-resolution canvas, builds the Game, starts
// at the title screen, and runs the engine loop. The canvas renders at a
// fixed 1280x720 and is scaled to the window by CSS (see style.css); input
// maps pointer coordinates back into that space.

import { VIEW } from './Config.js';
import { Engine } from './engine/Engine.js';
import { Game } from './game/Game.js';

const canvas = document.getElementById('game');
canvas.width = VIEW.W;
canvas.height = VIEW.H;

const game = new Game(canvas);
game.toTitle();

const engine = new Engine(
  (dt) => game.update(dt),
  () => game.render(),
);
engine.start();

// Debug handle.
window._wod = { game, engine };
