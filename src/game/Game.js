// Top-level controller: owns the shared services (input, audio, particles,
// camera, lighting, post-FX) and the run-wide state, routes update/render to
// the active scene, and manages the ESC pause overlay + fade transitions.
// Flow reads top-down: title → night → day → … → victory (or game over).

import { VIEW, RUN } from '../Config.js';
import { Input } from '../engine/Input.js';
import { Audio } from '../engine/Audio.js';
import { Particles } from '../engine/Particles.js';
import { Camera } from '../engine/Camera.js';
import { Lighting } from '../engine/Lighting.js';
import { PostFX } from '../engine/PostFX.js';
import { makeLoadout } from './Weapons.js';
import { PauseMenu } from '../ui/PauseMenu.js';

import { TitleScene } from '../scenes/TitleScene.js';
import { NightScene } from '../scenes/NightScene.js';
import { DayScene } from '../scenes/DayScene.js';
import { GameOverScene } from '../scenes/GameOverScene.js';
import { VictoryScene } from '../scenes/VictoryScene.js';

const FADE_TIME = 0.4;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.particles = new Particles();
    this.camera = new Camera();
    this.lighting = new Lighting(VIEW.W, VIEW.H);
    this.postfx = new PostFX(VIEW.W, VIEW.H);
    this.scene = null;
    this.overlay = null;       // PauseMenu when paused, else null
    this.time = 0;
    this._fade = 0;            // 1 = black, decays to 0 (fade in)
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
      weapons: [makeLoadout('pistol', 96)],
      companions: [],
      deathReason: '',
      stats: { kills: 0, nightsSurvived: 0 },
    };
  }

  setScene(scene) {
    if (this.scene) this.scene.exit();
    this.overlay = null;
    this.particles.clear();
    this.scene = scene;
    this._fade = 1;
    scene.enter();
  }

  // ── Transitions ──
  toTitle() { this.run = this._freshRun(); this.setScene(new TitleScene(this)); }
  startRun() { this.run = this._freshRun(); this.toNight(); }
  toNight() { this.setScene(new NightScene(this)); }
  toDay(summary) {
    if (this.run.stats.nightsSurvived >= this.run.legsTotal) this.toVictory();
    else this.setScene(new DayScene(this, summary));
  }
  toGameOver() { this.setScene(new GameOverScene(this)); }
  toVictory() { this.setScene(new VictoryScene(this)); }

  // ── Pause ──
  get paused() { return !!this.overlay; }
  resume() { this.overlay = null; }
  restartRun() { this.overlay = null; this.startRun(); }
  quitToMenu() { this.overlay = null; this.toTitle(); }

  update(dt) {
    this.time += dt;
    if (this._fade > 0) this._fade = Math.max(0, this._fade - dt / FADE_TIME);

    if (this.overlay) {
      this.overlay.update(this.input, dt);
    } else if (this.scene) {
      // ESC opens the pause menu on pausable scenes (not on a fade-in frame).
      if (this.scene.pausable && this._fade < 0.5 && this.input.consumeKey('escape')) {
        this.audio.play('ui_click');
        this.overlay = new PauseMenu(this);
      } else {
        this.scene.update(dt);
      }
    }
    this.input.clearFrame();
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    if (this.scene) this.scene.render(ctx);
    if (this.overlay) this.overlay.render(ctx);

    // Film grain over everything for texture (very subtle).
    this.postfx.grain(ctx, 0.03, this.time);

    if (this._fade > 0) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(0,0,0,${this._fade})`;
      ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    }
  }
}
