// Base scene. Scenes own their own update/render and read input/audio/etc.
// from the Game they're attached to. Lifecycle: enter() once on activation,
// exit() once on leaving. Keep state in the scene, run-wide data on game.run.

export class Scene {
  constructor(game) {
    this.game = game;
    this.pausable = false;   // set true on scenes where ESC opens the pause menu
  }
  get input() { return this.game.input; }
  get audio() { return this.game.audio; }
  get particles() { return this.game.particles; }
  get camera() { return this.game.camera; }
  get run() { return this.game.run; }

  enter() {}
  exit() {}
  update(dt) {}
  render(ctx) {}
}
