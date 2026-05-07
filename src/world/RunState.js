// In-memory state of the active run. Bridges scenes so CombatScene's
// inventory survives into MapScene survives into ScavengeScene survives
// into the next CombatScene. Reset on death/victory.
//
// SessionStorage holds a JSON snapshot so a mid-run reload resumes (the
// "CONTINUE" intro button reads from this). Player Weapon instances are
// rebuilt from defs on resume — we only persist mag/reserve, not class refs.

import { events } from '../engine/EventBus.js';
import { mulberry32 } from '../util/rng.js';
import { generateGraph } from './NodeGraphGen.js';
import { Weapon } from '../weapons/Weapon.js';
import { WEAPONS } from '../weapons/WeaponDefs.js';
import { PLAYER } from '../Config.js';

const SESSION_KEY = 'wod_run_v1';

function freshPlayerState(starterId) {
  const inv = [new Weapon(WEAPONS[starterId] || WEAPONS.pistol)];
  return {
    hp: PLAYER.hpMax,
    maxHp: PLAYER.hpMax,
    scrap: 0,
    kills: 0,
    inventory: inv,
    currentWeaponIdx: 0,
  };
}

class RunState {
  constructor() {
    this.active = false;
    this.seed = 0;
    this.graph = null;
    this.currentNodeId = null;
    this.nightNum = 0;          // increments only when a combat node is cleared
    this.player = freshPlayerState('pistol');
    this.starterId = 'pistol';
  }

  start({ seed, starterId } = {}) {
    this.seed = (seed != null) ? seed : ((Math.random() * 2 ** 31) | 0);
    const rng = mulberry32(this.seed);
    this.graph = generateGraph(rng);
    this.currentNodeId = this.graph.startId;
    this.nightNum = 0;
    this.starterId = starterId || 'pistol';
    this.player = freshPlayerState(this.starterId);
    this.active = true;
    this.persist();
    events.emit('RUN_STARTED', { seed: this.seed });
  }

  end(reason) {
    this.active = false;
    this.clearPersisted();
    events.emit('RUN_ENDED', { reason });
  }

  // Called by MapScene after the user clicks a reachable next node.
  advanceTo(nodeId) {
    const node = this.graph.nodeMap[nodeId];
    if (!node) return;
    this.currentNodeId = nodeId;
    node.resolved = true;
    if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
      this.nightNum += 1;
    }
    this.persist();
    events.emit('NODE_ADVANCED', { nodeId, type: node.type });
  }

  currentNode() { return this.graph ? this.graph.nodeMap[this.currentNodeId] : null; }
  isAtBoss()    { return !!(this.graph && this.currentNodeId === this.graph.endId); }

  // Pull state from a CombatScene Player so the map shows the right HP/ammo.
  syncFromPlayer(p) {
    this.player.hp = p.hp;
    this.player.maxHp = p.maxHp;
    this.player.scrap = p.scrap;
    this.player.kills = p.kills;
    this.player.inventory = p.inventory;
    this.player.currentWeaponIdx = p.currentWeaponIdx;
    this.persist();
  }

  // Apply state onto a fresh CombatScene Player (used when entering combat).
  applyToPlayer(p) {
    p.hp = this.player.hp;
    p.maxHp = this.player.maxHp;
    p.scrap = this.player.scrap;
    p.kills = this.player.kills;
    p.inventory = this.player.inventory;
    p.currentWeaponIdx = Math.max(0, Math.min(this.player.currentWeaponIdx, p.inventory.length - 1));
  }

  // Add a weapon (no-dupe) or refill ammo if already owned.
  giveWeapon(id, ammoBonus) {
    const def = WEAPONS[id];
    if (!def) return false;
    const existing = this.player.inventory.find(w => w.id === id);
    if (existing) {
      existing.reserve += ammoBonus != null ? ammoBonus : Math.floor(def.startReserve / 2);
      return false;
    }
    this.player.inventory.push(new Weapon(def));
    return true;
  }

  giveAmmoByType(typeId, amount) {
    for (const w of this.player.inventory) {
      if (w.def.ammoType.id === typeId) w.reserve += amount;
    }
  }

  heal(amount) {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
  }

  // ── Session persistence ──
  persist() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(this._snapshot()));
    } catch (e) {
      console.warn('[RunState] persist failed', e);
    }
  }

  clearPersisted() {
    if (typeof sessionStorage === 'undefined') return;
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  hasResumable() {
    if (typeof sessionStorage === 'undefined') return false;
    try { return !!sessionStorage.getItem(SESSION_KEY); } catch { return false; }
  }

  resume() {
    if (typeof sessionStorage === 'undefined') return false;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.seed = s.seed;
      this.graph = generateGraph(mulberry32(this.seed));
      // Replay resolved flags
      for (const id of s.resolvedIds || []) {
        const n = this.graph.nodeMap[id];
        if (n) n.resolved = true;
      }
      this.currentNodeId = s.currentNodeId;
      this.nightNum = s.nightNum || 0;
      this.starterId = s.starterId || 'pistol';
      // Rebuild Weapon instances from snapshots
      this.player = {
        hp: s.player.hp,
        maxHp: s.player.maxHp,
        scrap: s.player.scrap,
        kills: s.player.kills,
        inventory: (s.player.inventory || []).map(wRec => {
          const def = WEAPONS[wRec.id] || WEAPONS.pistol;
          const w = new Weapon(def);
          w.mag = wRec.mag;
          w.reserve = wRec.reserve;
          return w;
        }),
        currentWeaponIdx: s.player.currentWeaponIdx || 0,
      };
      this.active = true;
      events.emit('RUN_RESUMED', { seed: this.seed, nightNum: this.nightNum });
      return true;
    } catch (e) {
      console.warn('[RunState] resume failed', e);
      return false;
    }
  }

  _snapshot() {
    const resolvedIds = [];
    if (this.graph) {
      for (const id of Object.keys(this.graph.nodeMap)) {
        if (this.graph.nodeMap[id].resolved) resolvedIds.push(id);
      }
    }
    return {
      seed: this.seed,
      currentNodeId: this.currentNodeId,
      nightNum: this.nightNum,
      starterId: this.starterId,
      resolvedIds,
      player: {
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        scrap: this.player.scrap,
        kills: this.player.kills,
        currentWeaponIdx: this.player.currentWeaponIdx,
        inventory: this.player.inventory.map(w => ({
          id: w.id, mag: w.mag, reserve: w.reserve,
        })),
      },
    };
  }
}

export const runState = new RunState();
