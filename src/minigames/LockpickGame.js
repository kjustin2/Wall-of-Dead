// Lockpick minigame. Three pins rotate around a circle at different
// speeds; each has its own narrow "sweet spot" wedge. Player presses
// 1/2/3 to lock each pin — score per pin = how close to wedge center.
//
// Mistakes (locking outside the wedge) zero that pin's score. Locking
// fast also matters: a `timeBonus` ramps if all three are landed in
// under N seconds.
//
// Difficulty (easy/normal/hard) widens or narrows the wedge and slows
// or speeds rotation. Caller passes opts.difficulty to start().

import { Minigame, scoreToTier } from './Minigame.js';
import { PALETTE } from '../Config.js';

const DIFFICULTY = {
  easy:   { wedge: 0.40, baseSpeed: 1.3, timeLimit: 14 },
  normal: { wedge: 0.28, baseSpeed: 1.7, timeLimit: 10 },
  hard:   { wedge: 0.18, baseSpeed: 2.2, timeLimit:  8 },
};

export class LockpickGame extends Minigame {
  constructor() {
    super();
    this.pins = [];
    this.wedgeWidth = 0.28;
    this.timeLimit = 10;
    this.timeLeft = 10;
    this.elapsed = 0;
    this._tier = 'D';
    this._score = 0;
  }

  start(opts) {
    super.start(opts);
    const diff = DIFFICULTY[(opts && opts.difficulty) || 'normal'];
    this.wedgeWidth = diff.wedge;
    this.timeLimit = diff.timeLimit;
    this.timeLeft = diff.timeLimit;
    this.elapsed = 0;

    // Build three pins. Wedge centers are spaced ~120° apart; rotation
    // direction alternates so they never sit in lockstep.
    this.pins = [];
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dir = (i % 2 === 0) ? 1 : -1;
      const speedJitter = 0.85 + Math.random() * 0.3;
      this.pins.push({
        idx: i,
        wedgeCenter: angle,           // radians
        rot: angle + Math.PI,         // start halfway round so player has to wait
        speed: diff.baseSpeed * dir * speedJitter,
        locked: false,
        score: 0,                     // 0..1 closeness to wedge center
        flash: 0,                     // brief tint after lock
        miss: false,                  // true if locked outside wedge
      });
    }

    this._tier = 'D';
    this._score = 0;
  }

  update(dt, input) {
    if (this.done) return;
    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLimit - this.elapsed);

    // Rotate live pins
    for (const p of this.pins) {
      if (p.locked) { if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 4); continue; }
      p.rot += p.speed * dt;
      // keep angles bounded for nicer math
      if (p.rot >  Math.PI * 2) p.rot -= Math.PI * 2;
      if (p.rot < -Math.PI * 2) p.rot += Math.PI * 2;
    }

    // Lock attempts: 1, 2, 3
    for (let i = 0; i < 3; i++) {
      const p = this.pins[i];
      if (p.locked) continue;
      if (input.consumeKey(String(i + 1))) this._tryLock(p);
    }

    // Click-to-lock: lock the next unlocked pin (so mouse-only players still play)
    if (input.consumeClick()) {
      const next = this.pins.find(pp => !pp.locked);
      if (next) this._tryLock(next);
    }

    // Check completion: all locked OR time ran out
    const unlocked = this.pins.filter(p => !p.locked).length;
    if (unlocked === 0 || this.timeLeft <= 0) {
      this._finalize();
      this.done = true;
    }
  }

  _tryLock(pin) {
    const dx = this._angleDist(pin.rot, pin.wedgeCenter);
    const half = this.wedgeWidth / 2;
    pin.locked = true;
    pin.flash = 1;
    if (dx <= half) {
      // Score = 1 dead-center, 0 at wedge edge, linear in-between.
      pin.score = 1 - (dx / half);
      pin.miss = false;
    } else {
      pin.score = 0;
      pin.miss = true;
    }
  }

  _angleDist(a, b) {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  }

  _finalize() {
    let raw = 0;
    for (const p of this.pins) raw += p.score;
    raw /= this.pins.length;        // 0..1
    // Time bonus: up to +0.10 for finishing in half the time limit.
    const usedRatio = this.elapsed / this.timeLimit;
    const speedBonus = Math.max(0, 0.5 - usedRatio) * 0.20;
    this._score = Math.min(1, raw + (raw > 0 ? speedBonus : 0));
    this._tier = scoreToTier(this._score);
  }

  getResult() {
    return {
      tier: this._tier,
      score: this._score,
      pinScores: this.pins.map(p => p.score),
      timeUsed: this.elapsed,
      missed: this.pins.filter(p => p.miss).length,
    };
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const cx = w / 2, cy = h * 0.52;
    const baseR = 110;

    // Backdrop ring
    ctx.strokeStyle = PALETTE.uiDim;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const r = baseR + i * 32;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Each pin's wedge + pin
    const half = this.wedgeWidth / 2;
    for (let i = 0; i < this.pins.length; i++) {
      const p = this.pins[i];
      const r = baseR + i * 32;

      // Wedge
      ctx.strokeStyle = p.locked
        ? (p.miss ? PALETTE.uiDanger : PALETTE.uiAccent)
        : PALETTE.uiAccent;
      ctx.globalAlpha = p.locked ? (p.miss ? 0.55 : 0.85) : 0.65;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, r, p.wedgeCenter - half, p.wedgeCenter + half);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Wedge center tick
      const tx = cx + Math.cos(p.wedgeCenter) * (r + 12);
      const ty = cy + Math.sin(p.wedgeCenter) * (r + 12);
      ctx.fillStyle = PALETTE.uiAccent;
      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fill();

      // Pin
      const px = cx + Math.cos(p.rot) * r;
      const py = cy + Math.sin(p.rot) * r;
      ctx.fillStyle = p.locked
        ? (p.miss ? PALETTE.uiDanger : PALETTE.uiAccent)
        : PALETTE.uiText;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Index label
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), px, py + 1);

      if (p.flash > 0) {
        ctx.strokeStyle = p.miss ? PALETTE.uiDanger : PALETTE.uiAccent;
        ctx.globalAlpha = p.flash;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, 14 + (1 - p.flash) * 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.textBaseline = 'alphabetic';

    // Center: timer + instructions
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.timeLeft.toFixed(1), cx, cy + 6);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('seconds', cx, cy + 22);

    // Title + hint
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('LOCKPICK', cx, h * 0.18);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText('press 1 / 2 / 3 (or click) when each pin sits inside its wedge', cx, h * 0.22);
    ctx.fillText('center hits = better tier · misses score zero', cx, h * 0.245);
  }
}
