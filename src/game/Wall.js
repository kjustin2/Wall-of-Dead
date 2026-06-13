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
    for (let i = 0; i < N_SEG; i++) {
      const s = this.seg[i];
      const x = X_LEFT + i * SEG_W;
      const frac = s.hp / s.max;
      if (s.hp <= 0) {
        // Breached: rubble gap, darker, jagged.
        ctx.fillStyle = '#0b0c0a';
        ctx.fillRect(x, top, SEG_W, h);
        ctx.fillStyle = '#1a1714';
        for (let r = 0; r < 5; r++) {
          const rx = x + 3 + (r * 7919 % (SEG_W - 8));
          const ry = bottom - 6 - (r * 104729 % (h - 8));
          ctx.fillRect(rx, ry, 5, 4);
        }
        continue;
      }
      // Body, tinted toward red as it weakens.
      const dmg = 1 - frac;
      const r = Math.round(0x23 + dmg * 0x37);
      const g = Math.round(0x21 - dmg * 0x0d);
      const b = Math.round(0x1f - dmg * 0x0d);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, top, SEG_W, h);
      // Top edge highlight (the lip you stand behind).
      ctx.fillStyle = s.flash > 0 ? '#b5402c' : PAL.wallEdge;
      ctx.fillRect(x, top - 5, SEG_W, 6);
      // Vertical seam between blocks.
      ctx.fillStyle = '#15130f';
      ctx.fillRect(x, top, 2, h);
      // Cracks appear as damage mounts.
      if (dmg > 0.35) {
        ctx.strokeStyle = 'rgba(10,8,6,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const cx = x + SEG_W * 0.5;
        ctx.moveTo(cx, top);
        ctx.lineTo(cx - 6, top + h * 0.4);
        ctx.lineTo(cx + 5, top + h * 0.7);
        ctx.lineTo(cx - 3, bottom);
        ctx.stroke();
      }
      if (dmg > 0.65) {
        ctx.strokeStyle = 'rgba(10,8,6,0.7)';
        ctx.beginPath();
        ctx.moveTo(x + SEG_W * 0.25, top);
        ctx.lineTo(x + SEG_W * 0.35, bottom);
        ctx.stroke();
      }
    }
    // Continuous shadowed base line in front of the wall.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(X_LEFT, bottom, X_RIGHT - X_LEFT, 5);
  }
}
