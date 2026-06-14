// Daytime between nights. Four beats:
//   report   — you survived; here's the road and your stats.
//   choose   — pick one of three scavenging expeditions (risk vs reward).
//   play     — the chosen minigame runs (it owns the whole screen).
//   loot     — what you found (tier × expedition supplies + a scripted story
//              find: shotgun, a rescued survivor, a rifle), then advance a leg.
//
// Scripted finds are keyed to the night you just survived so the slice shows
// off weapon pickups and a companion rescue regardless of which run you chose.

import { Scene } from './Scene.js';
import { VIEW, PAL } from '../Config.js';
import { dayOptions, riskColor } from '../minigames/Expeditions.js';
import { makeLoadout, WEAPONS } from '../game/Weapons.js';
import { events } from '../engine/EventBus.js';
import { clamp } from '../util/math.js';

const TIER_MULT = { D: 0.4, C: 0.7, B: 1.0, A: 1.35, S: 1.7 };

export class DayScene extends Scene {
  constructor(game, summary) {
    super(game);
    this.summary = summary || { kills: 0 };
  }

  enter() {
    this.pausable = true;
    this.phase = 'report';
    this.lootLines = [];
    this.special = null;
    this.expedition = null;
    this.minigame = null;
    this.result = null;
    this.t = 0;
    this.survivedNight = this.run.night;
    this.options = dayOptions(this.survivedNight);
    this.audio.init();
    this.audio.ambient.start(0.15);
  }

  exit() { this.audio.ambient.stop(); }

  // ── card geometry (shared by render + click hit-testing) ──
  _cardRect(i) {
    const w = 300, h = 250, gap = 30;
    const total = this.options.length * w + (this.options.length - 1) * gap;
    const x0 = (VIEW.W - total) / 2;
    return { x: x0 + i * (w + gap), y: 232, w, h };
  }

  update(dt) {
    this.t += dt;
    const input = this.input;

    if (this.phase === 'report') {
      this.audio.ambient.tick(dt, 0.1);
      if (input.consumeKey(' ') || input.consumeClick()) { events.emit('SFX', 'ui_click'); this.phase = 'choose'; }

    } else if (this.phase === 'choose') {
      this.audio.ambient.tick(dt, 0.12);
      for (let i = 0; i < this.options.length; i++) {
        if (input.consumeKey(String(i + 1))) return this._choose(i);
      }
      if (input.mouse.clicked) {
        for (let i = 0; i < this.options.length; i++) {
          const r = this._cardRect(i);
          if (input.mouse.x >= r.x && input.mouse.x <= r.x + r.w && input.mouse.y >= r.y && input.mouse.y <= r.y + r.h) {
            input.mouse.clicked = false;
            return this._choose(i);
          }
        }
      }

    } else if (this.phase === 'play') {
      this.minigame.update(dt, input);
      if (this.minigame.done) {
        this.result = this.minigame.getResult();
        this._applyLoot(this.result);
        events.emit('SFX', this.result.frac >= 0.5 ? 'ui_confirm' : 'scavenge_bad');
        this.phase = 'loot';
      }

    } else if (this.phase === 'loot') {
      this.audio.ambient.tick(dt, 0.1);
      if (input.consumeKey(' ') || input.consumeClick()) { events.emit('SFX', 'ui_confirm'); this._advance(); }
    }
  }

  _choose(i) {
    this.expedition = this.options[i];
    this.minigame = this.expedition.make();
    this.minigame.start();
    this.phase = 'play';
    events.emit('SFX', 'ui_confirm');
  }

  _applyLoot(result) {
    const run = this.run;
    const exp = this.expedition;
    const mult = TIER_MULT[result.tier] * exp.mult;
    this.lootLines.push(`${exp.title} — rated ${result.tier}`);

    for (const lo of run.weapons) lo.reserve += Math.round(WEAPONS[lo.id].mag * 2 * mult);
    this.lootLines.push('+ ammo for all weapons');

    const mats = Math.round(46 * mult) + 12;
    run.wallHp = clamp(run.wallHp + mats, 0, run.wallMaxHp);
    this.lootLines.push(`+ ${mats} wall reinforced`);

    run.playerHp = clamp((run.playerHp ?? 100) + 14, 0, 100);
    this.lootLines.push('+ 14 wounds patched');

    // A botched risky run means you got bitten getting out — it carries over.
    if (result.frac < 0.3 && exp.risk !== 'Low') {
      run.playerHp = clamp(run.playerHp - 16, 5, 100);
      this.lootLines.push('! bitten escaping — 16 HP lost');
    }

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
    run.leg = run.stats.nightsSurvived;
    run.night = this.survivedNight + 1;
    if (run.leg >= run.legsTotal) this.game.toVictory();
    else this.game.toNight();
  }

  // ── Render ──
  render(ctx) {
    if (this.phase === 'play') { this.minigame.render(ctx); return; }

    this._drawDayBackdrop(ctx);
    ctx.textAlign = 'center';
    if (this.phase === 'report') this._renderReport(ctx);
    else if (this.phase === 'choose') this._renderChoose(ctx);
    else if (this.phase === 'loot') this._renderLoot(ctx);
  }

  _drawDayBackdrop(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.H);
    sky.addColorStop(0, '#243038');
    sky.addColorStop(0.5, '#3a4750');
    sky.addColorStop(1, '#20262a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(VIEW.W * 0.5, 120, 10, VIEW.W * 0.5, 120, 220);
    g.addColorStop(0, 'rgba(255,240,210,0.4)');
    g.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.W, 360);
    ctx.globalCompositeOperation = 'source-over';

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

    const legsLeft = this.run.legsTotal - this.run.stats.nightsSurvived;
    ctx.fillStyle = PAL.hud;
    ctx.font = '15px monospace';
    ctx.fillText(legsLeft > 0
      ? `The safe zone is ${legsLeft} ${legsLeft === 1 ? 'leg' : 'legs'} down the road.`
      : 'The safe zone is in sight.', VIEW.W / 2, 312);
    this._roadPips(ctx, 340);

    ctx.fillStyle = this.t % 1 < 0.6 ? PAL.accent : PAL.hudDim;
    ctx.font = '14px monospace';
    ctx.fillText('Choose where to scavenge  —  SPACE', VIEW.W / 2, 430);
  }

  _renderChoose(ctx) {
    ctx.fillStyle = PAL.accent;
    ctx.font = 'bold 28px monospace';
    ctx.fillText('WHERE DO YOU SCAVENGE?', VIEW.W / 2, 150);
    ctx.fillStyle = PAL.hudDim;
    ctx.font = '13px monospace';
    ctx.fillText('More risk, more supplies. Pick your run — press 1 / 2 / 3 or click a card.', VIEW.W / 2, 178);

    for (let i = 0; i < this.options.length; i++) {
      const e = this.options[i];
      const r = this._cardRect(i);
      const hover = this.input.mouse.x >= r.x && this.input.mouse.x <= r.x + r.w &&
        this.input.mouse.y >= r.y && this.input.mouse.y <= r.y + r.h;

      ctx.fillStyle = hover ? 'rgba(20,30,26,0.95)' : 'rgba(8,14,12,0.9)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = hover ? PAL.accent : 'rgba(127,255,138,0.3)';
      ctx.lineWidth = hover ? 2 : 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);

      ctx.textAlign = 'center';
      ctx.fillStyle = PAL.hudDim;
      ctx.font = 'bold 26px monospace';
      ctx.fillText(`${i + 1}`, r.x + r.w / 2, r.y + 44);

      ctx.fillStyle = PAL.hud;
      ctx.font = 'bold 17px monospace';
      ctx.fillText(e.title, r.x + r.w / 2, r.y + 84);
      ctx.fillStyle = PAL.hudDim;
      ctx.font = '12px monospace';
      ctx.fillText(e.loc, r.x + r.w / 2, r.y + 108);

      // Risk / reward chips.
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = riskColor(e.risk);
      ctx.fillText(`RISK: ${e.risk.toUpperCase()}`, r.x + r.w / 2, r.y + 150);
      ctx.fillStyle = '#ffd27a';
      ctx.fillText(`HAUL: ${e.reward.toUpperCase()}`, r.x + r.w / 2, r.y + 174);

      ctx.fillStyle = PAL.hudDim;
      ctx.font = '11px monospace';
      this._wrap(ctx, this._blurb(e.id), r.x + r.w / 2, r.y + 204, r.w - 36, 15);
    }
  }

  _blurb(id) {
    return ({
      cache: 'No dead here. Steady your hands and lock the dial. Safe, modest.',
      outrun: 'Unarmed in the open. Survive the pack without getting caught.',
      grab: 'Snatch all the crates you can before time runs out. Dodge the dead.',
      siphon: 'Hold the pump until the can fills. Shove the dead back to buy time.',
    })[id] || '';
  }

  _roadPips(ctx, y) {
    const n = this.run.legsTotal;
    const pw = 40, gap = 12, total = n * pw + (n - 1) * gap;
    let x = VIEW.W / 2 - total / 2;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < this.run.stats.nightsSurvived ? PAL.good : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, pw, 8);
      x += pw + gap;
    }
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
      ctx.fillStyle = line.startsWith('!') ? '#d8662e' : PAL.hud;
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
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, y); line = w; y += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, cx, y);
  }
}
