// SimonGame: a four-quadrant repeat-the-sequence minigame. The board flashes
// a sequence of N colored quadrants, then the player has to press them back
// in order using 1/2/3/4 (or click). Each correct press advances; a wrong
// press or step-timeout counts as a miss but the game continues so the
// player still has a chance at a partial-credit tier.
//
// Quadrant layout:
//   1 (top-left, red)     2 (top-right, blue)
//   3 (bot-left, green)   4 (bot-right, yellow)

import { Minigame, scoreToTier } from './Minigame.js';
import { PALETTE } from '../Config.js';

const QUADRANTS = [
  { id: 0, color: '#ff5544', litColor: '#ff8a77', key: '1' },  // top-left  red
  { id: 1, color: '#5d9aff', litColor: '#9cc4ff', key: '2' },  // top-right blue
  { id: 2, color: '#7eff66', litColor: '#b5ff9d', key: '3' },  // bot-left  green
  { id: 3, color: '#ffd644', litColor: '#ffe884', key: '4' },  // bot-right yellow
];

const DIFFICULTY = {
  easy:   { length: 4, flashOn: 0.50, flashOff: 0.20, timePerStep: 1.10 },
  normal: { length: 5, flashOn: 0.45, flashOff: 0.15, timePerStep: 0.90 },
  hard:   { length: 6, flashOn: 0.38, flashOff: 0.12, timePerStep: 0.75 },
};

export class SimonGame extends Minigame {
  constructor() {
    super();
    this.sequence = [];
    this.cursor = 0;
    this.misses = 0;
    this.phase = 'intro';      // intro → showing → input → finalize
    this.phaseT = 0;
    this.flashIdx = -1;        // which quadrant is lit during showing or feedback
    this.flashKind = '';       // 'show' | 'good' | 'bad' | ''
    this.flashT = 0;
    this.stepTimeLeft = 0;
    this.totalElapsed = 0;
    this.flashOn = 0.45;
    this.flashOff = 0.15;
    this.timePerStep = 0.9;
    this._tier = 'D';
    this._score = 0;
    this._reason = 'idle';
  }

  start(opts) {
    super.start(opts);
    const diff = DIFFICULTY[(opts && opts.difficulty) || 'normal'];
    this.sequence = [];
    for (let i = 0; i < diff.length; i++) {
      this.sequence.push(Math.floor(Math.random() * QUADRANTS.length));
    }
    this.flashOn = diff.flashOn;
    this.flashOff = diff.flashOff;
    this.timePerStep = diff.timePerStep;
    this.cursor = 0;
    this.misses = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.flashIdx = -1;
    this.flashKind = '';
    this.flashT = 0;
    this.totalElapsed = 0;
    this._tier = 'D';
    this._score = 0;
    this._reason = '';
  }

  update(dt, input) {
    if (this.done) return;
    this.totalElapsed += dt;
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);

    if (this.phase === 'intro') {
      this.phaseT += dt;
      if (this.phaseT >= 0.5) {
        this.phase = 'showing';
        this.phaseT = 0;
        this.flashIdx = this.sequence[0];
        this.flashKind = 'show';
        this.flashT = this.flashOn;
      }
      return;
    }

    if (this.phase === 'showing') {
      this.phaseT += dt;
      const stepDur = this.flashOn + this.flashOff;
      const idx = Math.floor(this.phaseT / stepDur);
      if (idx >= this.sequence.length) {
        this.phase = 'input';
        this.cursor = 0;
        this.stepTimeLeft = this.timePerStep;
        this.flashIdx = -1;
        this.flashKind = '';
        this.flashT = 0;
        return;
      }
      const within = this.phaseT - idx * stepDur;
      if (within < this.flashOn) {
        this.flashIdx = this.sequence[idx];
        this.flashKind = 'show';
        this.flashT = 0.05;
      } else {
        this.flashIdx = -1;
      }
      return;
    }

    if (this.phase === 'input') {
      this.stepTimeLeft -= dt;
      if (this.stepTimeLeft <= 0) {
        // Step timeout — counts as a miss; advance.
        this.misses++;
        this.flashKind = 'bad';
        this.flashT = 0.25;
        this.cursor++;
        this.stepTimeLeft = this.timePerStep;
        if (this.cursor >= this.sequence.length) this._finalize('timeout');
        return;
      }

      // Number-key input
      for (let i = 0; i < QUADRANTS.length; i++) {
        if (input.consumeKey(QUADRANTS[i].key)) { this._tryPress(i); return; }
      }

      // Click hit-test
      if (input.consumeClick()) {
        const q = this._quadrantAtMouse(input);
        if (q != null) this._tryPress(q);
      }
    }
  }

  _tryPress(quadId) {
    if (this.phase !== 'input' || this.done) return;
    const wanted = this.sequence[this.cursor];
    if (quadId === wanted) {
      this.flashIdx = quadId;
      this.flashKind = 'good';
      this.flashT = 0.18;
      this.cursor++;
      this.stepTimeLeft = this.timePerStep;
      if (this.cursor >= this.sequence.length) this._finalize('completed');
    } else {
      this.misses++;
      this.flashIdx = quadId;
      this.flashKind = 'bad';
      this.flashT = 0.25;
      this.cursor++;
      this.stepTimeLeft = this.timePerStep;
      if (this.cursor >= this.sequence.length) this._finalize('mismatch');
    }
  }

  _finalize(reason) {
    const total = this.sequence.length;
    const correct = total - this.misses;
    const raw = correct / total;
    const budget = total * this.timePerStep;
    const inputElapsed = this.totalElapsed - 0.5 - this.sequence.length * (this.flashOn + this.flashOff);
    const usedRatio = Math.max(0, inputElapsed) / Math.max(0.001, budget);
    const speedBonus = Math.max(0, 0.5 - usedRatio) * 0.20;
    this._score = Math.min(1, raw + (raw > 0.4 ? speedBonus : 0));
    this._tier = scoreToTier(this._score);
    this._reason = reason;
    this.done = true;
  }

  getResult() {
    return {
      tier: this._tier,
      score: this._score,
      missed: this.misses,
      timeUsed: this.totalElapsed,
      reason: this._reason,
    };
  }

  _quadrantBounds(canvasW, canvasH) {
    const size = Math.min(canvasW * 0.5, canvasH * 0.5);
    const cx = canvasW / 2, cy = canvasH * 0.55;
    const half = size / 2;
    const gap = 6;
    return {
      cx, cy, half, gap,
      x0: cx - half,             // left edge
      y0: cy - half,             // top edge
      cellW: half - gap / 2,
      cellH: half - gap / 2,
    };
  }

  _quadrantAtMouse(input) {
    if (!input.canvas) return null;
    const w = input.canvas.width, h = input.canvas.height;
    const b = this._quadrantBounds(w, h);
    const mx = input.mouse.x, my = input.mouse.y;
    if (mx < b.x0 || mx > b.x0 + b.half * 2) return null;
    if (my < b.y0 || my > b.y0 + b.half * 2) return null;
    const col = mx > b.cx ? 1 : 0;
    const row = my > b.cy ? 1 : 0;
    return row * 2 + col;
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.textAlign = 'center';

    // Title + hint
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('REMEMBER THE PATTERN', w / 2, h * 0.14);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    let hint = '';
    if (this.phase === 'intro')   hint = 'watch the sequence';
    if (this.phase === 'showing') hint = `playing back · ${this.sequence.length} steps`;
    if (this.phase === 'input')   hint = `repeat with 1 / 2 / 3 / 4 (or click) — step ${this.cursor + 1} / ${this.sequence.length}`;
    ctx.fillText(hint, w / 2, h * 0.18);

    // Board
    const b = this._quadrantBounds(w, h);
    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = (i / 2) | 0;
      const x = b.cx - b.half + col * (b.cellW + b.gap);
      const y = b.cy - b.half + row * (b.cellH + b.gap);
      const q = QUADRANTS[i];
      const lit = (this.flashIdx === i) && this.flashT > 0;
      const litColor = (this.flashKind === 'bad') ? '#ff8888'
                     : (this.flashKind === 'good') ? '#b6ffb0'
                     : q.litColor;
      ctx.fillStyle = lit ? litColor : q.color;
      ctx.globalAlpha = lit ? 1 : 0.45;
      ctx.fillRect(x, y, b.cellW, b.cellH);
      ctx.globalAlpha = 1;
      // Number key hint
      ctx.fillStyle = '#0a0a0a';
      ctx.font = 'bold 28px monospace';
      ctx.fillText(q.key, x + b.cellW / 2, y + b.cellH / 2 + 10);
    }

    // Step timer (input phase only)
    if (this.phase === 'input') {
      const tBarW = 220, tBarH = 4;
      const tx = (w - tBarW) / 2, ty = b.cy + b.half + 18;
      ctx.fillStyle = PALETTE.hpBarBg;
      ctx.fillRect(tx, ty, tBarW, tBarH);
      const ratio = Math.max(0, this.stepTimeLeft / this.timePerStep);
      ctx.fillStyle = ratio < 0.3 ? PALETTE.uiDanger : (ratio < 0.6 ? PALETTE.uiWarn : PALETTE.uiAccent);
      ctx.fillRect(tx, ty, tBarW * ratio, tBarH);
    }
  }
}
