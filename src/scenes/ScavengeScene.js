import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { meta } from '../engine/MetaProgress.js';
import { LockpickGame } from '../minigames/LockpickGame.js';
import { WEAPONS } from '../weapons/WeaponDefs.js';
import { PALETTE } from '../Config.js';

// Scavenge: pick a minigame (just lockpick for M4), play it, translate the
// result tier into loot, then return to the map.
//
// Loot tiers map roughly to:
//   D — small ammo, nothing else
//   C — bigger ammo
//   B — ammo + small heal
//   A — big ammo + heal + 30% chance of a weapon you don't own
//   S — full ammo + heal + guaranteed new weapon if any unowned exist

const TIER_RESULTS = {
  D: { ammoLight: 12, ammoShell:  2, heal: 0,  weaponChance: 0,    bigHeal: false },
  C: { ammoLight: 22, ammoShell:  4, heal: 0,  weaponChance: 0,    bigHeal: false },
  B: { ammoLight: 32, ammoShell:  6, heal: 8,  weaponChance: 0.10, bigHeal: false },
  A: { ammoLight: 48, ammoShell:  9, heal: 18, weaponChance: 0.30, bigHeal: false },
  S: { ammoLight: 80, ammoShell: 14, heal: 35, weaponChance: 1.00, bigHeal: true },
};

const RARE_WEAPON_POOL = ['shotgun', 'smg'];   // M5 expands w/ AR/sniper/rocket

export class ScavengeScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.game = new LockpickGame();
    this.phase = 'play';      // 'play' → 'reveal' → 'done'
    this.result = null;
    this.loot = null;
    this.revealT = 0;
  }

  enter() {
    this.phase = 'play';
    this.result = null;
    this.loot = null;
    this.revealT = 0;
    // Difficulty scales loosely with night progression — the further along
    // the run, the tighter the wedges to keep loot meaningful.
    const n = runState.nightNum || 0;
    const difficulty = n <= 2 ? 'easy' : (n <= 5 ? 'normal' : 'hard');
    this.game.start({ difficulty });
  }

  update(dt) {
    if (this.phase === 'play') {
      this.game.update(dt, this.input);
      if (this.game.done) {
        this.result = this.game.getResult();
        this.loot = this._awardLoot(this.result.tier);
        this.phase = 'reveal';
        this.revealT = 0;
      }
      if (this.input.consumeKey('escape')) {
        events.emit('SCENE_CHANGE', { name: 'map' });
      }
      return;
    }

    if (this.phase === 'reveal') {
      this.revealT += dt;
      if (this.revealT > 0.6 && (this.input.consumeClick() || this.input.consumeKey('enter') || this.input.consumeKey(' '))) {
        events.emit('SCENE_CHANGE', { name: 'map' });
      }
    }
  }

  _awardLoot(tier) {
    const t = TIER_RESULTS[tier] || TIER_RESULTS.D;
    if (t.ammoLight) runState.giveAmmoByType('LIGHT', t.ammoLight);
    if (t.ammoShell) runState.giveAmmoByType('SHELL', t.ammoShell);
    if (t.heal)      runState.heal(t.heal);

    let unlockedWeapon = null;
    if (t.weaponChance > 0 && Math.random() < t.weaponChance) {
      const owned = new Set(runState.player.inventory.map(w => w.id));
      const candidates = RARE_WEAPON_POOL.filter(id => !owned.has(id) && WEAPONS[id]);
      if (candidates.length > 0) {
        const id = candidates[Math.floor(Math.random() * candidates.length)];
        if (runState.giveWeapon(id)) {
          unlockedWeapon = id;
          meta.unlockWeapon(id);
        }
      }
    }

    runState.persist();
    events.emit('LOOT_AWARDED', { tier, ammoLight: t.ammoLight, ammoShell: t.ammoShell, heal: t.heal, unlockedWeapon });
    return { ...t, weaponId: unlockedWeapon };
  }

  render(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);

    if (this.phase === 'play') {
      this.game.render(ctx);
      // ESC hint
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ESC to skip back to map (you forfeit the loot)', w / 2, h - 24);
      return;
    }

    // ── Reveal phase ──
    const tierColor = { D: '#8a8a8a', C: '#bdbdc8', B: '#ada490', A: '#7eff66', S: '#ffd644' }[this.result.tier];
    const t = Math.min(1, this.revealT * 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('SCAVENGED', w / 2, h * 0.22);

    // Big tier letter
    ctx.fillStyle = tierColor;
    ctx.globalAlpha = t;
    const size = 130 + (1 - Math.min(1, this.revealT * 1.5)) * 60;
    ctx.font = `bold ${size}px monospace`;
    ctx.fillText(this.result.tier, w / 2, h * 0.50);
    ctx.globalAlpha = 1;

    // Sub-stats
    const sub = `${this.result.missed} missed · ${this.result.timeUsed.toFixed(1)}s used · ${(this.result.score * 100).toFixed(0)}%`;
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText(sub, w / 2, h * 0.58);

    // Loot list
    if (this.loot) {
      ctx.fillStyle = PALETTE.uiAccent;
      ctx.font = 'bold 14px monospace';
      let yy = h * 0.68;
      if (this.loot.ammoLight) { ctx.fillText(`+${this.loot.ammoLight} 9mm`, w / 2, yy); yy += 18; }
      if (this.loot.ammoShell) { ctx.fillText(`+${this.loot.ammoShell} shells`, w / 2, yy); yy += 18; }
      if (this.loot.heal)      { ctx.fillText(`+${this.loot.heal} HP`, w / 2, yy); yy += 18; }
      if (this.loot.weaponId) {
        ctx.fillStyle = '#ffd644';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`+ ${this.loot.weaponId.toUpperCase()} (NEW WEAPON!)`, w / 2, yy);
      }
    }

    if (this.revealT > 0.6) {
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '11px monospace';
      ctx.fillText('click / enter / space to continue', w / 2, h - 24);
    }
  }

  engineState() { return 'minigame'; }
}
