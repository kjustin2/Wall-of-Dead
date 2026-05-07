import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { meta } from '../engine/MetaProgress.js';
import { WEAPONS } from '../weapons/WeaponDefs.js';
import { PALETTE, NIGHT } from '../Config.js';

// Pre-run loadout pick. Three buttons, each starting weapon. Player choice
// initializes RunState and advances to MapScene.
//
// M3 ships with the three baseline weapons unlocked by default; later
// milestones gate options behind MetaProgress.unlockedStarters.

const ALL_STARTERS = [
  { id: 'pistol',  blurb: 'reliable. 12-round mag. you know this one.' },
  { id: 'smg',     blurb: 'spray-and-pray. burns ammo. forgives bad aim.' },
  { id: 'shotgun', blurb: 'point-blank god, six shells, slow reload.' },
];

export class BaseCampScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.t = 0;
    this.options = [];   // populated in enter()
    this.hoverIdx = -1;
  }

  enter() {
    this.t = 0;
    this.hoverIdx = -1;
    const unlocked = new Set(meta.state.unlockedStarters || ['pistol']);
    // M3: while we're still building unlock loops, expose all 3 baselines.
    unlocked.add('pistol'); unlocked.add('smg'); unlocked.add('shotgun');
    this.options = ALL_STARTERS
      .filter(o => unlocked.has(o.id))
      .map(o => ({ ...o, def: WEAPONS[o.id] }));
  }

  update(dt) {
    this.t += dt;
    const w = this.input.canvas.width, h = this.input.canvas.height;
    const baseY = h * 0.50;
    const cardW = 280, cardH = 180, gap = 28;
    const totalW = this.options.length * cardW + (this.options.length - 1) * gap;
    const startX = (w - totalW) / 2;

    this.hoverIdx = -1;
    for (let i = 0; i < this.options.length; i++) {
      const x = startX + i * (cardW + gap);
      if (this.input.mouse.x >= x && this.input.mouse.x <= x + cardW
          && this.input.mouse.y >= baseY && this.input.mouse.y <= baseY + cardH) {
        this.hoverIdx = i;
        break;
      }
    }

    if (this.input.consumeClick() && this.hoverIdx >= 0) {
      const pick = this.options[this.hoverIdx];
      runState.start({ starterId: pick.id });
      events.emit('SCENE_CHANGE', { name: 'map' });
    }

    if (this.input.consumeKey('escape')) {
      events.emit('SCENE_CHANGE', { name: 'intro' });
    }
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);

    // Atmosphere — flickering campfire glow at center
    const flicker = 0.85 + Math.sin(this.t * 12) * 0.04 + Math.sin(this.t * 7) * 0.03;
    const cx = w / 2, cy = h * 0.30;
    const fire = ctx.createRadialGradient(cx, cy, 12, cx, cy, 220);
    fire.addColorStop(0, `rgba(255,140,40,${0.35 * flicker})`);
    fire.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fire;
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BASE CAMP', w / 2, h * 0.18);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '13px monospace';
    ctx.fillText(`${NIGHT.totalNights} nights between you and the freedom zone.`, w / 2, h * 0.22);
    ctx.fillText('pick one. you can find more out there.', w / 2, h * 0.245);

    // Loadout cards
    const baseY = h * 0.50;
    const cardW = 280, cardH = 180, gap = 28;
    const totalW = this.options.length * cardW + (this.options.length - 1) * gap;
    const startX = (w - totalW) / 2;
    for (let i = 0; i < this.options.length; i++) {
      const x = startX + i * (cardW + gap);
      const hovered = i === this.hoverIdx;
      ctx.fillStyle = hovered ? 'rgba(126,255,102,0.08)' : 'rgba(20,20,26,0.65)';
      ctx.fillRect(x, baseY, cardW, cardH);
      ctx.strokeStyle = hovered ? PALETTE.uiAccent : PALETTE.uiDim;
      ctx.lineWidth = hovered ? 2 : 1;
      ctx.strokeRect(x, baseY, cardW, cardH);

      const opt = this.options[i];
      const def = opt.def;
      ctx.fillStyle = hovered ? PALETTE.uiAccent : PALETTE.uiText;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name, x + cardW / 2, baseY + 36);

      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '12px monospace';
      ctx.fillText(opt.blurb, x + cardW / 2, baseY + 62);

      // Stat block
      ctx.textAlign = 'left';
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = PALETTE.uiText;
      ctx.fillText(`MAG`,   x + 30, baseY + 100);
      ctx.fillText(`DMG`,   x + 30, baseY + 118);
      ctx.fillText(`RPS`,   x + 30, baseY + 136);
      ctx.fillText(`AMMO`,  x + 30, baseY + 154);
      ctx.fillStyle = PALETTE.uiAccent;
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${def.magSize}`,                                  x + cardW - 30, baseY + 100);
      ctx.fillText(`${def.damage}${def.pellets > 1 ? ` × ${def.pellets}` : ''}`, x + cardW - 30, baseY + 118);
      ctx.fillText(`${def.fireRate.toFixed(1)} /s`,                   x + cardW - 30, baseY + 136);
      ctx.fillText(`${def.startReserve} ${def.ammoType.label}`,       x + cardW - 30, baseY + 154);
    }

    // Hint
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('click a card to start the run · ESC to go back', w / 2, h - 24);
  }

  engineState() { return 'menu'; }
}
