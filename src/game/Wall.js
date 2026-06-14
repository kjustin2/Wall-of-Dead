// The wall is the thing you're holding. It's split into segments so damage is
// localized: zombies claw the segment in front of them, and when a segment's
// HP hits zero it *breaches* — a hole the horde pours through to reach the
// player directly. You can't repair mid-night; repairs happen by day with
// scavenged materials. Two ways to lose a night: the player dies, or every
// segment breaches (fully overrun).

import { FIELD, PAL } from '../Config.js';

const X_LEFT = 36;
const X_RIGHT = 1244;
const N_SEG = 12;
const SEG_W = (X_RIGHT - X_LEFT) / N_SEG;

export class Wall {
  constructor(maxHp) {
    this.xLeft = X_LEFT;
    this.xRight = X_RIGHT;
    this.nSeg = N_SEG;
    this.segW = SEG_W;
    this.maxPer = maxHp / N_SEG;
    this.seg = [];
    for (let i = 0; i < N_SEG; i++) {
      this.seg.push({ hp: this.maxPer, max: this.maxPer, flash: 0 });
    }
  }

  segIndexAt(x) {
    let i = Math.floor((x - X_LEFT) / SEG_W);
    return i < 0 ? 0 : i >= N_SEG ? N_SEG - 1 : i;
  }

  segCenterX(i) { return X_LEFT + (i + 0.5) * SEG_W; }

  isBreached(i) { return this.seg[i].hp <= 0; }

  // True when a zombie at world-x can pass through (a breach in its segment).
  canCross(x) { return this.isBreached(this.segIndexAt(x)); }

  damageAt(x, amount) {
    const s = this.seg[this.segIndexAt(x)];
    if (s.hp <= 0) return false;
    s.hp = Math.max(0, s.hp - amount);
    s.flash = 0.18;
    return s.hp <= 0; // returns true on the hit that breaches it
  }

  // Spread a saved total evenly across segments (between-night persistence).
  setTotal(total) {
    const per = Math.max(0, Math.min(this.maxPer, total / this.nSeg));
    for (const s of this.seg) s.hp = per;
  }

  totalHp() { let t = 0; for (const s of this.seg) t += s.hp; return t; }
  totalMax() { return this.maxPer * N_SEG; }
  integrity01() { return this.totalHp() / this.totalMax(); }
  breachCount() { let n = 0; for (const s of this.seg) if (s.hp <= 0) n++; return n; }
  fullyOverrun() { return this.breachCount() >= N_SEG; }

  // Distribute `mats` HP of repair across the weakest segments first.
  repair(mats) {
    let pool = mats;
    // Several passes, always topping up the current weakest segment.
    for (let guard = 0; guard < 200 && pool > 0; guard++) {
      let weakest = null;
      for (const s of this.seg) if (s.hp < s.max && (!weakest || s.hp < weakest.hp)) weakest = s;
      if (!weakest) break;
      const give = Math.min(pool, weakest.max - weakest.hp, this.maxPer * 0.25 + 1);
      weakest.hp += give;
      pool -= give;
    }
  }

  update(dt) {
    for (const s of this.seg) if (s.flash > 0) s.flash -= dt;
  }

  render(ctx) {
    const top = FIELD.WALL_Y;
    const bottom = FIELD.WALL_BOTTOM;
    const h = bottom - top;

    // Cast shadow on the field in front of the wall.
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(X_LEFT - 6, top - 14, X_RIGHT - X_LEFT + 12, 16);

    for (let i = 0; i < N_SEG; i++) {
      const s = this.seg[i];
      const x = X_LEFT + i * SEG_W;
      const frac = s.hp / s.max;

      if (s.hp <= 0) { this._drawBreach(ctx, x, top, bottom, h, i); continue; }
      this._drawSegment(ctx, s, x, top, bottom, h, frac, i);
    }

    // Barbed wire strung along the whole top (skips breached spans).
    this._drawWire(ctx, top);

    // Sandbag revetment along the base.
    this._drawSandbags(ctx, bottom);

    // Front shadow lip.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(X_LEFT, bottom, X_RIGHT - X_LEFT, 6);
  }

  _drawSegment(ctx, s, x, top, bottom, h, frac, i) {
    const dmg = 1 - frac;
    // Concrete body with vertical shading, reddening as it weakens.
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    const lift = Math.round(dmg * 40);
    g.addColorStop(0, `rgb(${0x3a + lift},${0x36 - dmg * 12},${0x30 - dmg * 12})`);
    g.addColorStop(0.5, `rgb(${0x26 + lift},${0x23 - dmg * 10},${0x20 - dmg * 10})`);
    g.addColorStop(1, `rgb(${0x16 + lift},${0x15 - dmg * 6},${0x13 - dmg * 6})`);
    ctx.fillStyle = s.flash > 0 ? '#7a2a20' : g;
    ctx.fillRect(x, top, SEG_W, h);

    // Cap stone / lip you crouch behind.
    ctx.fillStyle = s.flash > 0 ? '#b5402c' : '#43403a';
    ctx.fillRect(x - 1, top - 6, SEG_W + 2, 8);
    ctx.fillStyle = '#56524a';
    ctx.fillRect(x - 1, top - 6, SEG_W + 2, 2);

    // Block seams.
    ctx.fillStyle = 'rgba(8,7,5,0.8)';
    ctx.fillRect(x, top, 2, h);
    ctx.fillRect(x, top + h * 0.5, SEG_W, 1);

    // Rust/stain streaks (deterministic per segment).
    const r = ((i * 374761393) >>> 0);
    ctx.fillStyle = 'rgba(70,40,20,0.25)';
    for (let k = 0; k < 3; k++) {
      const sx = x + 6 + ((r >>> (k * 4)) % (SEG_W - 12));
      ctx.fillRect(sx, top, 2, 8 + ((r >>> (k * 3)) % (h - 8)));
    }

    // Damage: cracks, then exposed rebar.
    if (dmg > 0.3) {
      ctx.strokeStyle = 'rgba(8,6,4,0.85)';
      ctx.lineWidth = 1.5;
      const cx = x + SEG_W * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, top); ctx.lineTo(cx - 6, top + h * 0.4);
      ctx.lineTo(cx + 5, top + h * 0.7); ctx.lineTo(cx - 3, bottom);
      ctx.stroke();
    }
    if (dmg > 0.6) {
      ctx.strokeStyle = 'rgba(90,70,40,0.7)';
      ctx.lineWidth = 1.5;
      for (let b = 0; b < 2; b++) {
        const bx = x + SEG_W * (0.3 + b * 0.4);
        ctx.beginPath(); ctx.moveTo(bx, top + h * 0.3); ctx.lineTo(bx, bottom); ctx.stroke();
      }
      // Blood smear near a heavily damaged segment.
      ctx.fillStyle = 'rgba(90,12,12,0.4)';
      ctx.beginPath(); ctx.ellipse(x + SEG_W * 0.5, top + 6, SEG_W * 0.3, 6, 0, 0, 6.2832); ctx.fill();
    }
  }

  _drawBreach(ctx, x, top, bottom, h, i) {
    // A jagged hole: dark gap, rubble pile, bent rebar.
    ctx.fillStyle = '#090a08';
    ctx.fillRect(x, top - 4, SEG_W, h + 4);
    // Jagged remaining edges.
    ctx.fillStyle = '#1a1612';
    ctx.beginPath();
    ctx.moveTo(x, top); ctx.lineTo(x + 6, top + 14); ctx.lineTo(x, top + 26); ctx.lineTo(x, top); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + SEG_W, top); ctx.lineTo(x + SEG_W - 7, top + 18); ctx.lineTo(x + SEG_W, top + 30); ctx.fill();
    // Rubble.
    ctx.fillStyle = '#241f19';
    for (let r = 0; r < 7; r++) {
      const rx = x + 3 + ((r * 7919) % (SEG_W - 8));
      const ry = bottom - 4 - ((r * 104729) % 18);
      ctx.fillRect(rx, ry, 4 + (r % 3), 4);
    }
    // Bent rebar.
    ctx.strokeStyle = '#5a4a30';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, bottom); ctx.lineTo(x + 12, top + 12); ctx.lineTo(x + 18, top + 4);
    ctx.moveTo(x + SEG_W - 10, bottom); ctx.lineTo(x + SEG_W - 14, top + 16);
    ctx.stroke();
  }

  _drawWire(ctx, top) {
    ctx.strokeStyle = 'rgba(150,155,150,0.55)';
    ctx.lineWidth = 1;
    const y = top - 12;
    ctx.beginPath();
    for (let x = X_LEFT; x < X_RIGHT; x += 14) {
      const i = this.segIndexAt(x + 7);
      if (this.seg[i].hp <= 0) continue;     // wire gone where breached
      ctx.moveTo(x, y); ctx.lineTo(x + 7, y - 5); ctx.lineTo(x + 14, y);
    }
    ctx.stroke();
    // Barbs.
    ctx.beginPath();
    for (let x = X_LEFT + 7; x < X_RIGHT; x += 28) {
      const i = this.segIndexAt(x);
      if (this.seg[i].hp <= 0) continue;
      ctx.moveTo(x - 3, y - 7); ctx.lineTo(x + 3, y - 1);
      ctx.moveTo(x + 3, y - 7); ctx.lineTo(x - 3, y - 1);
    }
    ctx.stroke();
  }

  _drawSandbags(ctx, bottom) {
    const y = bottom - 6;
    for (let bx = X_LEFT - 4; bx < X_RIGHT; bx += 26) {
      const i = this.segIndexAt(bx + 13);
      const breached = this.seg[i].hp <= 0;
      // Two rows of bags.
      for (let row = 0; row < 2; row++) {
        const off = row * 13;
        const by = y + 8 - row * 9;
        ctx.fillStyle = breached ? '#2a2a22' : (row === 0 ? '#4a4a38' : '#54543f');
        ctx.beginPath();
        ctx.ellipse(bx + off, by, 15, 9, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(bx + off, by + 3, 15, 5, 0, 0, 6.2832); ctx.fill();
      }
    }
  }
}
