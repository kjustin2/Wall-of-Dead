// "Fuel Siphon" — hold your ground. Stand in the pump zone to fill the can;
// step out and the fill pauses. The dead close in from all sides — SPACE shoves
// nearby ones back (3 charges, slowly regenerating) to buy room. Get bitten at
// the pump and you lose fuel and composure. Fill the can to ace it. Medium risk.

import { ArenaMinigame } from './ArenaMinigame.js';
import { events } from '../engine/EventBus.js';
import { VIEW, PAL } from '../Config.js';
import { clamp, dist2, TAU } from '../util/math.js';

export class HoldZone extends ArenaMinigame {
  configure() {
    this.title = 'FUEL SIPHON';
    this.objective = 'Hold the pump until the can is full';
    this.controls = 'WASD / Arrows to move   ·   SPACE to shove   ·   stay on the pump';
    this.duration = 28;
    this.av.speed = 226;
    const a = this.area;
    this.zone = { x: a.x + a.w / 2, y: a.y + a.h / 2, r: 74 };
    this.fill = 0;
    this.fillRate = 0.115;     // ~9s of uninterrupted pumping to fill
    this.shoveCharges = 3;
    this.shoveRegen = 0;
    this.shoveCd = 0;
    this.spawnTimer = 2.6;
    for (let i = 0; i < 5; i++) this.spawnChaser(120 + Math.random() * 28);
  }

  step(dt, input) {
    const inZone = dist2(this.av.x, this.av.y, this.zone.x, this.zone.y) < this.zone.r * this.zone.r;
    if (inZone && this.av.stun <= 0) {
      this.fill += this.fillRate * dt;
      if (this.fill >= 1) { this.fill = 1; this.finish(); return; }
    }

    // Shove.
    if (this.shoveCd > 0) this.shoveCd -= dt;
    this.shoveRegen += dt;
    if (this.shoveRegen > 5 && this.shoveCharges < 3) { this.shoveRegen = 0; this.shoveCharges++; }
    if ((input.consumeKey(' ') || input.consumeClick()) && this.shoveCharges > 0 && this.shoveCd <= 0) {
      this.shoveCharges--; this.shoveCd = 0.35; this.shake = 0.4;
      events.emit('SFX', 'wall_hit');
      this.spark(this.av.x, this.av.y, '#9fd0ff', 12, 200);
      for (const z of this.zombies) {
        const dx = z.x - this.av.x, dy = z.y - this.av.y, d = Math.hypot(dx, dy);
        if (d < 150) { z.x += dx / d * 130; z.y += dy / d * 130; z.stun = 0.7; }
      }
    }

    // The siege intensifies.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.zombies.length < 11) { this.spawnTimer = 3.6; this.spawnChaser(120 + Math.random() * 35); }
  }

  onTouch(z) {
    this.fill = Math.max(0, this.fill - 0.07);
    this.stamina -= 0.25;
    this.av.hitFlash = 0.4;
    this.flash = 0.4;
    this.shake = 0.45;
    this.knockAvatarFrom(z, 22);
    this.spark(this.av.x, this.av.y, '#7a0d10', 8);
    events.emit('SFX', 'player_hurt');
    if (this.stamina <= 0) { this.stamina = 0; this.failed = true; }
  }

  scoreFrac() { return clamp(this.fill, 0, 1); }

  renderGround(ctx) {
    const z = this.zone;
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(z.x, z.y, 6, z.x, z.y, z.r);
    g.addColorStop(0, `rgba(120,200,255,${0.12 + pulse * 0.08})`);
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(150,210,255,${0.4 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // Pump in the middle.
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(z.x - 6, z.y - 16, 12, 26);
    ctx.fillStyle = '#445';
    ctx.fillRect(z.x - 10, z.y + 8, 20, 5);
  }

  renderHud(ctx) {
    // Fuel can meter.
    const w = 220, x = this.area.x, y = this.area.y - 26;
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '10px monospace';
    ctx.fillText('FUEL CAN', x, y - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = '#e0b53a';
    ctx.fillRect(x, y, w * clamp(this.fill, 0, 1), 12);

    // Shove charges + composure.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fd0ff';
    ctx.font = '12px monospace';
    ctx.fillText('SHOVE ' + '◆'.repeat(this.shoveCharges) + '◇'.repeat(3 - this.shoveCharges), this.area.x + this.area.w, y + 10);
    this.drawStaminaAt(ctx, x, y + 22);
  }

  drawStaminaAt(ctx, x, y) {
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '10px monospace';
    ctx.fillText('COMPOSURE', x, y - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y + 2, 140, 8);
    ctx.fillStyle = this.stamina < 0.34 ? '#c0392b' : '#5fbf6a';
    ctx.fillRect(x, y + 2, 140 * clamp(this.stamina, 0, 1), 8);
  }
}
