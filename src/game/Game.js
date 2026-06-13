// Top-level controller: owns the shared services (input, audio, particles,
// camera) and the run-wide state, and routes update/render to the active
// scene. Scene transitions are explicit methods so the flow reads top-down:
// title → night → day → night → … → victory (or game over).

import { VIEW, RUN } from '../Config.js';
import { Input } from '../engine/Input.js';
import { Audio } from '../engine/Audio.js';
import { Particles } from '../engine/Particles.js';
import { Camera } from '../engine/Camera.js';
import { makeLoadout } from './Weapons.js';

import { TitleScene } from '../scenes/TitleScene.js';
import { NightScene } from '../scenes/NightScene.js';
import { DayScene } from '../scenes/DayScene.js';
import { GameOverScene } from '../scenes/GameOverScene.js';
import { VictoryScene } from '../scenes/VictoryScene.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.particles = new Particles();
    this.camera = new Camera();
    this.scene = null;
    this.run = this._freshRun();
  }

  _freshRun() {
    return {
      night: 1,
      leg: 0,
      legsTotal: RUN.legsToSafeZone,
      wallMaxHp: RUN.wallMaxHp,
      wallHp: RUN.wallMaxHp,
      playerHp: 100,
      weapons: [makeLoadout('pistol', 96)],   // a comfortable starting cushion
      companions: [],
      deathReason: '',
      stats: { kills: 0, nightsSurvived: 0 },
    };
  }

  setScene(scene) {
    if (this.scene) this.scene.exit();
    this.particles.clear();
    this.scene = scene;
    scene.enter();
  }

  // ── Transitions ──
  toTitle() { this.run = this._freshRun(); this.setScene(new TitleScene(this)); }
  startRun() { this.run = this._freshRun(); this.toNight(); }
  toNight() { this.setScene(new NightScene(this)); }
  toDay(summary) {
    // A successful final night skips straight to victory.
    if (this.run.stats.nightsSurvived >= this.run.legsTotal) this.toVictory();
    else this.setScene(new DayScene(this, summary));
  }
  toGameOver() { this.setScene(new GameOverScene(this)); }
  toVictory() { this.setScene(new VictoryScene(this)); }

  update(dt) {
    if (this.scene) this.scene.update(dt);
    this.input.clearFrame();
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    if (this.scene) this.scene.render(ctx);
  }
}
