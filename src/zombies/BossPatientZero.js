// BossPatientZero — final-night freedom-zone boss. Three phases, each
// introducing one new behavior so the fight doesn't feel like "shambler
// with more HP" (per the plan's risk #5).
//
//   Phase 1 (100% → 66% HP): heavy chaser. Slow but punishing melee.
//   Phase 2 (66%  → 33% HP): summoner. Stops to spawn 3-5 crawlers every 3s.
//   Phase 3 (33%  → 0%  HP): frenzy. 2x speed, charge attacks, hot palette,
//                            screen shake on entry.
//
// Death emits ZOMBIE_KILLED + sets a `bossDefeated` flag CombatScene reads
// to route to the VictoryScene.

import { Zombie } from './Zombie.js';
import { events } from '../engine/EventBus.js';
import { PALETTE } from '../Config.js';
import { angleTo } from '../util/geom.js';

export const PATIENT_ZERO_DEF = {
  id: 'patient_zero',
  className: 'PatientZero',
  radius: 32,
  hp: 1100,
  speed: 60,
  contactDmg: 18,
  attackRange: 46,
  attackCooldown: 0.85,
  scrapValue: 80,
  threatBudget: 0,                  // never enters wave-budget rotation
  paletteCore: '#5a3a1a',
  paletteOutline: '#1a0a08',
};

export class BossPatientZero extends Zombie {
  constructor(x, y) {
    super(PATIENT_ZERO_DEF, x, y);
    this.phase = 1;
    this.summonCD = 4.0;
    this.frenzyChargeCD = 2.0;
    this.frenzyState = 'idle';        // 'idle' | 'telegraph' | 'charging' | 'cooldown'
    this.frenzyT = 0;
    this.frenzyAngle = 0;
    this.aura = 0;                    // visual ring scale
    this._enteredFrenzy = false;
    this._enteredSummon = false;
  }

  takeDamage(amount) {
    super.takeDamage(amount);
    const ratio = this.hp / this.maxHp;
    if (this.phase === 1 && ratio <= 0.66) this._enterPhase(2);
    if (this.phase === 2 && ratio <= 0.33) this._enterPhase(3);
    if (!this.alive) {
      events.emit('BOSS_DEFEATED', { id: this.id });
    }
  }

  _enterPhase(p) {
    this.phase = p;
    if (p === 2) {
      events.emit('SCREEN_SHAKE', { duration: 0.4, intensity: 0.6 });
      events.emit('CA_FLASH', {});
      this.summonCD = 0.8;            // immediate first summon for impact
      this._enteredSummon = true;
    } else if (p === 3) {
      events.emit('SCREEN_SHAKE', { duration: 0.6, intensity: 0.9 });
      events.emit('CA_FLASH', {});
      events.emit('SLOW_MO', { dur: 0.6, scale: 0.4 });
      this.speed = PATIENT_ZERO_DEF.speed * 2.0;
      this._enteredFrenzy = true;
      this.frenzyChargeCD = 1.5;
    }
  }

  updateAI(dt, player, arena, ctx) {
    this.aura += dt;
    this.aim = angleTo(this.x, this.y, player.x, player.y);

    if (this.phase === 2) {
      // Phase 2: summon crawlers periodically; chase otherwise.
      this.summonCD -= dt;
      if (this.summonCD <= 0) {
        events.emit('BOSS_SUMMON', { x: this.x, y: this.y, count: 3 + (Math.random() * 2 | 0) });
        this.summonCD = 3.2;
      }
      // Slower chase in summon phase — gives player room to deal with adds
      this.x += Math.cos(this.aim) * this.speed * 0.5 * dt;
      this.y += Math.sin(this.aim) * this.speed * 0.5 * dt;
      this._melee(dt, player);
      return;
    }

    if (this.phase === 3) {
      // Phase 3: frenzy — telegraph + charge cycles.
      if (this.frenzyState === 'idle') {
        this.frenzyChargeCD -= dt;
        if (this.frenzyChargeCD <= 0) {
          this.frenzyState = 'telegraph';
          this.frenzyT = 0;
        } else {
          // Aggressive chase between charges
          this.x += Math.cos(this.aim) * this.speed * dt;
          this.y += Math.sin(this.aim) * this.speed * dt;
        }
      } else if (this.frenzyState === 'telegraph') {
        this.frenzyT += dt;
        if (this.frenzyT >= 0.55) {
          this.frenzyState = 'charging';
          this.frenzyAngle = this.aim;
          this.frenzyT = 0;
        }
      } else if (this.frenzyState === 'charging') {
        this.frenzyT += dt;
        const chargeSpeed = 480;
        this.x += Math.cos(this.frenzyAngle) * chargeSpeed * dt;
        this.y += Math.sin(this.frenzyAngle) * chargeSpeed * dt;
        const dx = player.x - this.x, dy = player.y - this.y;
        if (dx * dx + dy * dy <= (player.r + this.r) * (player.r + this.r)) {
          player.takeDamage(28);
          events.emit('SCREEN_SHAKE', { duration: 0.2, intensity: 0.7 });
          this.frenzyState = 'cooldown';
          this.frenzyT = 0;
        }
        if (this.frenzyT >= 0.6) {
          this.frenzyState = 'cooldown';
          this.frenzyT = 0;
        }
      } else if (this.frenzyState === 'cooldown') {
        this.frenzyT += dt;
        if (this.frenzyT >= 0.7) {
          this.frenzyState = 'idle';
          this.frenzyChargeCD = 1.6 + Math.random() * 0.6;
        }
      }
      this._melee(dt, player);
      return;
    }

    // Phase 1: heavy chaser
    this.x += Math.cos(this.aim) * this.speed * dt;
    this.y += Math.sin(this.aim) * this.speed * dt;
    this._melee(dt, player);
  }

  _melee(dt, player) {
    this.attackCooldown -= dt;
    const dx = player.x - this.x, dy = player.y - this.y;
    const tr = player.r + this.attackRange;
    if (dx * dx + dy * dy <= tr * tr && this.attackCooldown <= 0) {
      player.takeDamage(this.contactDmg);
      this.attackCooldown = this.attackInterval;
    }
  }

  drawBody(ctx) {
    const ratio = this.hp / this.maxHp;
    let core = PATIENT_ZERO_DEF.paletteCore;
    let outline = PATIENT_ZERO_DEF.paletteOutline;
    if (this.phase === 3) {
      // Frenzy: hot palette — orange-red
      core = '#aa3322';
      outline = '#220804';
    } else if (this.phase === 2) {
      core = '#7a4422';
    }

    // Heat aura — pulsing ring
    const auraScale = 1 + Math.sin(this.aura * 3) * 0.08;
    ctx.strokeStyle = this.phase === 3 ? '#ff5544' : '#5a2010';
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, this.r * 1.4 * auraScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Telegraph during phase 3 charge windup
    if (this.phase === 3 && this.frenzyState === 'telegraph') {
      const t = this.frenzyT / 0.55;
      ctx.save();
      ctx.rotate(-this.aim);
      ctx.fillStyle = '#ff5544';
      ctx.globalAlpha = 0.18 + t * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 320, this.aim - 0.15, this.aim + 0.15);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Body
    ctx.fillStyle = core;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spike crown
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + this.aura * 0.3;
      const sx = Math.cos(a) * this.r;
      const sy = Math.sin(a) * this.r;
      const tx = Math.cos(a) * (this.r + 8);
      const ty = Math.sin(a) * (this.r + 8);
      ctx.strokeStyle = outline;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    // Glowing eyes
    ctx.fillStyle = this.phase === 3 ? '#ffff77' : PALETTE.uiDanger;
    ctx.beginPath();
    ctx.arc(this.r * 0.55, -this.r * 0.22, 4, 0, Math.PI * 2);
    ctx.arc(this.r * 0.55,  this.r * 0.22, 4, 0, Math.PI * 2);
    ctx.fill();

    // HP bar above the boss — feedback is critical for a multi-phase fight
    const barW = 80, barH = 6;
    const barX = -barW / 2, barY = -this.r - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = ratio > 0.66 ? '#ff7755' : ratio > 0.33 ? '#ffaa33' : '#ff3344';
    ctx.fillRect(barX, barY, barW * ratio, barH);
    // Phase tick marks at 66% / 33%
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(barX + barW * 0.66, barY, 1, barH);
    ctx.fillRect(barX + barW * 0.33, barY, 1, barH);
  }
}
