// WireCutGame: a sequence of colored wires must be cut in the order
// shown by a flashing prompt list. Each correct cut advances the cursor;
// a wrong cut zaps a wire (locks it dead) and costs score. The whole
// thing has a per-prompt timer that shrinks the wedge of usable colors.
//
// Player input: number keys 1..N to cut wire N, or click the wire.

import { Minigame, scoreToTier } from './Minigame.js';
import { PALETTE } from '../Config.js';

const WIRE_COLORS = [
  { id: 0, name: 'red',    color: '#ff5544' },
  { id: 1, name: 'blue',   color: '#5d9aff' },
  { id: 2, name: 'green',  color: '#7eff66' },
  { id: 3, name: 'yellow', color: '#ffd644' },
  { id: 4, name: 'white',  color: '#cdd6c0' },
];

const DIFFICULTY = {
  easy:   { promptCount: 5, timePerPrompt: 1.6 },
  normal: { promptCount: 6, timePerPrompt: 1.2 },
  hard:   { promptCount: 7, timePerPrompt: 0.95 },
};

export class WireCutGame extends Minigame {
  constructor() {
    super();
    this.prompts = [];           // [{id, color, name, cut}]
    this.cursor = 0;             // index of current prompt to satisfy
    this.timeLeftThisPrompt = 0;
    this.totalElapsed = 0;
    this.maxTimePerPrompt = 1.2;
    this.misses = 0;
    this.flashT = 0;             // brief flash after a correct/wrong cut
    this.flashKind = '';         // 'good' | 'bad' | ''
    this._tier = 'D';
    this._reason = 'idle';
  }

  start(opts) {
    super.start(opts);
    const diff = DIFFICULTY[(opts && opts.difficulty) || 'normal'];
    this.prompts = [];
    for (let i = 0; i < diff.promptCount; i++) {
      const color = WIRE_COLORS[Math.floor(Math.random() * WIRE_COLORS.length)];
      this.prompts.push({ ...color, cut: false });
    }
    this.maxTimePerPrompt = diff.timePerPrompt;
    this.timeLeftThisPrompt = this.maxTimePerPrompt;
    this.cursor = 0;
    this.totalElapsed = 0;
    this.misses = 0;
    this.flashT = 0;
    this._tier = 'D';
    this._reason = '';
  }

  update(dt, input) {
    if (this.done) return;
    this.totalElapsed += dt;
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);

    this.timeLeftThisPrompt -= dt;
    if (this.timeLeftThisPrompt <= 0) {
      // Per-prompt timeout: counts as a miss, advance cursor.
      this.misses++;
      this.flashT = 0.25;
      this.flashKind = 'bad';
      this.cursor++;
      this.timeLeftThisPrompt = this.maxTimePerPrompt;
      if (this.cursor >= this.prompts.length) this._finalize('timeout');
      return;
    }

    // Number-key input: 1..N
    for (let i = 0; i < WIRE_COLORS.length; i++) {
      if (input.consumeKey(String(i + 1))) this._tryCut(i);
    }

    // Click hit-test on the wire row
    if (input.consumeClick()) {
      const wireIdx = this._wireAtMouse(input);
      if (wireIdx != null) this._tryCut(wireIdx);
    }
  }

  _tryCut(wireId) {
    if (this.done) return;
    const wanted = this.prompts[this.cursor];
    if (!wanted) return;
    if (wireId === wanted.id) {
      wanted.cut = true;
      this.flashT = 0.18;
      this.flashKind = 'good';
      this.cursor++;
      this.timeLeftThisPrompt = this.maxTimePerPrompt;
      if (this.cursor >= this.prompts.length) this._finalize('completed');
    } else {
      this.misses++;
      this.flashT = 0.25;
      this.flashKind = 'bad';
      // Skip the prompt — wrong cut is a permanent miss for that step.
      this.cursor++;
      this.timeLeftThisPrompt = this.maxTimePerPrompt;
      if (this.cursor >= this.prompts.length) this._finalize('miswire');
    }
  }

  _finalize(reason) {
    const total = this.prompts.length;
    const correct = total - this.misses;
    const raw = correct / total;            // 0..1
    // Speed bonus: finishing under half the budgeted time tops up to +0.10.
    const budget = total * this.maxTimePerPrompt;
    const usedRatio = this.totalElapsed / Math.max(0.001, budget);
    const speedBonus = Math.max(0, 0.5 - usedRatio) * 0.20;
    const score = Math.min(1, raw + (raw > 0.4 ? speedBonus : 0));
    this._tier = scoreToTier(score);
    this._reason = reason;
    this._score = score;
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

  _wireAtMouse(input) {
    if (!input.canvas) return null;
    const w = input.canvas.width, h = input.canvas.height;
    const wireW = 60, gap = 28;
    const total = WIRE_COLORS.length * wireW + (WIRE_COLORS.length - 1) * gap;
    const startX = (w - total) / 2;
    const top = h * 0.50, bot = h * 0.78;
    if (input.mouse.y < top || input.mouse.y > bot) return null;
    for (let i = 0; i < WIRE_COLORS.length; i++) {
      const wx = startX + i * (wireW + gap);
      if (input.mouse.x >= wx && input.mouse.x <= wx + wireW) return i;
    }
    return null;
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.textAlign = 'center';

    // Title
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('CUT THE WIRES', w / 2, h * 0.18);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText('cut in the order shown · 1-5 or click', w / 2, h * 0.22);

    // Prompt strip
    const pStripY = h * 0.32;
    const pSize = 28;
    const pGap = 10;
    const totalWidth = this.prompts.length * pSize + (this.prompts.length - 1) * pGap;
    const startPx = (w - totalWidth) / 2;
    for (let i = 0; i < this.prompts.length; i++) {
      const p = this.prompts[i];
      const px = startPx + i * (pSize + pGap);
      const isCurrent = i === this.cursor && !this.done;
      const passed = i < this.cursor;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = passed ? (p.cut ? 0.4 : 0.18) : 1;
      if (isCurrent) {
        // Pulse
        const pulse = 1 + Math.sin(this.totalElapsed * 8) * 0.1;
        ctx.beginPath();
        ctx.arc(px + pSize / 2, pStripY + pSize / 2, (pSize / 2) * pulse, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(px, pStripY, pSize, pSize);
      }
      ctx.globalAlpha = 1;
      // Index
      ctx.fillStyle = '#0a0a0a';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(String(i + 1), px + pSize / 2, pStripY + pSize / 2 + 4);
      // Strikethrough on cut
      if (p.cut) {
        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 2, pStripY + pSize / 2);
        ctx.lineTo(px + pSize + 2, pStripY + pSize / 2);
        ctx.stroke();
      }
    }

    // Per-prompt timer
    const tBarW = 220, tBarH = 4;
    const tx = (w - tBarW) / 2, ty = pStripY + pSize + 16;
    ctx.fillStyle = PALETTE.hpBarBg;
    ctx.fillRect(tx, ty, tBarW, tBarH);
    const ratio = Math.max(0, this.timeLeftThisPrompt / this.maxTimePerPrompt);
    ctx.fillStyle = ratio < 0.3 ? PALETTE.uiDanger : (ratio < 0.6 ? PALETTE.uiWarn : PALETTE.uiAccent);
    ctx.fillRect(tx, ty, tBarW * ratio, tBarH);

    // Wire row (clickable) — five colored wire bars
    const wireW = 60, gap = 28;
    const total = WIRE_COLORS.length * wireW + (WIRE_COLORS.length - 1) * gap;
    const wsx = (w - total) / 2;
    const wsy = h * 0.50;
    const wsh = h * 0.28;
    for (let i = 0; i < WIRE_COLORS.length; i++) {
      const wc = WIRE_COLORS[i];
      const wx = wsx + i * (wireW + gap);
      // Cable
      ctx.fillStyle = wc.color;
      ctx.fillRect(wx + wireW * 0.35, wsy, wireW * 0.3, wsh);
      // Connector tabs
      ctx.fillStyle = '#1a1418';
      ctx.fillRect(wx, wsy - 8, wireW, 10);
      ctx.fillRect(wx, wsy + wsh - 2, wireW, 10);
      // Number key hint
      ctx.fillStyle = PALETTE.uiText;
      ctx.font = 'bold 14px monospace';
      ctx.fillText(String(i + 1), wx + wireW / 2, wsy + wsh + 26);
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '10px monospace';
      ctx.fillText(wc.name, wx + wireW / 2, wsy + wsh + 40);
    }

    // Flash overlay
    if (this.flashT > 0) {
      const a = (this.flashT / 0.25) * 0.18;
      ctx.fillStyle = this.flashKind === 'good' ? '#7eff66' : '#ff5544';
      ctx.globalAlpha = a;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
}
