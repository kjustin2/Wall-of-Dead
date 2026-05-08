// PipeGame: a small grid of pipe tiles must be rotated until water flows
// from the source on the left edge to the drain on the right edge. The
// player clicks tiles to rotate them 90°; once water reaches the drain
// the run is finalized and scored. A countdown turns the timer into the
// score: solving fast → S/A; solving slowly → C/B; never solving → D.
//
// Tile open-side bitmask (4 bits): N=1, E=2, S=4, W=8.
// Three tile shapes: straight (N+S), elbow (N+E), cross (N+E+S+W).
// Rotating 90° clockwise on the bitmask: ((m << 1) | (m >> 3)) & 0xF.

import { Minigame, scoreToTier } from './Minigame.js';
import { PALETTE } from '../Config.js';

const N = 1, E = 2, S = 4, W = 8;

const SHAPES = [
  { name: 'straight', mask: N | S, weight: 4 },
  { name: 'elbow',    mask: N | E, weight: 5 },
  { name: 'cross',    mask: N | E | S | W, weight: 1 },
];

const DIFFICULTY = {
  easy:   { cols: 4, rows: 3, timeLimit: 18 },
  normal: { cols: 5, rows: 4, timeLimit: 16 },
  hard:   { cols: 5, rows: 5, timeLimit: 14 },
};

function rotCW(mask) { return ((mask << 1) | (mask >> 3)) & 0xF; }

function pickShapeMask() {
  // weighted random pick + random rotation
  let total = 0;
  for (const s of SHAPES) total += s.weight;
  let r = Math.random() * total;
  let pick = SHAPES[0];
  for (const s of SHAPES) { r -= s.weight; if (r <= 0) { pick = s; break; } }
  let m = pick.mask;
  const rot = Math.floor(Math.random() * 4);
  for (let i = 0; i < rot; i++) m = rotCW(m);
  return m;
}

export class PipeGame extends Minigame {
  constructor() {
    super();
    this.cols = 5;
    this.rows = 4;
    this.midRow = 1;
    this.tiles = [];          // flat row*cols array of { mask }
    this.timeLeft = 16;
    this.timeLimit = 16;
    this.solved = false;
    this.flashT = 0;
    this.flashKind = '';      // 'good' | 'bad' | ''
    this._tier = 'D';
    this._score = 0;
    this._reason = 'idle';
    this._reachable = null;   // recomputed each render (BFS) for the visual glow
  }

  start(opts) {
    super.start(opts);
    const diff = DIFFICULTY[(opts && opts.difficulty) || 'normal'];
    this.cols = diff.cols;
    this.rows = diff.rows;
    this.midRow = (this.rows / 2) | 0;
    this.timeLimit = diff.timeLimit;
    this.timeLeft = diff.timeLimit;
    this.solved = false;
    this.flashT = 0;
    this.flashKind = '';
    this.tiles = new Array(this.cols * this.rows);
    for (let i = 0; i < this.tiles.length; i++) {
      this.tiles[i] = { mask: pickShapeMask() };
    }
    this._tier = 'D';
    this._score = 0;
    this._reason = '';
  }

  _idx(r, c) { return r * this.cols + c; }

  update(dt, input) {
    if (this.done) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);

    if (input.consumeKey('enter') || input.consumeKey(' ')) {
      this._commit();
      return;
    }

    if (input.consumeClick()) {
      const cell = this._cellAtMouse(input);
      if (cell) {
        const t = this.tiles[this._idx(cell.r, cell.c)];
        t.mask = rotCW(t.mask);
        this.flashT = 0.12;
        this.flashKind = 'good';
      }
    }

    if (this.timeLeft <= 0) this._commit();
  }

  _commit() {
    if (this.done) return;
    const reach = this._computeReachable();
    const drainKey = `drain`;
    this.solved = reach.has(drainKey);
    this._reachable = reach;
    if (this.solved) {
      this._reason = 'solved';
    } else {
      this._reason = this.timeLeft <= 0 ? 'timeout' : 'gaveup';
    }
    const usedRatio = (this.timeLimit - this.timeLeft) / Math.max(0.001, this.timeLimit);
    const timeFactor = Math.max(0, 1 - usedRatio);
    this._score = this.solved ? Math.min(1, 0.55 + timeFactor * 0.45) : 0;
    this._tier = scoreToTier(this._score);
    this.flashT = 0.4;
    this.flashKind = this.solved ? 'good' : 'bad';
    this.done = true;
  }

  // BFS from source. Returns a Set of "r,c" keys reachable from the source,
  // plus "drain" if connected. Uses tile open-masks AND the open-mask of
  // each neighbor to decide if the connection is mutual.
  _computeReachable() {
    const reach = new Set();
    const start = { r: this.midRow, c: 0 };
    // Source feeds east; entry tile must have W open.
    if (!(this.tiles[this._idx(start.r, start.c)].mask & W)) return reach;
    const q = [start];
    reach.add(`${start.r},${start.c}`);
    while (q.length) {
      const { r, c } = q.shift();
      const m = this.tiles[this._idx(r, c)].mask;
      const tryDir = (dr, dc, fromBit, toBit) => {
        if (!(m & fromBit)) return;
        const nr = r + dr, nc = c + dc;
        if (nc === this.cols && r === this.midRow && (m & E)) {
          reach.add('drain');
          return;
        }
        if (nr < 0 || nc < 0 || nr >= this.rows || nc >= this.cols) return;
        const nMask = this.tiles[this._idx(nr, nc)].mask;
        if (!(nMask & toBit)) return;
        const k = `${nr},${nc}`;
        if (reach.has(k)) return;
        reach.add(k);
        q.push({ r: nr, c: nc });
      };
      tryDir(-1,  0, N, S);
      tryDir( 0,  1, E, W);
      tryDir( 1,  0, S, N);
      tryDir( 0, -1, W, E);
    }
    return reach;
  }

  getResult() {
    return {
      tier: this._tier,
      score: this._score,
      missed: this.solved ? 0 : 1,
      timeUsed: this.timeLimit - this.timeLeft,
      reason: this._reason,
    };
  }

  _gridBounds(canvasW, canvasH) {
    const cell = Math.min(64, (canvasW * 0.7) / this.cols, (canvasH * 0.55) / this.rows);
    const w = cell * this.cols;
    const h = cell * this.rows;
    const x0 = (canvasW - w) / 2;
    const y0 = canvasH * 0.30;
    return { cell, x0, y0, w, h };
  }

  _cellAtMouse(input) {
    if (!input.canvas) return null;
    const b = this._gridBounds(input.canvas.width, input.canvas.height);
    const mx = input.mouse.x, my = input.mouse.y;
    if (mx < b.x0 || mx > b.x0 + b.w) return null;
    if (my < b.y0 || my > b.y0 + b.h) return null;
    const c = Math.floor((mx - b.x0) / b.cell);
    const r = Math.floor((my - b.y0) / b.cell);
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return { r, c };
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.textAlign = 'center';

    // Title + hint
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('REROUTE THE PIPES', w / 2, h * 0.14);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText('click tiles to rotate · enter to commit · faster = better tier', w / 2, h * 0.18);

    // Live BFS for the glow — small grids, cheap.
    const reach = this._computeReachable();

    const b = this._gridBounds(w, h);
    // Frame
    ctx.strokeStyle = PALETTE.uiDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x0 - 4, b.y0 - 4, b.w + 8, b.h + 8);

    // Source / drain markers
    const srcY = b.y0 + this.midRow * b.cell + b.cell / 2;
    ctx.fillStyle = '#5d9aff';
    ctx.beginPath();
    ctx.arc(b.x0 - 14, srcY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = reach.has('drain') ? '#7eff66' : PALETTE.uiDim;
    ctx.beginPath();
    ctx.arc(b.x0 + b.w + 14, srcY, 7, 0, Math.PI * 2);
    ctx.fill();

    // Tiles
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.tiles[this._idx(r, c)];
        const x = b.x0 + c * b.cell;
        const y = b.y0 + r * b.cell;
        const live = reach.has(`${r},${c}`);
        // Cell background
        ctx.fillStyle = live ? 'rgba(93,154,255,0.10)' : 'rgba(20,20,28,0.6)';
        ctx.fillRect(x, y, b.cell, b.cell);
        ctx.strokeStyle = '#1a1a22';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, b.cell, b.cell);

        // Pipe channels
        const cx = x + b.cell / 2, cy = y + b.cell / 2;
        const halfCell = b.cell / 2;
        const channelW = Math.max(6, b.cell * 0.22);
        ctx.lineWidth = channelW;
        ctx.lineCap = 'round';
        ctx.strokeStyle = live ? '#5d9aff' : '#52606a';
        // Hub
        ctx.fillStyle = live ? '#5d9aff' : '#42505a';
        ctx.beginPath();
        ctx.arc(cx, cy, channelW * 0.55, 0, Math.PI * 2);
        ctx.fill();
        // Spokes per open direction
        if (t.mask & N) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - halfCell); ctx.stroke(); }
        if (t.mask & E) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + halfCell, cy); ctx.stroke(); }
        if (t.mask & S) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + halfCell); ctx.stroke(); }
        if (t.mask & W) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - halfCell, cy); ctx.stroke(); }
      }
    }
    ctx.lineCap = 'butt';

    // Timer bar
    const tBarW = 260, tBarH = 4;
    const tx = (w - tBarW) / 2, ty = b.y0 + b.h + 24;
    ctx.fillStyle = PALETTE.hpBarBg;
    ctx.fillRect(tx, ty, tBarW, tBarH);
    const ratio = Math.max(0, this.timeLeft / this.timeLimit);
    ctx.fillStyle = ratio < 0.3 ? PALETTE.uiDanger : (ratio < 0.6 ? PALETTE.uiWarn : PALETTE.uiAccent);
    ctx.fillRect(tx, ty, tBarW * ratio, tBarH);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText(`${this.timeLeft.toFixed(1)}s`, w / 2, ty + 16);

    // Flash overlay
    if (this.flashT > 0) {
      const a = (this.flashT / 0.4) * 0.18;
      ctx.fillStyle = this.flashKind === 'good' ? '#7eff66' : '#ff5544';
      ctx.globalAlpha = a;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
}
