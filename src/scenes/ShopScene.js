import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { meta } from '../engine/MetaProgress.js';
import { WEAPONS } from '../weapons/WeaponDefs.js';
import { drawWrapped } from '../util/text.js';
import { PALETTE } from '../Config.js';

// Real shop screen. Generates 4 buy slots when the scene is entered:
//   - 9mm bundle  (always available)
//   - shells      (always available)
//   - heal kit    (always available)
//   - random weapon you don't yet own (or a second ammo bundle if all owned)
//
// Costs scale with night number so early-shop heals are accessible while
// late-shop full restocks demand a real scrap stockpile.

const RARE_POOL = ['shotgun', 'smg', 'ar', 'sniper', 'flame', 'rocket', 'grenade', 'mine', 'bat'];

export class ShopScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.slots = [];
    this.hoverIdx = -1;
    this.t = 0;
  }

  enter() {
    this.t = 0;
    this.hoverIdx = -1;
    const n = Math.max(1, runState.nightNum || 1);

    const owned = new Set(runState.player.inventory.map(w => w.id));
    const available = RARE_POOL.filter(id => !owned.has(id) && WEAPONS[id]);
    const wpnId = available[Math.floor(Math.random() * available.length)] || null;

    this.slots = [
      {
        id: 'ammo_light',
        title: '9MM AMMO',
        desc: '28 rounds for pistol / SMG.',
        cost: 6 + n * 2,
        apply: () => runState.giveAmmoByType('LIGHT', 28),
      },
      {
        id: 'ammo_shell',
        title: 'SHELLS',
        desc: '8 shotgun shells.',
        cost: 8 + n * 2,
        apply: () => runState.giveAmmoByType('SHELL', 8),
      },
      {
        id: 'medkit',
        title: 'MED KIT',
        desc: '+35 HP. patch up before the next night.',
        cost: 10 + n * 3,
        apply: () => runState.heal(35),
      },
      wpnId ? {
        id: 'weapon_' + wpnId,
        title: WEAPONS[wpnId].name.toUpperCase(),
        desc: this._descFor(wpnId),
        cost: 18 + n * 4,
        apply: () => { runState.giveWeapon(wpnId); meta.unlockWeapon(wpnId); },
        rare: true,
      } : {
        id: 'ammo_heavy',
        title: '7.62 AMMO',
        desc: '40 rounds for AR / sniper.',
        cost: 12 + n * 3,
        apply: () => runState.giveAmmoByType('HEAVY', 40),
      },
    ];
  }

  _descFor(id) {
    const blurbs = {
      shotgun:  'point-blank slug, heavy kick.',
      smg:      'auto spray, light ammo.',
      ar:       'precise auto, heavy ammo.',
      sniper:   'piercing shot, slow reload.',
      flame:    'short cone of fire.',
      rocket:   'big AoE, low ammo.',
      grenade:  'thrown timed AoE.',
      mine:     'place, then bait.',
      bat:      'melee, never reloads.',
    };
    return blurbs[id] || 'a useful tool for the road ahead.';
  }

  update(dt) {
    this.t += dt;
    const w = this.input.canvas.width, h = this.input.canvas.height;
    const cardW = 220, cardH = 180, gap = 22;
    const totalW = this.slots.length * cardW + (this.slots.length - 1) * gap;
    const startX = (w - totalW) / 2;
    const yTop = h * 0.42;

    this.hoverIdx = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const x = startX + i * (cardW + gap);
      if (this.input.mouse.x >= x && this.input.mouse.x <= x + cardW
          && this.input.mouse.y >= yTop && this.input.mouse.y <= yTop + cardH) {
        this.hoverIdx = i;
        break;
      }
    }

    if (this.input.consumeClick() && this.hoverIdx >= 0) {
      const slot = this.slots[this.hoverIdx];
      if (slot && !slot.bought && runState.player.scrap >= slot.cost) {
        runState.player.scrap -= slot.cost;
        slot.apply();
        slot.bought = true;
        runState.persist();
      }
    }

    if (this.input.consumeKey('escape') || this.input.consumeKey('enter') || this.input.consumeKey(' ')) {
      events.emit('SCENE_CHANGE', { name: 'map' });
    }
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';

    // Title
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 28px monospace';
    ctx.fillText('TRADER', w / 2, h * 0.20);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '13px monospace';
    ctx.fillText('spend scrap on supplies. esc / enter / space to leave.', w / 2, h * 0.25);

    // Scrap balance
    ctx.fillStyle = PALETTE.uiAccent;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`SCRAP  ${runState.player.scrap}`, w / 2, h * 0.32);

    // Cards
    const cardW = 220, cardH = 180, gap = 22;
    const totalW = this.slots.length * cardW + (this.slots.length - 1) * gap;
    const startX = (w - totalW) / 2;
    const yTop = h * 0.42;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const x = startX + i * (cardW + gap);
      const hovered = i === this.hoverIdx;
      const canAfford = runState.player.scrap >= slot.cost && !slot.bought;

      ctx.fillStyle = slot.bought ? 'rgba(20,30,20,0.6)'
                    : hovered ? 'rgba(126,255,102,0.10)'
                              : 'rgba(20,20,26,0.65)';
      ctx.fillRect(x, yTop, cardW, cardH);
      ctx.strokeStyle = slot.rare ? '#ffd644'
                      : (hovered && canAfford) ? PALETTE.uiAccent
                      : PALETTE.uiDim;
      ctx.lineWidth = hovered && canAfford ? 2 : 1;
      ctx.strokeRect(x, yTop, cardW, cardH);

      // Title
      ctx.fillStyle = slot.rare ? '#ffd644' : (hovered && canAfford ? PALETTE.uiAccent : PALETTE.uiText);
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(slot.title, x + cardW / 2, yTop + 32);

      // Desc (wrapped, capped at 4 lines so a long blurb can't bleed
      // into the cost line at the bottom of the card).
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '12px monospace';
      drawWrapped(ctx, slot.desc, x + cardW / 2, yTop + 60, cardW - 30, 16, 4);

      // Cost / state
      ctx.fillStyle = slot.bought ? PALETTE.uiDim
                    : canAfford   ? PALETTE.uiAccent
                                  : PALETTE.uiDanger;
      ctx.font = 'bold 18px monospace';
      ctx.fillText(slot.bought ? 'BOUGHT' : `${slot.cost} scrap`, x + cardW / 2, yTop + cardH - 22);
    }

    // Footer
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('click a card to buy · esc / enter to leave', w / 2, h - 24);
  }

  engineState() { return 'menu'; }
}
