// "Steady Hands" — the day scavenging skill check. A needle sweeps a bar; you
// press SPACE to lock it inside the shrinking green zone. Three rounds; the
// closer to the core, the better the haul. The resulting tier (D..S) scales
// the supplies you find that day. Built to the same shape as a reusable
// minigame (start/update/render/getResult) so more can be slotted in later.

import { events } from '../engine/EventBus.js';

export class ScavengeMinigame {
  constructor() { this.rounds = 3; this.reset(); }

  reset() {
    this.round = 0;
    this.score = 0;
    this.hits = 0;
    this.perfects = 0;
    this.done = false;
    this.flash = 0;
    this.lastResult = '';
    this._newRound();
  }

  _newRound() {
    this.needle = Math.random() * 0.3;
    this.dir = 1;
    this.speed = 0.85 + this.round * 0.33;     // fraction of bar / second
    this.sweet = 0.22 + Math.random() * 0.56;  // zone center
    this.sweetW = 0.2 - this.round * 0.035;    // zone full width (shrinks)
    this.coreW = 0.07 - this.round * 0.012;    // perfect core full width
    this.locked = false;
    this.lockPos = 0;
    this.resultTimer = 0;
  }

  update(dt, input) {
    if (this.done) return;
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
    this.resultTimer = 0.75;
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

  get tier() {
    const s = this.score;
    if (s >= 6) return 'S';
    if (s >= 5) return 'A';
    if (s >= 3) return 'B';
    if (s >= 1) return 'C';
    return 'D';
  }

  getResult() { return { tier: this.tier, hits: this.hits, perfects: this.perfects, score: this.score }; }

  render(ctx, cx, cy) {
    const W = 620, H = 30;
    const x = cx - W / 2, y = cy - H / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fb8a6';
    ctx.font = '13px monospace';
    ctx.fillText(`SUPPLY RUN  —  round ${Math.min(this.round + 1, this.rounds)} / ${this.rounds}`, cx, y - 22);

    // Track.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);

    // Sweet zone + core.
    const sw = this.sweetW * W, cwd = this.coreW * W;
    const sx = x + this.sweet * W;
    ctx.fillStyle = 'rgba(95,191,106,0.35)';
    ctx.fillRect(sx - sw / 2, y, sw, H);
    ctx.fillStyle = 'rgba(127,255,138,0.7)';
    ctx.fillRect(sx - cwd / 2, y, cwd, H);

    // Needle.
    const nx = x + (this.locked ? this.lockPos : this.needle) * W;
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : '#ffd27a';
    ctx.fillRect(nx - 2, y - 6, 4, H + 12);

    // Feedback.
    if (this.locked || this.lastResult) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = this.lastResult === 'PERFECT' ? '#7fff8a'
        : this.lastResult === 'GOOD' ? '#5fbf6a'
        : this.lastResult === 'MISS' ? '#d8662e' : '#9fb8a6';
      if (this.locked) ctx.fillText(this.lastResult, cx, y + H + 26);
    } else {
      ctx.font = '12px monospace';
      ctx.fillStyle = '#6a7a70';
      ctx.fillText('SPACE / CLICK to lock', cx, y + H + 24);
    }
  }
}
