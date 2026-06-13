// The night defense — the heart of the game. Build the wall, the player, and
// any rescued companions; run the WaveDirector; resolve bullets, acid, and
// the horde against the wall until dawn. Two ways to lose: the player dies or
// the wall is fully overrun. Survive to dawn → DayScene.

import { Scene } from './Scene.js';
import { FIELD, RUN } from '../Config.js';
import { Wall } from '../game/Wall.js';
import { Player } from '../game/Player.js';
import { Companion } from '../game/Companion.js';
import { Zombie } from '../game/Zombie.js';
import { WaveDirector } from '../game/WaveDirector.js';
import { stepBullet } from '../game/Bullet.js';
import { depthScale } from '../game/view.js';
import { drawNightField, drawVignette } from '../game/Backdrop.js';
import { drawNightHUD } from '../ui/HUD.js';
import { events } from '../engine/EventBus.js';
import { clamp, approach, pointSegDist2, randInt, TAU } from '../util/math.js';

export class NightScene extends Scene {
  enter() {
    const run = this.run;
    this.t = 0;
    this.wall = new Wall(run.wallMaxHp);
    this.wall.setTotal(run.wallHp);
    this.player = new Player(run);
    this.player.x = 640;

    // Spread companions evenly along the wall.
    this.companions = run.companions.map((rec, i) => {
      const n = run.companions.length;
      const x = 280 + (n === 1 ? 360 : (i / (n - 1)) * 720);
      return new Companion(rec, x);
    });

    this.zombies = [];
    this.bullets = [];
    this.acid = [];
    this.director = new WaveDirector(run.night);
    this.kills = 0;
    this.dread = 0.15;
    this.dawnFired = false;
    this.dawnHold = 0;
    this.flash = 0;          // white dawn flash
    this.over = false;

    this.audio.init();
    this.audio.resume();
    this.audio.ambient.start(0.4 + run.night * 0.08);
  }

  exit() {
    this.audio.ambient.stop();
    this.bullets.length = 0;
    this.zombies.length = 0;
    this.acid.length = 0;
  }

  _spawn(type) {
    const x = randInt(40, 1240);
    this.zombies.push(new Zombie(type, x));
  }

  update(dt) {
    if (this.over) return;
    this.t += dt;
    const input = this.input;
    const m = input.mouse;

    // ── Input ──
    let dir = 0;
    if (input.isDown('a') || input.isDown('arrowleft')) dir -= 1;
    if (input.isDown('d') || input.isDown('arrowright')) dir += 1;
    this.player.move(dt, dir);
    if (input.consumeKey('r')) this.player.startReload();
    for (let i = 1; i <= 9; i++) if (input.consumeKey(String(i))) this.player.switchTo(i - 1);
    const wheel = input.consumeWheel();
    if (wheel) this.player.cycle(wheel);

    this.player.setAim(m.x, m.y);
    const firing = this.player.weapon.auto ? m.down : input.consumeClick();
    if (firing) this.player.fire(m.x, m.y, this.bullets, this.particles);
    this.player.update(dt);

    // ── Spawns ──
    const reqs = this.director.update(dt, this.zombies.length);
    if (reqs) for (const tp of reqs) this._spawn(tp);

    // Dawn: zombies flee, then we transition.
    const dawn = this.director.isDawn;
    if (dawn && !this.dawnFired) {
      this.dawnFired = true;
      this.flash = 1;
      events.emit('SFX', 'dawn_chime');
    }

    // ── Companions ──
    const cctx = { zombies: this.zombies, bullets: this.bullets, particles: this.particles };
    for (const co of this.companions) co.update(dt, cctx);

    // ── Zombies ──
    const zctx = { wall: this.wall, player: this.player, acid: this.acid, particles: this.particles, dawn };
    for (const z of this.zombies) z.update(dt, zctx);

    // ── Bullets vs zombies ──
    for (const b of this.bullets) {
      if (!b.active) continue;
      if (!stepBullet(b, dt)) { b.active = false; continue; }
      for (const z of this.zombies) {
        if (!z.alive || z.state === 'fleeing') continue;
        if (b.pierce > 0 && b.hitList && b.hitList.includes(z)) continue;
        const r = z.radius * depthScale(z.y) + 3;
        if (pointSegDist2(z.x, z.y - z.radius * 0.3, b.px, b.py, b.x, b.y) <= r * r) {
          const len = Math.hypot(b.vx, b.vy) || 1;
          z.hurt(b.damage, b.vx / len, b.vy / len, this.particles);
          if (!z.alive && !z._counted) { z._counted = true; this.kills++; }
          if (b.pierce > 0) {
            b.pierce--;
            (b.hitList || (b.hitList = [])).push(z);
          } else { b.active = false; break; }
        }
      }
    }

    // ── Acid vs player / companions ──
    for (const a of this.acid) {
      if (!a.active) continue;
      a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt;
      if (a.life <= 0) { a.active = false; continue; }
      if (Math.hypot(a.x - this.player.x, a.y - this.player.y) < 22) {
        this.player.hurt(a.damage, 'acid_hit');
        this._acidSplat(a.x, a.y);
        a.active = false; continue;
      }
      for (const co of this.companions) {
        if (!co.downed && Math.hypot(a.x - co.x, a.y - co.y) < 20) {
          co.hurt(a.damage); this._acidSplat(a.x, a.y); a.active = false; break;
        }
      }
      if (a.y > FIELD.PLAYER_Y + 30) a.active = false;
    }

    // ── Cleanup ──
    this.wall.update(dt);
    this.particles.update(dt);
    this.camera.update(dt);
    if (this.flash > 0) this.flash -= dt * 0.6;
    this.bullets = this.bullets.filter(b => b.active);
    this.acid = this.acid.filter(a => a.active);
    this.zombies = this.zombies.filter(z => z.alive);

    // ── Dread → ambient + vignette ──
    let near = 0;
    for (const z of this.zombies) if (z.y > 360 && z.state !== 'fleeing') near++;
    const target = clamp(
      (1 - this.player.hp / this.player.maxHp) * 0.45 +
      Math.min(1, near / 8) * 0.3 +
      (1 - this.wall.integrity01()) * 0.3 +
      this.wall.breachCount() * 0.06 +
      0.1 + this.director.progress01 * 0.1, 0, 1);
    this.dread = approach(this.dread, dawn ? 0.05 : target, 1.5, dt);
    this.audio.ambient.tick(dt, this.dread);

    // ── End conditions ──
    if (!this.player.alive) return this._fail('Torn apart at the wall.');
    if (this.wall.fullyOverrun()) return this._fail('The wall collapsed. The horde poured through.');

    if (dawn) {
      this.dawnHold += dt;
      if (this.dawnHold > 3.4) this._survive();
    }
  }

  _acidSplat(x, y) {
    events.emit('SFX', 'acid_hit');
    this.particles.burst(x, y, 10, { life: 0.4, size: 2, color: '#9bd84a', grav: 120 }, 90);
  }

  _fail(reason) {
    this.over = true;
    this.run.deathReason = reason;
    this.run.stats.nights = this.run.night - 1;
    this.game.toGameOver();
  }

  _survive() {
    this.over = true;
    const run = this.run;
    // Survivors patch the wall a little at first light, before day repairs.
    run.wallHp = Math.min(run.wallMaxHp, this.wall.totalHp() + RUN.dawnRepair);
    run.playerHp = this.player.hp;
    run.stats.kills += this.kills;
    run.stats.nightsSurvived++;
    // Companions get back up at dawn (revived, half HP if they were downed).
    for (const co of this.companions) {
      if (co.downed) { co.rec.hp = Math.max(co.maxHp * 0.5, 1); }
    }
    this.game.toDay({ kills: this.kills });
  }

  render(ctx) {
    this.camera.begin(ctx);
    drawNightField(ctx, this.t);

    // Additive light pools near the defenders.
    ctx.globalCompositeOperation = 'lighter';
    this.player.renderLight(ctx);
    for (const co of this.companions) co.renderLight(ctx);
    ctx.globalCompositeOperation = 'source-over';

    // Zombies sorted far→near; crossing ones drawn in front of the wall.
    const sorted = this.zombies.slice().sort((a, b) => a.y - b.y);
    const crossing = [];
    for (const z of sorted) {
      if (z.state === 'crossing') crossing.push(z);
      else z.render(ctx);
    }
    this.wall.render(ctx);
    for (const z of crossing) z.render(ctx);

    // Defenders in front of the wall.
    for (const co of this.companions) co.render(ctx);
    this.player.render(ctx);

    // Bullets (tracers).
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      if (!b.active) continue;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const len = Math.hypot(b.vx, b.vy) || 1;
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx / len * b.tracerLen, b.y - b.vy / len * b.tracerLen);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Acid globs.
    ctx.globalCompositeOperation = 'lighter';
    for (const a of this.acid) {
      if (!a.active) continue;
      ctx.fillStyle = 'rgba(155,216,74,0.9)';
      ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    this.particles.render(ctx);
    drawVignette(ctx, this.dread);

    // Dawn wash.
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,240,210,${Math.min(0.6, this.flash * 0.6)})`;
      ctx.fillRect(0, 0, 1280, 720);
    }
    this.camera.end(ctx);

    drawNightHUD(ctx, {
      run: this.run, player: this.player, wall: this.wall,
      director: this.director, companions: this.companions, kills: this.kills,
    });

    if (this.director.isDawn) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe8b0';
      ctx.font = 'bold 40px monospace';
      ctx.fillText('DAWN', 640, 300);
      ctx.fillStyle = '#9fb8a6';
      ctx.font = '14px monospace';
      ctx.fillText('You held the wall.', 640, 330);
    }
  }
}
