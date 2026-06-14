// Zombies. One class, four archetypes selected from TYPES. Behavior is a tiny
// state machine:
//
//   advancing → (reaches wall) → attacking ──(breaches it)──→ crossing → at player
//   spitter:   advancing → standoff (lobs acid from range)
//   dawn:      any state → fleeing (turns back into the light and fades)
//
// Forward motion is depth-scaled so they accelerate and loom as they near the
// wall. Bullet collision + removal is handled by the night scene.

import { FIELD, PAL } from '../Config.js';
import { events } from '../engine/EventBus.js';
import { depthScale, depthShade, depthSpeed } from './view.js';
import { clamp, TAU } from '../util/math.js';

export const TYPES = {
  shambler: {
    hp: 30, speed: 30, radius: 13, claw: 4, clawCD: 0.85, touch: 8, touchCD: 1.0,
    body: '#5a6b48', head: '#7b8a5e', eye: '#c9ff6a', groan: 0.4,
  },
  runner: {
    hp: 14, speed: 80, radius: 10, claw: 6, clawCD: 0.5, touch: 7, touchCD: 0.7,
    body: '#8a8470', head: '#b3ad96', eye: '#ffcf6a', groan: 0.15, targetsPlayer: true,
  },
  brute: {
    hp: 135, speed: 18, radius: 23, claw: 16, clawCD: 1.1, touch: 20, touchCD: 1.2,
    body: '#4a2622', head: '#6b3a30', eye: '#ff5a3a', groan: 0.6, heavy: true,
  },
  spitter: {
    hp: 22, speed: 36, radius: 12, claw: 0, clawCD: 1, touch: 6, touchCD: 1.0,
    body: '#3f6b3a', head: '#5fa050', eye: '#aaff5a', groan: 0.3,
    standoffY: 392, spitDmg: 9, spitCD: 2.6, spitSpeed: 460,
  },
};

export class Zombie {
  constructor(type, x) {
    const t = TYPES[type];
    this.type = type;
    this.def = t;
    this.x = x;
    this.y = FIELD.HORIZON_Y - 6;
    this.hp = t.hp;
    this.maxHp = t.hp;
    this.radius = t.radius;
    this.state = 'advancing';
    this.targetX = clamp(x + (Math.random() - 0.5) * 200, 60, 1220);
    this.clawT = Math.random() * t.clawCD;
    this.touchT = 0;
    this.spitT = (t.spitCD || 2) * (0.5 + Math.random() * 0.5);
    this.hitFlash = 0;
    this.knockY = 0;
    this.wobble = Math.random() * TAU;
    this.alive = true;
    this.fade = 1;
    this.spawnFade = 0;     // fades in from the horizon
    this.groanT = 2 + Math.random() * 5;
  }

  hurt(amount, dirx, diry, particles) {
    this.hp -= amount;
    this.hitFlash = 0.09;
    this.knockY -= 30; // tiny stagger
    if (particles) particles.blood(this.x, this.y - this.radius * 0.4, dirx, diry, 6);
    events.emit('SFX', 'zombie_hit');
    if (this.hp <= 0) this.die(particles, dirx, diry);
  }

  die(particles, dirx = 0, diry = -1) {
    if (!this.alive) return;
    this.alive = false;
    events.emit('SFX', 'zombie_die');
    // A snap of weight on the kill — bigger for the brute.
    events.emit('HITSTOP', this.def.heavy ? 0.06 : 0.02);
    if (this.def.heavy) events.emit('SHAKE', 0.2);
    if (particles) {
      particles.blood(this.x, this.y - this.radius * 0.4, dirx, diry, 16);
      // Gore chunks.
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * TAU, s = 40 + Math.random() * 120;
        particles.emit({
          x: this.x, y: this.y - this.radius * 0.4,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
          life: 0.5 + Math.random() * 0.4, size: 2 + Math.random() * 3,
          color: PAL.bloodDark, grav: 240,
        });
      }
    }
  }

  flee() { if (this.state !== 'fleeing') { this.state = 'fleeing'; } }

  // ctx provides: wall, player, acid (array to push spitter projectiles),
  // particles, dawn (bool).
  update(dt, c) {
    if (!this.alive) return;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.spawnFade < 1) this.spawnFade = Math.min(1, this.spawnFade + dt * 1.5);
    this.wobble += dt * (this.type === 'runner' ? 14 : 6);

    if (this.knockY !== 0) {
      this.y += this.knockY * dt;
      this.knockY *= Math.max(0, 1 - dt * 8);
      if (Math.abs(this.knockY) < 3) this.knockY = 0;
    }

    // Occasional groan.
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 4 + Math.random() * 7;
      if (Math.random() < this.def.groan) {
        events.emit('SFX', this.type === 'brute' ? 'brute_roar' : 'zombie_groan');
      }
    }

    if (this.state === 'fleeing') {
      this.y -= depthSpeed(this.y, this.def.speed * 1.4) * dt;
      this.fade -= dt * 0.8;
      if (this.fade <= 0 || this.y < FIELD.HORIZON_Y - 20) this.alive = false;
      return;
    }

    if (c.dawn) { this.flee(); return; }

    const t = this.def;
    switch (this.state) {
      case 'advancing': {
        // Spitters peel off at standoff range.
        if (t.standoffY && this.y >= t.standoffY) { this.state = 'standoff'; break; }
        // Steer toward target x while walking down.
        const fwd = depthSpeed(this.y, t.speed) * dt;
        const aimX = t.targetsPlayer ? c.player.x : this.targetX;
        const dx = aimX - this.x;
        this.x += clamp(dx, -fwd * 0.7, fwd * 0.7);
        this.y += fwd;
        if (this.y >= FIELD.WALL_Y) {
          this.y = FIELD.WALL_Y;
          this.state = c.wall.canCross(this.x) ? 'crossing' : 'attacking';
        }
        break;
      }
      case 'attacking': {
        this.clawT -= dt;
        if (this.clawT <= 0) {
          this.clawT = t.clawCD;
          const breached = c.wall.damageAt(this.x, t.claw);
          events.emit('SFX', 'wall_hit');
          if (c.particles) {
            c.particles.burst(this.x, FIELD.WALL_Y, 4,
              { life: 0.3, size: 2, color: '#2a2622', grav: 200 }, 80);
          }
          if (breached) { events.emit('SFX', 'wall_break'); events.emit('SHAKE', 0.25); }
        }
        if (c.wall.canCross(this.x)) this.state = 'crossing';
        break;
      }
      case 'crossing': {
        // Pour through the breach and converge on the player.
        const fwd = depthSpeed(this.y, t.speed * 1.15) * dt;
        const dx = c.player.x - this.x;
        this.x += clamp(dx, -fwd, fwd);
        this.y += Math.min(fwd, Math.max(0, FIELD.PLAYER_Y - this.y));
        const near = Math.abs(this.x - c.player.x) < this.radius + 14 && this.y >= FIELD.PLAYER_Y - 22;
        if (near) {
          this.touchT -= dt;
          if (this.touchT <= 0) {
            this.touchT = t.touchCD;
            c.player.hurt(t.touch);
          }
        }
        break;
      }
      case 'standoff': {
        // Hold position, drift slightly, and spit at the player.
        this.x += Math.sin(this.wobble * 0.5) * 12 * dt;
        this.spitT -= dt;
        if (this.spitT <= 0) {
          this.spitT = t.spitCD;
          this._spit(c);
        }
        // If the wall in front breaks, advance to finish the job.
        break;
      }
    }
  }

  _spit(c) {
    events.emit('SFX', 'spitter_spit');
    const sx = this.x, sy = this.y - this.radius;
    const tx = c.player.x, ty = c.player.y;
    const d = Math.hypot(tx - sx, ty - sy) || 1;
    const sp = this.def.spitSpeed;
    c.acid.push({
      active: true, x: sx, y: sy,
      vx: (tx - sx) / d * sp, vy: (ty - sy) / d * sp,
      damage: this.def.spitDmg, life: 2.0,
    });
  }

  render(ctx) {
    const sc = depthScale(this.y);
    const shade = depthShade(this.y) * this.spawnFade * this.fade;
    const r = this.radius * sc;
    const lurch = this.type === 'runner' ? 3.5 : 2;
    const bob = Math.sin(this.wobble) * lurch * sc;
    const x = this.x, y = this.y + bob;
    const reaching = this.state === 'attacking' || this.state === 'crossing';
    const flash = this.hitFlash > 0;
    const tint = (hex) => flash ? '#ffffff' : shadeColor(hex, shade);

    ctx.globalAlpha = clamp(this.fade, 0, 1);

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, this.y + r * 0.72, r * 0.95, r * 0.3, 0, 0, TAU);
    ctx.fill();

    switch (this.type) {
      case 'brute': this._drawBrute(ctx, x, y, r, sc, tint, reaching); break;
      case 'runner': this._drawRunner(ctx, x, y, r, sc, tint, reaching); break;
      case 'spitter': this._drawSpitter(ctx, x, y, r, sc, tint, reaching, shade); break;
      default: this._drawShambler(ctx, x, y, r, sc, tint, reaching);
    }
    ctx.globalAlpha = 1;
  }

  _arms(ctx, x, y, r, tint, reaching, lw) {
    ctx.strokeStyle = tint(this.def.body);
    ctx.lineWidth = lw; ctx.lineCap = 'round';
    const reach = reaching ? r * 1.15 : r * 0.7;
    const sway = Math.sin(this.wobble * 1.3) * r * 0.15;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y - r * 0.25);
    ctx.lineTo(x - r * 0.6 + sway, y + reach);
    ctx.moveTo(x + r * 0.5, y - r * 0.25);
    ctx.lineTo(x + r * 0.6 + sway, y + reach * 0.92);
    ctx.stroke();
  }

  _torso(ctx, x, y, r, tint, wide = 0.78, tall = 1) {
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, tint(this.def.head));
    g.addColorStop(1, tint(this.def.body));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.2, r * wide, r * tall, 0, 0, TAU); ctx.fill();
    // Torn clothing shading.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + r * 0.2, r * 0.4, r * 0.5, 0, 0, TAU); ctx.fill();
  }

  _head(ctx, x, y, r, tint, hr = 0.55, dy = 1.1) {
    ctx.fillStyle = tint(this.def.head);
    ctx.beginPath(); ctx.arc(x, y - r * dy, r * hr, 0, TAU); ctx.fill();
    // Jaw shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y - r * (dy - hr * 0.5), r * hr * 0.6, r * hr * 0.35, 0, 0, TAU); ctx.fill();
  }

  _drawShambler(ctx, x, y, r, sc, tint, reaching) {
    this._arms(ctx, x, y, r, tint, reaching, Math.max(1.5, r * 0.22));
    this._torso(ctx, x, y, r, tint, 0.76, 1.0);
    this._head(ctx, x - r * 0.12, y, r, tint);
  }

  _drawRunner(ctx, x, y, r, sc, tint, reaching) {
    // Leaner, pitched forward, sprinting limbs.
    const lean = r * 0.25;
    ctx.strokeStyle = tint(this.def.body);
    ctx.lineWidth = Math.max(1.4, r * 0.2); ctx.lineCap = 'round';
    const sp = Math.sin(this.wobble) * r * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.4); ctx.lineTo(x - sp, y + r * 1.0);
    ctx.moveTo(x, y + r * 0.4); ctx.lineTo(x + sp, y + r * 1.0);
    ctx.stroke();
    this._torso(ctx, x + lean, y, r * 0.92, tint, 0.62, 1.05);
    // Outstretched arms.
    ctx.strokeStyle = tint(this.def.body);
    ctx.lineWidth = Math.max(1.3, r * 0.18);
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.3); ctx.lineTo(x + lean * 2 + r * 0.3, y + r * 0.5);
    ctx.moveTo(x, y - r * 0.2); ctx.lineTo(x + lean * 2 + r * 0.2, y + r * 0.8);
    ctx.stroke();
    this._head(ctx, x + lean * 1.6, y, r * 0.92, tint, 0.5, 1.0);
  }

  _drawBrute(ctx, x, y, r, sc, tint, reaching) {
    // Hulking — broad shoulders, small head, heavy arms.
    ctx.strokeStyle = tint(this.def.body);
    ctx.lineWidth = r * 0.4; ctx.lineCap = 'round';
    const reach = reaching ? r * 1.0 : r * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y - r * 0.2); ctx.lineTo(x - r * 0.9, y + reach);
    ctx.moveTo(x + r * 0.7, y - r * 0.2); ctx.lineTo(x + r * 0.9, y + reach);
    ctx.stroke();
    // Massive torso.
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, tint(this.def.head));
    g.addColorStop(1, tint(this.def.body));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.1, r * 1.0, r * 1.05, 0, 0, TAU); ctx.fill();
    // Hunched back lump.
    ctx.fillStyle = tint(this.def.body);
    ctx.beginPath(); ctx.arc(x - r * 0.5, y - r * 0.7, r * 0.4, 0, TAU); ctx.fill();
    // Exposed ribs/scar.
    ctx.strokeStyle = 'rgba(120,30,30,0.5)'; ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { ctx.moveTo(x - r * 0.3, y - r * 0.2 + i * r * 0.25); ctx.lineTo(x + r * 0.3, y - r * 0.25 + i * r * 0.25); }
    ctx.stroke();
    this._head(ctx, x + r * 0.1, y + r * 0.1, r, tint, 0.42, 0.95);
  }

  _drawSpitter(ctx, x, y, r, sc, tint, reaching, shade) {
    this._arms(ctx, x, y, r, tint, reaching, Math.max(1.3, r * 0.18));
    // Bloated body.
    this._torso(ctx, x, y, r, tint, 0.95, 0.95);
    // Pulsing acid sac.
    const pulse = 0.5 + 0.5 * Math.sin(this.wobble * 0.8);
    ctx.fillStyle = `rgba(150,220,70,${0.3 + pulse * 0.3})`;
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.15, r * 0.5, r * 0.45, 0, 0, TAU); ctx.fill();
    this._head(ctx, x, y, r, tint, 0.5, 1.05);
  }

  // Glowing eyes — drawn in the emissive pass so they pierce the darkness even
  // for zombies the flashlight hasn't found yet.
  renderEyes(ctx) {
    if (!this.alive) return;
    const sc = depthScale(this.y);
    const r = this.radius * sc;
    const bob = Math.sin(this.wobble) * 2 * sc;
    const y = this.y + bob;
    const dy = this.type === 'brute' ? 0.95 : this.type === 'runner' ? 1.0 : 1.1;
    const lean = this.type === 'runner' ? r * 0.4 : this.type === 'spitter' ? 0 : -r * 0.12;
    const ex = r * (this.type === 'brute' ? 0.16 : 0.2);
    const eyeY = y - r * dy;
    const a = clamp(this.fade, 0, 1) * 0.95;
    ctx.globalAlpha = a;
    ctx.fillStyle = this.def.eye;
    const er = Math.max(0.9, r * 0.11);
    ctx.beginPath(); ctx.arc(this.x + lean - ex, eyeY, er, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x + lean + ex, eyeY, er, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Darken a #rrggbb by a 0..1 brightness factor (cheap, no parsing cache).
function shadeColor(hex, f) {
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}
