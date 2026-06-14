// "Quiet Cache" — the low-risk option. No zombies, just nerves: a needle sweeps
// a bar and you press SPACE to lock it in the shrinking green core, three times.
// Safe, quick, modest reward — the choice when you can't afford to get bitten.

import { Minigame } from './Minigame.js';
import { VIEW, PAL } from '../Config.js';
import { events } from '../engine/EventBus.js';
import { clamp } from '../util/math.js';

export class SteadyHands extends Minigame {
  start() {
    this.title = 'QUIET CACHE';
    this.objective = 'Steady hands — lock the needle in the green';
    this.controls = 'SPACE / CLICK to lock   ·   3 rounds';
    this.rounds = 3;
    this.round = 0;
    this.score = 0;
    this.hits = 0;
    this.perfects = 0;
    this.done = false;
    this.flash = 0;
    this.lastResult = '';
    this.t = 0;
    this._newRound();
  }

  _newRound() {
    this.needle = Math.random() * 0.3;
    this.dir = 1;
    this.speed = 0.85 + this.round * 0.33;
    this.sweet = 0.22 + Math.random() * 0.56;
    this.sweetW = 0.2 - this.round * 0.035;
    this.coreW = 0.07 - this.round * 0.012;
    this.locked = false;
    this.lockPos = 0;
    this.resultTimer = 0;
  }

  update(dt, input) {
    if (this.done) return;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;

    if (this.locked) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this.round++;
        if (this.round >= this.rounds) this.done = true;
        else this._newRound();
      }
      return;
    }
    this.needle += this.dir * this.speed * dt;
    if (this.needle >= 1) { this.needle = 1; this.dir = -1; }
    if (this.needle <= 0) { this.needle = 0; this.dir = 1; }
    if (input.consumeKey(' ') || input.consumeClick()) this._lock();
  }

  _lock() {
    this.locked = true;
    this.lockPos = this.needle;
    this.resultTimer = 0.7;
    const d = Math.abs(this.needle - this.sweet);
    if (d <= this.coreW / 2) {
      this.score += 2; this.perfects++; this.hits++; this.lastResult = 'PERFECT';
      this.flash = 0.4; events.emit('SFX', 'scavenge_good');
    } else if (d <= this.sweetW / 2) {
      this.score += 1; this.hits++; this.lastResult = 'GOOD';
      this.flash = 0.25; events.emit('SFX', 'scavenge_good');
    } else {
      this.lastResult = 'MISS';
      events.emit('SFX', 'scavenge_bad');
    }
  }

  getResult() {
    const frac = clamp(this.score / 6, 0, 1);
    return { tier: this.score >= 6 ? 'S' : this.score >= 5 ? 'A' : this.score >= 3 ? 'B' : this.score >= 1 ? 'C' : 'D', frac };
  }

  render(ctx) {
    ctx.fillStyle = '#0a0d0c';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.accent;
    ctx.font = 'bold 24px monospace';
    ctx.fillText(this.title, VIEW.W / 2, 200);
    ctx.fillStyle = PAL.hud;
    ctx.font = '13px monospace';
    ctx.fillText(this.objective, VIEW.W / 2, 226);
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '11px monospace';
    ctx.fillText(`${this.controls}   —   round ${Math.min(this.round + 1, this.rounds)} / ${this.rounds}`, VIEW.W / 2, 248);

    const cx = VIEW.W / 2, cy = 340;
    const W = 620, H = 34, x = cx - W / 2, y = cy - H / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);

    const sw = this.sweetW * W, cwd = this.coreW * W, sx = x + this.sweet * W;
    ctx.fillStyle = 'rgba(95,191,106,0.35)';
    ctx.fillRect(sx - sw / 2, y, sw, H);
    ctx.fillStyle = 'rgba(127,255,138,0.7)';
    ctx.fillRect(sx - cwd / 2, y, cwd, H);

    const nx = x + (this.locked ? this.lockPos : this.needle) * W;
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : '#ffd27a';
    ctx.fillRect(nx - 2, y - 7, 4, H + 14);

    if (this.locked) {
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = this.lastResult === 'PERFECT' ? '#7fff8a' : this.lastResult === 'GOOD' ? '#5fbf6a' : '#d8662e';
      ctx.fillText(this.lastResult, cx, y + H + 34);
    }
    // Round pips.
    ctx.textAlign = 'center';
    for (let i = 0; i < this.rounds; i++) {
      ctx.fillStyle = i < this.round ? PAL.good : 'rgba(255,255,255,0.15)';
      ctx.fillRect(cx - 30 + i * 22, y + H + 50, 14, 6);
    }
  }
}
