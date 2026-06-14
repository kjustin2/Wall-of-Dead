// "Smash & Grab" — greed under pressure. Crates litter a ransacked store;
// grab as many as you can before the timer runs out. The dead are slower here,
// but bump into one and you drop part of your haul and get briefly stunned. The
// score is purely how much you carry out. Medium risk, scalable reward.

import { ArenaMinigame } from './ArenaMinigame.js';
import { events } from '../engine/EventBus.js';
import { clamp, dist2 } from '../util/math.js';

export class GrabAndGo extends ArenaMinigame {
  configure() {
    this.title = 'SMASH & GRAB';
    this.objective = 'Grab as many supplies as you can';
    this.controls = 'WASD / Arrows to move   ·   touch crates to grab   ·   dodge the dead';
    this.duration = 24;
    this.av.speed = 236;
    this.target = 16;          // crates for a perfect run
    this.grabbed = 0;
    this.crateTimer = 1.3;
    for (let i = 0; i < 5; i++) this.spawnChaser(118 + Math.random() * 28);
    for (let i = 0; i < 7; i++) this.spawnCrate();
  }

  step(dt) {
    // Keep the floor stocked, and let the threat slowly build.
    this.crateTimer -= dt;
    if (this.crateTimer <= 0) {
      this.crateTimer = 1.5;
      if (this.crates.filter(c => !c.taken).length < 8) this.spawnCrate();
      if (this.elapsed > 10 && this.zombies.length < 9 && Math.random() < 0.5) this.spawnChaser(120 + Math.random() * 35);
    }
    for (const c of this.crates) {
      if (c.taken) continue;
      const rr = this.av.r + c.r;
      if (dist2(this.av.x, this.av.y, c.x, c.y) < rr * rr) {
        c.taken = true; this.grabbed++;
        events.emit('SFX', 'scavenge_good');
        this.spark(c.x, c.y, '#ffd27a', 8);
      }
    }
  }

  onTouch(z) {
    const dropped = Math.min(2, this.grabbed);
    this.grabbed -= dropped;
    this.av.hitFlash = 0.4;
    this.av.stun = 0.3;
    this.flash = 0.4;
    this.shake = 0.4;
    this.knockAvatarFrom(z, 24);
    this.spark(this.av.x, this.av.y, '#7a0d10', 8);
    events.emit('SFX', 'player_hurt');
  }

  scoreFrac() { return clamp(this.grabbed / this.target, 0, 1); }

  renderHud(ctx) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`SUPPLIES  ${this.grabbed} / ${this.target}`, this.area.x, this.area.y - 14);
  }
}
