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

const SESSION_KEY = 'wod_run_v2';
// Phase 2 added zone-aware fields. We still read v1 saves for one
// release window (migrating them on first resume) so a player who
// installed v1 mid-run doesn't lose their progress.
const LEGACY_V1_KEY = 'wod_run_v1';

// Starter loadout: a primary firearm (the chosen starter) + a melee bat as
// always-available backup. Two slots from frame one means players see the
// cycle UI immediately and the scarcity arc has somewhere to expand into.
function freshPlayerState(starterId) {
  const inv = [
    new Weapon(WEAPONS[starterId] || WEAPONS.pistol),
    new Weapon(WEAPONS.bat),
  ];
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
    // First-time cycle-tutorial bookkeeping. _pendingCycleHint is consumed by
    // CombatScene.enter() to show a HUD toast; _cycleHintShown latches so we
    // never re-show on later weapon pickups in the same run.
    this._pendingCycleHint = false;
    this._cycleHintShown = false;
    // Phase 4: narrative tracking. Arrays so the snapshot serializes
    // cleanly; we de-dup on insert. Subscribed once at module load —
    // RunState is a singleton, so no listener leak.
    this.notesRead = [];
    this.tapesPlayed = [];
    // Phase 5 road-segment fields — additive to v2. RoadScene flips
    // onRoad on enter and writes roadProgress each frame so a refresh
    // mid-walk resumes at the same x along the corridor.
    this.onRoad = false;
    this.roadProgress = 0;
    events.on('NOTE_READ', ({ noteId }) => {
      if (!this.active || !noteId) return;
      if (!this.notesRead.includes(noteId)) {
        this.notesRead.push(noteId);
        this.persist();
      }
    });
    events.on('TAPE_PLAYED', ({ tapeId }) => {
      if (!this.active || !tapeId) return;
      if (!this.tapesPlayed.includes(tapeId)) {
        this.tapesPlayed.push(tapeId);
        this.persist();
      }
    });
  }

  start({ seed, starterId } = {}) {
    this.seed = (seed != null) ? seed : ((Math.random() * 2 ** 31) | 0);
    const rng = mulberry32(this.seed);
    this.graph = generateGraph(rng);
    this.currentNodeId = this.graph.startId;
    this.nightNum = 0;
    this.starterId = starterId || 'pistol';
    this.player = freshPlayerState(this.starterId);
    this._pendingCycleHint = false;
    this._cycleHintShown = false;
    // Phase 2 zone fields. currentZoneId is null between combat scenes;
    // CombatScene writes the active zone here when persist() is called
    // mid-night, and reads it on enter() to resume in the right room.
    // zoneStates is a dict keyed by `${floorId}/${zoneId}` so zones across
    // different nights don't collide.
    this.currentZoneId = null;
    this.zoneStates = {};
    this.checkpointStack = [];
    this.notesRead = [];
    this.tapesPlayed = [];
    this.active = true;
    this.persist();
    events.emit('RUN_STARTED', { seed: this.seed });
  }

  // Push a snapshot of the player's state onto the checkpoint stack.
  // Called when CombatScene detects the player entered a fork zone —
  // dying past that point respawns here instead of dropping the run.
  // The snapshot is value-only (`{id, mag, reserve}` for weapons) so
  // restore can rebuild Weapon instances from defs without sharing refs.
  pushCheckpoint(scene) {
    const p = (scene && scene.player) || this.player;
    const snap = {
      hp: p.hp, maxHp: p.maxHp,
      scrap: p.scrap, kills: p.kills,
      currentWeaponIdx: p.currentWeaponIdx,
      inventory: (p.inventory || []).map(w => ({ id: w.id, mag: w.mag, reserve: w.reserve })),
      currentZoneId: scene && scene.arena ? scene.arena.activeZoneId : this.currentZoneId,
    };
    this.checkpointStack.push(snap);
    this.persist();
    events.emit('CHECKPOINT_PUSHED', { zoneId: snap.currentZoneId });
  }

  popCheckpoint() {
    if (!this.checkpointStack.length) return null;
    const snap = this.checkpointStack.pop();
    this.persist();
    return snap;
  }

  // Restore the most recent checkpoint onto a live CombatScene's player +
  // active zone. Caller is responsible for repositioning, draining
  // hazards, and resetting `dead`/`deathDelay` flags after this returns.
  restoreCheckpoint(scene) {
    const snap = this.popCheckpoint();
    if (!snap || !scene || !scene.player) return null;
    const p = scene.player;
    p.hp = snap.hp;
    p.maxHp = snap.maxHp;
    p.scrap = snap.scrap;
    p.kills = snap.kills;
    p.iframe = 0;
    p.alive = true;
    p.inventory = (snap.inventory || []).map(rec => {
      const def = WEAPONS[rec.id] || WEAPONS.pistol;
      const w = new Weapon(def);
      w.mag = rec.mag;
      w.reserve = rec.reserve;
      return w;
    });
    p.currentWeaponIdx = Math.max(0, Math.min(snap.currentWeaponIdx || 0, p.inventory.length - 1));
    return snap;
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
    // First non-starter pickup queues the "cycle weapons" tutorial toast.
    // Starter loadout is 2 (gun + bat); 3+ means the player has more than
    // one trigger weapon and actually benefits from cycling.
    if (!this._cycleHintShown && this.player.inventory.length >= 3) {
      this._pendingCycleHint = true;
    }
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
    try {
      return !!sessionStorage.getItem(SESSION_KEY)
          || !!sessionStorage.getItem(LEGACY_V1_KEY);
    } catch { return false; }
  }

  resume() {
    if (typeof sessionStorage === 'undefined') return false;
    try {
      let raw = sessionStorage.getItem(SESSION_KEY);
      let migratedFromV1 = false;
      if (!raw) {
        const legacy = sessionStorage.getItem(LEGACY_V1_KEY);
        if (!legacy) return false;
        raw = legacy;
        migratedFromV1 = true;
      }
      const s = JSON.parse(raw);
      const upgraded = migratedFromV1 ? _migrateV1ToV2(s) : s;
      this.seed = upgraded.seed;
      this.graph = generateGraph(mulberry32(this.seed));
      for (const id of upgraded.resolvedIds || []) {
        const n = this.graph.nodeMap[id];
        if (n) n.resolved = true;
      }
      this.currentNodeId = upgraded.currentNodeId;
      this.nightNum = upgraded.nightNum || 0;
      this.starterId = upgraded.starterId || 'pistol';
      this.currentZoneId = upgraded.currentZoneId || null;
      this.zoneStates = upgraded.zoneStates || {};
      this.checkpointStack = upgraded.checkpointStack || [];
      this.notesRead = upgraded.notesRead || [];
      this.tapesPlayed = upgraded.tapesPlayed || [];
      this.onRoad = !!upgraded.onRoad;
      this.roadProgress = upgraded.roadProgress || 0;
      this.player = {
        hp: upgraded.player.hp,
        maxHp: upgraded.player.maxHp,
        scrap: upgraded.player.scrap,
        kills: upgraded.player.kills,
        inventory: (upgraded.player.inventory || []).map(wRec => {
          const def = WEAPONS[wRec.id] || WEAPONS.pistol;
          const w = new Weapon(def);
          w.mag = wRec.mag;
          w.reserve = wRec.reserve;
          return w;
        }),
        currentWeaponIdx: upgraded.player.currentWeaponIdx || 0,
      };
      this.active = true;
      // Migration leg: write the upgraded snapshot under the v2 key and
      // clear the legacy key so subsequent reads are direct v2.
      if (migratedFromV1) {
        this.persist();
        try { sessionStorage.removeItem(LEGACY_V1_KEY); } catch {}
      }
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
      currentZoneId: this.currentZoneId,
      zoneStates: this.zoneStates,
      checkpointStack: this.checkpointStack || [],
      notesRead: this.notesRead || [],
      tapesPlayed: this.tapesPlayed || [],
      onRoad: !!this.onRoad,
      roadProgress: this.roadProgress || 0,
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

// Defaults additive Phase 2 fields onto a v1 snapshot so a mid-run install
// upgrade keeps the player on their existing graph node + inventory but
// places them at their floor's entry zone on the next combat enter.
function _migrateV1ToV2(s) {
  return {
    ...s,
    currentZoneId: s.currentZoneId != null ? s.currentZoneId : null,
    zoneStates: s.zoneStates || {},
    checkpointStack: s.checkpointStack || [],
    notesRead: s.notesRead || [],
    tapesPlayed: s.tapesPlayed || [],
    onRoad: !!s.onRoad,
    roadProgress: s.roadProgress || 0,
  };
}

export const runState = new RunState();
