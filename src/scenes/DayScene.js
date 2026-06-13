// Daytime between nights. Three beats:
//   report   — you survived; here's the road and your stats.
//   scavenge — the Supply Run minigame; tier scales the haul.
//   loot     — what you found (tier supplies + a scripted story find:
//              shotgun, a rescued survivor, a rifle), then advance one leg.
//
// Scripted finds are keyed to the night you just survived so the slice shows
// off weapon pickups and a companion rescue without random whiffs.

import { Scene } from './Scene.js';
import { VIEW, FIELD, PAL, RUN } from '../Config.js';
import { ScavengeMinigame } from '../minigames/ScavengeMinigame.js';
import { makeLoadout, WEAPONS } from '../game/Weapons.js';
import { events } from '../engine/EventBus.js';
import { clamp, TAU } from '../util/math.js';

const TIER_MULT = { D: 0.4, C: 0.7, B: 1.0, A: 1.35, S: 1.7 };

export class DayScene extends Scene {
  constructor(game, summary) {
    super(game);
    this.summary = summary || { kills: 0 };
  }

  enter() {
    this.phase = 'report';
    this.minigame = new ScavengeMinigame();
    this.lootLines = [];
    this.special = null;
    this.t = 0;
    this.survivedNight = this.run.night;
    this.audio.init();
    this.audio.ambient.start(0.15);
  }

  exit() { this.audio.ambient.stop(); }

  update(dt) {
    this.t += dt;
    this.audio.ambient.tick(dt, 0.1);
    const input = this.input;

    if (this.phase === 'report') {
      if (input.consumeKey(' ') || input.consumeClick()) {
        events.emit('SFX', 'ui_click');
        this.phase = 'scavenge';
      }
    } else if (this.phase === 'scavenge') {
      this.minigame.update(dt, input);
      if (this.minigame.done) {
        this._applyLoot(this.minigame.getResult());
        this.phase = 'loot';
      }
    } else if (this.phase === 'loot') {
      if (input.consumeKey(' ') || input.consumeClick()) {
        events.emit('SFX', 'ui_confirm');
        this._advance();
      }
    }
  }

  _applyLoot(result) {
    const run = this.run;
    const mult = TIER_MULT[result.tier];
    this.lootLines.push(`Supply Run rated  ${result.tier}  (${result.score}/6)`);

    // Ammo across owned weapons.
    for (const lo of run.weapons) {
      const add = Math.round(WEAPONS[lo.id].mag * 2 * mult);
      lo.reserve += add;
    }
    this.lootLines.push(`+ ammo for all weapons`);

    // Repair materials → wall.
    const mats = Math.round(46 * mult) + 14;
    run.wallHp = clamp(run.wallHp + mats, 0, run.wallMaxHp);
    this.lootLines.push(`+ ${mats} wall reinforced`);

    // Patch wounds.
    run.playerHp = clamp((run.playerHp ?? 100) + 16, 0, 100);
    this.lootLines.push(`+ 16 wounds patched`);

    // Scripted story find for the night just survived.
    this._applySpecial(this.survivedNight);
  }

  _applySpecial(night) {
    const run = this.run;
    if (night === 1) {
      run.weapons.push(makeLoadout('shotgun'));
      this.special = { kind: 'weapon', title: 'SHOTGUN SALVAGED',
        text: 'Pried from a wrecked cruiser. Brutal up close — press 2 to wield it.' };
      events.emit('SFX', 'survivor_join');
    } else if (night === 2) {
      run.companions.push({ name: 'Mara', weaponId: 'smg', maxHp: 70, hp: 70 });
      this.special = { kind: 'survivor', title: 'SURVIVOR RESCUED — MARA',
        text: 'She waved you down from a rooftop. She holds an SMG and the wall with you now.' };
      events.emit('SFX', 'survivor_join');
    } else if (night === 3) {
      run.weapons.push(makeLoadout('rifle'));
      this.special = { kind: 'weapon', title: 'HUNTING RIFLE FOUND',
        text: 'One shot drops most things and punches through the rest. Press 3.' };
      events.emit('SFX', 'survivor_join');
    }
  }

  _advance() {
    const run = this.run;
    run.leg = run.stats.nightsSurvived;     // pips track nights survived
    run.night = this.survivedNight + 1;
    if (run.leg >= run.legsTotal) this.game.toVictory();
    else this.game.toNight();
  }

  // ── Render ──
  render(ctx) {
    this._drawDayBackdrop(ctx);
    ctx.textAlign = 'center';

    if (this.phase === 'report') this._renderReport(ctx);
    else if (this.phase === 'scavenge') this._renderScavenge(ctx);
    else if (this.phase === 'loot') this._renderLoot(ctx);
  }

  _drawDayBackdrop(ctx) {
    // Overcast morning — washed grey-blue, the safe zone glowing far off.
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.H);
    sky.addColorStop(0, '#243038');
    sky.addColorStop(0.5, '#3a4750');
    sky.addColorStop(1, '#20262a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    // Pale sun.
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(VIEW.W * 0.5, 120, 10, VIEW.W * 0.5, 120, 220);
    g.addColorStop(0, 'rgba(255,240,210,0.4)');
    g.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.W, 360);
    ctx.globalCompositeOperation = 'source-over';

    // The road receding to the safe zone.
    const horizon = 300;
    ctx.fillStyle = '#2a2f28';
    ctx.fillRect(0, horizon, VIEW.W, VIEW.H - horizon);
    ctx.fillStyle = '#3a3f38';
    ctx.beginPath();
    ctx.moveTo(VIEW.W / 2 - 24, horizon);
    ctx.lineTo(VIEW.W / 2 + 24, horizon);
    ctx.lineTo(VIEW.W / 2 + 360, VIEW.H);
    ctx.lineTo(VIEW.W / 2 - 360, VIEW.H);
    ctx.closePath();
    ctx.fill();
    // Dashed centerline.
    ctx.strokeStyle = 'rgba(220,210,150,0.5)';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 26]);
    ctx.beginPath();
    ctx.moveTo(VIEW.W / 2, horizon);
    ctx.lineTo(VIEW.W / 2, VIEW.H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _panel(ctx, y, h) {
    ctx.fillStyle = 'rgba(8,12,12,0.78)';
    ctx.fillRect(VIEW.W / 2 - 360, y, 720, h);
    ctx.strokeStyle = 'rgba(127,255,138,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(VIEW.W / 2 - 360 + 0.5, y + 0.5, 720, h);
  }

  _renderReport(ctx) {
    this._panel(ctx, 150, 320);
    ctx.fillStyle = PAL.accent;
    ctx.font = 'bold 34px monospace';
    ctx.fillText('DAWN', VIEW.W / 2, 205);
    ctx.fillStyle = PAL.hud;
    ctx.font = '16px monospace';
    ctx.fillText(`You survived Night ${this.survivedNight}.`, VIEW.W / 2, 240);
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '13px monospace';
    ctx.fillText(`${this.summary.kills} of the dead put down.   Total killed: ${this.run.stats.kills}`, VIEW.W / 2, 266);

    // Road progress.
    const legsLeft = this.run.legsTotal - this.run.stats.nightsSurvived;
    ctx.fillStyle = PAL.hud;
    ctx.font = '15px monospace';
    ctx.fillText(legsLeft > 0
      ? `The safe zone is ${legsLeft} ${legsLeft === 1 ? 'leg' : 'legs'} down the road.`
      : `The safe zone is in sight.`, VIEW.W / 2, 312);
    this._roadPips(ctx, 340);

    ctx.fillStyle = this.t % 1 < 0.6 ? PAL.accent : PAL.hudDim;
    ctx.font = '14px monospace';
    ctx.fillText('Scavenge for supplies  —  SPACE', VIEW.W / 2, 430);
  }

  _roadPips(ctx, y) {
    const n = this.run.legsTotal;
    const pw = 40, gap = 12, total = n * pw + (n - 1) * gap;
    let x = VIEW.W / 2 - total / 2;
    for (let i = 0; i < n; i++) {
      const done = i < this.run.stats.nightsSurvived;
      ctx.fillStyle = done ? PAL.good : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, pw, 8);
      x += pw + gap;
    }
  }

  _renderScavenge(ctx) {
    this._panel(ctx, 220, 200);
    ctx.fillStyle = PAL.hud;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('SCAVENGING', VIEW.W / 2, 262);
    this.minigame.render(ctx, VIEW.W / 2, 340);
  }

  _renderLoot(ctx) {
    const h = this.special ? 360 : 280;
    this._panel(ctx, 150, h);
    ctx.fillStyle = PAL.accent;
    ctx.font = 'bold 24px monospace';
    ctx.fillText('SUPPLIES SECURED', VIEW.W / 2, 196);

    ctx.font = '14px monospace';
    let y = 232;
    for (const line of this.lootLines) {
      ctx.fillStyle = PAL.hud;
      ctx.fillText(line, VIEW.W / 2, y);
      y += 24;
    }

    if (this.special) {
      y += 14;
      ctx.fillStyle = this.special.kind === 'survivor' ? '#8fb0c8' : '#ffd27a';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(this.special.title, VIEW.W / 2, y);
      y += 24;
      ctx.fillStyle = PAL.hudDim;
      ctx.font = '12px monospace';
      this._wrap(ctx, this.special.text, VIEW.W / 2, y, 560, 18);
    }

    const lastNight = this.run.stats.nightsSurvived >= this.run.legsTotal;
    ctx.fillStyle = this.t % 1 < 0.6 ? PAL.accent : PAL.hudDim;
    ctx.font = '14px monospace';
    ctx.fillText(lastNight ? 'Make the final push  —  SPACE'
      : `Move on to Night ${this.survivedNight + 1}  —  SPACE`, VIEW.W / 2, 150 + h - 26);
  }

  _wrap(ctx, text, cx, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, y); line = w; y += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, cx, y);
  }
}
