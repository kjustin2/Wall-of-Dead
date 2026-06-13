// Drives one night: a "hold until dawn" timer plus an escalating spawn stream.
// The mix of zombie types and the spawn cadence both ramp with the night
// number and with how far into the night you are, peaking in a final surge
// just before dawn. Returns spawn requests; the scene places them on the map.

import { weightedPick } from '../util/math.js';

// Per-night flavor. weights are relative; absent types don't appear.
const NIGHT_PLAN = [
  // night 1 — learn the ropes: shamblers, the odd runner.
  { dur: 56, mix: { shambler: 10, runner: 2 }, maxAlive: 16, surge: 1.0 },
  // night 2 — runners pick up, spitters introduced.
  { dur: 62, mix: { shambler: 9, runner: 5, spitter: 2 }, maxAlive: 20, surge: 1.15 },
  // night 3 — brutes arrive.
  { dur: 70, mix: { shambler: 8, runner: 6, spitter: 3, brute: 1.5 }, maxAlive: 24, surge: 1.3 },
  // night 4 — the safe zone is in sight; everything comes at once.
  { dur: 78, mix: { shambler: 8, runner: 7, spitter: 4, brute: 3 }, maxAlive: 30, surge: 1.6 },
];

export class WaveDirector {
  constructor(nightNum) {
    this.night = nightNum;
    this.plan = NIGHT_PLAN[Math.min(nightNum - 1, NIGHT_PLAN.length - 1)];
    // Beyond the authored nights, keep scaling difficulty.
    const over = Math.max(0, nightNum - NIGHT_PLAN.length);
    this.duration = this.plan.dur + over * 8;
    this.maxAlive = this.plan.maxAlive + over * 4;
    this.elapsed = 0;
    this.spawnT = 1.2;                 // grace period before the first zombie
    this.dawn = false;
    this._mix = Object.entries(this.plan.mix).map(([type, weight]) => ({ type, weight }));
    this.totalSpawned = 0;
  }

  get progress01() { return Math.min(1, this.elapsed / this.duration); }
  get isDawn() { return this.dawn; }

  _interval() {
    const p = this.progress01;
    // 2.1s early → 0.5s late, tightened by night number.
    let iv = (2.1 - 1.6 * p) / (1 + (this.night - 1) * 0.12);
    if (p > 0.8) iv *= 0.6 / this.plan.surge;  // final surge
    return Math.max(0.28, iv);
  }

  // Returns an array of zombie type strings to spawn this frame (0..2).
  update(dt, aliveCount) {
    if (this.dawn) return null;
    this.elapsed += dt;
    if (this.elapsed >= this.duration) { this.dawn = true; return null; }
    if (aliveCount >= this.maxAlive) return null;

    this.spawnT -= dt;
    if (this.spawnT > 0) return null;
    this.spawnT = this._interval();

    const out = [weightedPick(this._mix).type];
    // At high intensity, occasionally double up.
    if (this.progress01 > 0.55 && Math.random() < 0.35 && aliveCount + 1 < this.maxAlive) {
      out.push(weightedPick(this._mix).type);
    }
    this.totalSpawned += out.length;
    return out;
  }
}
