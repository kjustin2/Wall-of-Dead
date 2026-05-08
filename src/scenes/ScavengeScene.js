import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { meta } from '../engine/MetaProgress.js';
import { LockpickGame } from '../minigames/LockpickGame.js';
import { WireCutGame } from '../minigames/WireCutGame.js';
import { SimonGame } from '../minigames/SimonGame.js';
import { PipeGame } from '../minigames/PipeGame.js';
import { WEAPONS } from '../weapons/WeaponDefs.js';
import { PALETTE } from '../Config.js';

// Pool of available minigames. ScavengeScene picks one each enter so
// repeat scavenge nodes don't feel identical.
const MINIGAME_POOL = [
  () => new LockpickGame(),
  () => new WireCutGame(),
  () => new SimonGame(),
  () => new PipeGame(),
];

// Scavenge: pick a minigame, play it, translate the result tier into loot,
// then return to the map. Loot was rebalanced for the horror scarcity arc:
// bare-minimum ammo at low tiers; high tiers now also drop heavy/explosive/
// fuel/rocket so non-starter weapons can actually be fed. Weapon drops bumped
// upward — A guarantees a new weapon (so the cycle UI sees real use early),
// S guarantees a new weapon as long as any are unowned.
//
//   D — trickle of pistol ammo, nothing else
//   C — slightly more pistol/shell ammo
//   B — ammo + small heal + 20% chance of a weapon
//   A — bigger ammo across types + heal + GUARANTEED new weapon
//   S — generous ammo + big heal + GUARANTEED new weapon

const TIER_RESULTS = {
  D: { ammoLight:  8, ammoShell: 1, ammoHeavy: 0,  ammoExplosive: 0, ammoRocket: 0, ammoFuel: 0,  heal:  0, weaponChance: 0     },
  C: { ammoLight: 14, ammoShell: 2, ammoHeavy: 0,  ammoExplosive: 0, ammoRocket: 0, ammoFuel: 0,  heal:  0, weaponChance: 0     },
  B: { ammoLight: 20, ammoShell: 4, ammoHeavy: 5,  ammoExplosive: 0, ammoRocket: 0, ammoFuel: 0,  heal:  8, weaponChance: 0.20  },
  A: { ammoLight: 30, ammoShell: 6, ammoHeavy: 8,  ammoExplosive: 1, ammoRocket: 0, ammoFuel: 18, heal: 18, weaponChance: 1.00  },
  S: { ammoLight: 50, ammoShell: 10, ammoHeavy: 14, ammoExplosive: 2, ammoRocket: 1, ammoFuel: 30, heal: 35, weaponChance: 1.00 },
};

const RARE_WEAPON_POOL = ['shotgun', 'smg', 'ar', 'sniper', 'flame', 'rocket', 'bat', 'mine', 'grenade'];

export class ScavengeScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.game = null;
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
    // Pick a minigame at random from the pool — keeps scavenges fresh.
    const factory = MINIGAME_POOL[Math.floor(Math.random() * MINIGAME_POOL.length)];
    this.game = factory();
    // Difficulty scales loosely with night progression — the further along
    // the run, the tighter the wedges to keep loot meaningful.
    const n = runState.nightNum || 0;
    const difficulty = n <= 2 ? 'easy' : (n <= 5 ? 'normal' : 'hard');
    // WireCut needs the canvas reference for click hit-testing; expose it on the input
    // (it already has `canvas`, but inline doc here so future minigames see the pattern).
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
    // giveAmmoByType only top-ups weapons of the matching type that the
    // player actually owns, so it's safe to push all five — unowned types
    // become silent no-ops.
    if (t.ammoLight)     runState.giveAmmoByType('LIGHT', t.ammoLight);
    if (t.ammoShell)     runState.giveAmmoByType('SHELL', t.ammoShell);
    if (t.ammoHeavy)     runState.giveAmmoByType('HEAVY', t.ammoHeavy);
    if (t.ammoExplosive) runState.giveAmmoByType('EXPLOSIVE', t.ammoExplosive);
    if (t.ammoRocket)    runState.giveAmmoByType('ROCKET', t.ammoRocket);
    if (t.ammoFuel)      runState.giveAmmoByType('FUEL', t.ammoFuel);
    if (t.heal)          runState.heal(t.heal);

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
      let yy = h * 0.66;
      if (this.loot.ammoLight)     { ctx.fillText(`+${this.loot.ammoLight} 9mm`, w / 2, yy); yy += 16; }
      if (this.loot.ammoShell)     { ctx.fillText(`+${this.loot.ammoShell} shells`, w / 2, yy); yy += 16; }
      if (this.loot.ammoHeavy)     { ctx.fillText(`+${this.loot.ammoHeavy} 7.62`, w / 2, yy); yy += 16; }
      if (this.loot.ammoExplosive) { ctx.fillText(`+${this.loot.ammoExplosive} demo`, w / 2, yy); yy += 16; }
      if (this.loot.ammoRocket)    { ctx.fillText(`+${this.loot.ammoRocket} rocket`, w / 2, yy); yy += 16; }
      if (this.loot.ammoFuel)      { ctx.fillText(`+${this.loot.ammoFuel} fuel`, w / 2, yy); yy += 16; }
      if (this.loot.heal)          { ctx.fillText(`+${this.loot.heal} HP`, w / 2, yy); yy += 16; }
      if (this.loot.weaponId) {
        ctx.fillStyle = '#ffd644';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`+ ${this.loot.weaponId.toUpperCase()} (NEW WEAPON!)`, w / 2, yy);
        yy += 18;
        // Cycle hint shown alongside the new weapon — a second on-screen
        // breadcrumb in case the player misses the in-combat HUD toast.
        ctx.fillStyle = PALETTE.uiAccent;
        ctx.font = 'bold 12px monospace';
        ctx.fillText('CYCLE WEAPONS:  [1-9]   /   MOUSE WHEEL', w / 2, yy);
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
