// "Outrun the Pack" — the unarmed survival run. Stay alive for the full timer
// without getting caught. Every grab drains your composure; if it empties you
// bolt early (a poor haul). A few crates are scattered for bonus if you're
// brave enough to weave through the pack to grab them. High risk, high reward.

import { ArenaMinigame } from './ArenaMinigame.js';
import { events } from '../engine/EventBus.js';
import { clamp, dist2 } from '../util/math.js';

export class EvasionRun extends ArenaMinigame {
  configure() {
    this.title = 'OUTRUN THE PACK';
    this.objective = 'Survive — do not get caught';
    this.controls = 'WASD / Arrows to move   ·   no weapon   ·   grab crates for a bigger haul';
    this.duration = 22;
    this.av.speed = 252;
    this.grabbed = 0;
    this.spawnTimer = 3.5;
    for (let i = 0; i < 7; i++) this.spawnChaser(150 + Math.random() * 45);
    for (let i = 0; i < 3; i++) this.spawnCrate();
  }

  step(dt) {
    // The pack keeps growing — it gets harder the longer you linger.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.zombies.length < 15) {
      this.spawnTimer = 3.2;
      this.spawnChaser(150 + Math.random() * 70);
    }
    // Crate pickups (optional bonus).
    for (const c of this.crates) {
      if (c.taken) continue;
      const rr = this.av.r + c.r;
      if (dist2(this.av.x, this.av.y, c.x, c.y) < rr * rr) {
        c.taken = true; this.grabbed++;
        events.emit('SFX', 'scavenge_good');
        this.spark(c.x, c.y, '#ffd27a', 10);
        this.spawnCrate();   // replenish so there's always something to chase
      }
    }
  }

  onTouch(z) {
    this.stamina -= 0.34;
    this.av.hitFlash = 0.45;
    this.av.stun = 0.16;
    this.flash = 0.45;
    this.shake = 0.5;
    this.knockAvatarFrom(z, 30);
    this.spark(this.av.x, this.av.y, '#7a0d10', 10);
    events.emit('SFX', 'player_hurt');
    if (this.stamina <= 0) { this.stamina = 0; this.failed = true; }
  }

  scoreFrac() {
    // Survive the whole timer with composure intact → top tier. Bolting early
    // (caught out) scales by how long you lasted. Crates add a bonus.
    const survived = this.failed ? this.elapsed / this.duration : 1;
    const base = survived * (0.55 + 0.45 * this.stamina);
    return clamp(base + this.grabbed * 0.05, 0, 1);
  }

  renderHud(ctx) {
    this.drawStamina(ctx, 'COMPOSURE');
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd27a';
    ctx.font = '12px monospace';
    ctx.fillText(`crates ${this.grabbed}`, this.area.x + this.area.w, this.area.y - 16);
  }
}
