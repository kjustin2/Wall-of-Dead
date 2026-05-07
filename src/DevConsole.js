// window._dev — debug + automation API. Mirrors the shape of
// roguehero2/src/DevConsole.js so the same muscle-memory transfers, but
// scoped to Wall-of-Dead's scene names and weapon registry.
//
// Use freely from devtools or paste the smoke recipe from the README.

import { events } from './engine/EventBus.js';
import { runState } from './world/RunState.js';
import { meta } from './engine/MetaProgress.js';
import { WEAPONS } from './weapons/WeaponDefs.js';
import { Weapon } from './weapons/Weapon.js';

export function installDevConsole({ sceneManager, audio, renderer, engine }) {
  const dev = {
    // ── Scene navigation ──
    go(name, params) { events.emit('SCENE_CHANGE', { name, params }); },
    scene() { return sceneManager.currentName; },

    // ── Run state ──
    startRun(opts = {}) {
      runState.start(opts);
      events.emit('SCENE_CHANGE', { name: 'map' });
    },
    setNight(n) {
      runState.nightNum = Math.max(0, n | 0);
      runState.persist();
    },
    skipToBoss() {
      if (!runState.graph) return false;
      runState.currentNodeId = runState.graph.endId;
      runState.nightNum = 7;
      runState.persist();
      events.emit('SCENE_CHANGE', { name: 'combat', params: { boss: true, nightNum: 7 } });
      return true;
    },

    // ── Combat helpers (active CombatScene only) ──
    _combat() {
      const scene = sceneManager.current;
      if (!scene || !scene.director || !scene.player) return null;
      return scene;
    },
    spawnZombie(id, x, y) {
      const s = this._combat(); if (!s) return false;
      x = x != null ? x : s.player.x + 200;
      y = y != null ? y : s.player.y;
      const z = s.director.spawnNear(id, x, y, 0);
      if (z) z.spawnTimer = 0;
      return !!z;
    },
    killAll() {
      const s = this._combat(); if (!s) return 0;
      let n = 0;
      for (const z of s.director.zombies) { z.hp = 0; z.alive = false; n++; }
      return n;
    },
    killBoss() {
      const s = this._combat(); if (!s) return false;
      const boss = s.director.zombies.find(z => z.id === 'patient_zero');
      if (!boss) return false;
      boss.takeDamage(boss.hp + 1);
      return true;
    },
    setHp(n) {
      const s = this._combat(); if (!s) return false;
      s.player.hp = Math.max(1, Math.min(s.player.maxHp, n));
      return true;
    },
    godmode(on) {
      const s = this._combat(); if (!s) return false;
      // Cheat: monkey-patch takeDamage to a no-op while godmode is on.
      if (on) {
        if (!s.player._origTakeDamage) {
          s.player._origTakeDamage = s.player.takeDamage.bind(s.player);
          s.player.takeDamage = () => {};
        }
      } else if (s.player._origTakeDamage) {
        s.player.takeDamage = s.player._origTakeDamage;
        delete s.player._origTakeDamage;
      }
      return true;
    },

    // ── Weapons ──
    giveWeapon(id, ammoBonus) {
      const def = WEAPONS[id];
      if (!def) return false;
      const target = runState.active ? runState.player : (this._combat() ? this._combat().player : null);
      if (!target) return false;
      const existing = target.inventory.find(w => w.id === id);
      if (existing) {
        existing.reserve += ammoBonus != null ? ammoBonus : Math.floor(def.startReserve / 2);
      } else {
        target.inventory.push(new Weapon(def));
      }
      meta.unlockWeapon(id);
      return true;
    },
    giveAllWeapons() {
      for (const id of Object.keys(WEAPONS)) this.giveWeapon(id);
      return Object.keys(WEAPONS);
    },
    refillAmmo() {
      const target = runState.active ? runState.player : (this._combat() ? this._combat().player : null);
      if (!target) return false;
      for (const w of target.inventory) {
        w.mag = w.def.magSize;
        w.reserve = w.def.startReserve;
      }
      return true;
    },

    // ── Diagnostics ──
    snapshot() {
      const s = this._combat();
      return {
        scene: sceneManager.currentName,
        runActive: runState.active,
        nightNum: runState.nightNum,
        nodeId: runState.currentNodeId,
        seed: runState.seed,
        player: s ? {
          hp: s.player.hp,
          scrap: s.player.scrap,
          kills: s.player.kills,
          weapon: s.player.weapon && s.player.weapon.id,
          inventory: s.player.inventory.map(w => `${w.id}:${w.mag}/${w.reserve}`),
        } : null,
        zombies: s ? s.director.zombies.length : 0,
        projectiles: s ? s.projectiles.list.length : 0,
        mines: s ? s.mines.length : 0,
        grenades: s ? s.grenades.length : 0,
      };
    },
    eventListenerCounts() { return events.counts(); },

    // ── Meta ──
    resetMeta() { meta.resetAll(); return true; },
    unlockAll() {
      for (const id of Object.keys(WEAPONS)) {
        meta.unlockWeapon(id);
        meta.unlockStarter(id);
      }
      return Object.keys(WEAPONS);
    },

    // ── Audio ──
    silenceMusic() { audio.silenceBgm(); },
    setVolume(v)   { audio.setMasterVolume(v); meta.setMasterVolume(v); },

    // ── Engine ──
    pause()  { engine.stop();  return 'paused'; },
    resume() { engine.start(); return 'running'; },
  };

  if (typeof window !== 'undefined') window._dev = dev;
  return dev;
}
