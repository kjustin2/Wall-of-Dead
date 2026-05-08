// The core scene — survive the night. Owns the arena, player, zombies,
// projectiles, particles, wave director, HUD, and the per-frame integration
// of all of them.
//
// Update order each frame:
//   1. input → player.update (movement, aim, fire)
//   2. wave director → may spawn new zombies
//   3. zombie hash rebuild
//   4. projectiles update (collide vs zombie hash)
//   5. zombies update (chase, attack player)
//   6. removeDead, particles update
//   7. transition checks (player died / night complete)

import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { SpatialHash } from '../engine/SpatialHash.js';
import { ParticleSystem } from '../engine/Particles.js';
import { ProjectileManager } from '../core/Projectile.js';
import { Player } from '../core/Player.js';
import { Mine } from '../core/Mine.js';
import { Grenade } from '../core/Grenade.js';
import { Arena } from '../world/Arena.js';
import { Floor } from '../world/Floor.js';
import { getFloorForNight } from '../world/FloorDefs.js';
import { buildInteractable } from '../world/Interactables.js';
import { ScareEventRunner } from '../world/ScareEvents.js';
import { ChaseEntity } from '../world/ChaseEntity.js';
import { WaveDirector } from '../world/WaveDirector.js';
import { HUD } from '../ui/HUD.js';
import { Lighting } from '../engine/Lighting.js';
import { mulberry32 } from '../util/rng.js';
import { runState } from '../world/RunState.js';
import { SPATIAL_HASH, NIGHT, PALETTE } from '../Config.js';

export class CombatScene extends Scene {
  constructor(input, audio) {
    super();
    this.input = input;
    this.audio = audio;
    this.arena = null;
    this.player = null;
    this.projectiles = null;
    this.particles = null;
    this.director = null;
    this.zombieHash = null;
    this.hud = null;
    this.cleared = false;        // night fully complete; brief delay before transition
    this.clearedDelay = 0;
    this.dead = false;
    this.deathDelay = 0;
    this.quitConfirm = false;    // shows "QUIT TO MENU?" overlay; world is paused while open
    this._quitRects = null;      // cached Yes/No click rectangles for the overlay
  }

  enter(params) {
    // Pick the per-night floor when a real run is active. Sandbox launches
    // (intro→combat without a runState) and headless smoke tests fall back
    // to the original Arena so existing test paths remain stable.
    this._runActive = !!runState.active;
    const isBoss = !!(params && params.boss);
    if (this._runActive) {
      const nightForFloor = (params && params.nightNum) || runState.nightNum || 1;
      const floorDef = getFloorForNight(nightForFloor, isBoss);
      this.arena = new Floor(floorDef);
      this.floorDef = floorDef;
    } else {
      this.arena = new Arena();
      this.floorDef = null;
    }
    // Multi-zone Floors hang their interactables / scares / ambient cues
    // off the active zone; single-zone Floors keep them flat on the def.
    // _zoneVisited tracks which zones the player has reached so a multi-
    // zone night gates clear on the terminal zone.
    this._zoneVisited = new Set();
    this._terminalReached = false;
    this._wavesDrained = false;
    if (this.arena && this.arena.entryZoneId) {
      this._zoneVisited.add(this.arena.entryZoneId);
      if (this.arena.activeZoneId === this.arena.terminalZoneId) {
        this._terminalReached = true;
      }
    }
    this.interactables = this._buildInteractablesForActiveZone();
    this.scareRunner = this._buildScareRunnerForActiveZone();
    this.lightingDamp = 0;        // shorted-fuse darkening, ramps up on FUSE_SHORTED
    this.player = new Player(this.arena.w / 2, this.arena.h / 2);
    // If a run is active, sync inventory + HP + scrap from RunState so the
    // CombatScene continues from where the map left off. Sandbox launches
    // (intro→combat without runState.start) keep the fresh-Player defaults.
    if (this._runActive) {
      runState.applyToPlayer(this.player);
      // Crossing into combat clears any road-resume marker — if the
      // player refreshes mid-night, resume() will land them in combat,
      // not back on the road segment they already walked.
      if (runState.onRoad) {
        runState.onRoad = false;
        runState.roadProgress = 0;
        runState.persist();
      }
    }
    this.projectiles = new ProjectileManager();
    this.particles = new ParticleSystem();
    this.zombieHash = new SpatialHash(SPATIAL_HASH.cellSize);
    this.mines = [];
    this.grenades = [];
    this.hazards = [];           // Phase 3 — ChaseEntity etc., separate from zombies (no kill credit, no scrap)
    this.muzzleFlashes = [];     // {x, y, life, maxLife} short-lived bright spots for lighting
    this.hud = new HUD();
    this.lighting = new Lighting();
    // Wave RNG is a per-night substream — run-seed XORed with nightNum so
    // the same run plays back identically on resume.
    const baseSeed = (params && params.seed) != null ? params.seed
      : (this._runActive ? (runState.seed ^ (runState.nightNum * 0x9E3779B9)) : ((Math.random() * 2 ** 31) | 0));
    this.director = new WaveDirector(this.arena, mulberry32(baseSeed));
    const nightNum = (params && params.nightNum) || (this._runActive ? runState.nightNum : 1) || 1;
    this.boss = !!(params && params.boss);
    this.elite = !!(params && params.elite);
    this.director.setNight(nightNum);
    // Tell the audio system which BGM pool fits this scene. Done here
    // (not in bindAudioEvents) because the boss flag is per-scene.
    events.emit(this.boss ? 'BOSS_FIGHT_BEGIN' : 'NIGHT_FIGHT_BEGIN', { nightNum });
    // Horror ambient layer — per-zone pool when available, otherwise the
    // floor's pool, else the generic 'combat' pool for sandbox / smoke.
    if (this.audio && this.audio.ambient) {
      this.audio.ambient.start(this._activeAmbientPool());
    }
    this._dread01 = 0;

    // First non-starter weapon pickup queues the cycle-tutorial toast in
    // RunState. Pop it here so it surfaces on the very next combat entry.
    if (this._runActive && runState._pendingCycleHint) {
      this.hud.setToast('NEW WEAPON  ·  CYCLE: [1-9] / MOUSE WHEEL', PALETTE.uiAccent, 6.0);
      runState._pendingCycleHint = false;
      runState._cycleHintShown = true;
      runState.persist();
    }
    this.cleared = false;
    this.clearedDelay = 0;
    this.dead = false;
    this.deathDelay = 0;
    this.quitConfirm = false;
    this._quitRects = null;
    // Phase 3: if the entry zone IS the fork (or chase), wire it now —
    // the ZONE_CHANGED handler is only invoked on transitions, not on
    // the initial scene enter().
    if (this.arena && this.arena.activeZone) {
      this._handleZoneKindHooks(this.arena.activeZone);
    }

    // Knife/melee/flame kills route through here so kill-credit logic
    // stays in one place (projectile hits use _onZombieHit instead).
    const meleeOrFlameHit = ({ zombie, damage }) => {
      this.particles.spawnDamageNumber(zombie.x, zombie.y, damage);
      if (!zombie.alive) {
        this.player.scrap += zombie.scrapValue;
        this.player.kills += 1;
        events.emit('ZOMBIE_KILLED', { id: zombie.id, x: zombie.x, y: zombie.y, scrap: zombie.scrapValue });
      }
    };
    this.bus('KNIFE_HIT', meleeOrFlameHit);
    this.bus('FLAME_HIT', meleeOrFlameHit);

    // Mines + grenades are emitted by Player's fire dispatch; CombatScene
    // owns the entity arrays so Player doesn't need a back-reference.
    this.bus('PLACE_MINE', ({ x, y, def }) => {
      this.mines.push(new Mine(x, y, def));
    });
    this.bus('THROW_GRENADE', ({ x, y, vx, vy, def }) => {
      this.grenades.push(new Grenade(x, y, vx, vy, def));
    });

    // Screamer reinforcements: spawn N runners next to the screamer's pos.
    this.bus('SCREAMER_CALL', ({ x, y, count }) => {
      for (let i = 0; i < count; i++) {
        this.director.spawnNear('runner', x, y, 70);
      }
      this.particles.spawnDamageNumber(x, y - 18, 'INCOMING');
    });
    // Boss summons (phase 2). Spawns crawlers in a ring around the boss.
    this.bus('BOSS_SUMMON', ({ x, y, count }) => {
      for (let i = 0; i < count; i++) {
        this.director.spawnNear('crawler', x, y, 100);
      }
      this.particles.spawnDamageNumber(x, y - 28, 'SWARM');
      events.emit('SCREEN_SHAKE', { duration: 0.12, intensity: 0.35 });
    });

    // AoE explosion handler — damages all zombies in radius with linear
    // falloff. Source can be rocket / mine / grenade / bloater death.
    this.bus('AOE_EXPLOSION', ({ x, y, radius, damage, falloff }) => {
      this.particles.spawnExplosion(x, y, radius);
      events.emit('SCREEN_SHAKE', { duration: 0.18, intensity: 0.6 });
      events.emit('CA_FLASH', {});
      const rSq = radius * radius;
      const fall = falloff != null ? falloff : 0.5;
      for (const z of this.director.zombies) {
        if (!z.alive) continue;
        const dx = z.x - x, dy = z.y - y;
        const dSq = dx * dx + dy * dy;
        if (dSq > rSq) continue;
        const t = 1 - (dSq / rSq);
        const dmg = Math.max(1, Math.floor(damage * (fall + (1 - fall) * t)));
        const wasAlive = z.alive;
        z.takeDamage(dmg);
        this.particles.spawnDamageNumber(z.x, z.y, dmg);
        if (wasAlive && !z.alive) {
          this.player.scrap += z.scrapValue;
          this.player.kills += 1;
          events.emit('ZOMBIE_KILLED', { id: z.id, x: z.x, y: z.y, scrap: z.scrapValue });
        }
      }
      // Player splash too — friendly fire on rocket/grenade keeps them risky.
      const dx = this.player.x - x, dy = this.player.y - y;
      if (dx * dx + dy * dy < rSq) {
        const t = 1 - ((dx * dx + dy * dy) / rSq);
        const splash = Math.max(2, Math.floor(damage * 0.35 * t));
        this.player.takeDamage(splash);
      }
    });

    this.bus('NIGHT_COMPLETE', () => {
      // Multi-zone floors require the player to actually reach the
      // terminal zone (e.g. the rooftop) before the night counts as
      // cleared. Latches `_wavesDrained` so the moment the player walks
      // into the terminal zone the night clears immediately.
      this._wavesDrained = true;
      const multi = this.arena && this.arena.isMultiZone;
      if (multi && !this._terminalReached) {
        this.hud.setWaveLabel('REACH THE ROOF', PALETTE.uiAccent, 2.4);
        return;
      }
      this.cleared = true;
      this.clearedDelay = 1.6;
      this.hud.setWaveLabel('NIGHT CLEAR', PALETTE.uiAccent, 1.8);
    });
    this.bus('PLAYER_DIED', () => {
      this.dead = true;
      this.deathDelay = 1.4;
      events.emit('SCREEN_SHAKE', { duration: 0.4, intensity: 0.7 });
      events.emit('CA_FLASH', {});
    });
    this.bus('WAVE_ANNOUNCE', ({ waveIdx, total }) => {
      this.hud.setWaveLabel(`WAVE ${waveIdx + 1} / ${total}`, PALETTE.uiAccent, 1.6);
    });
    this.bus('WAVE_COMPLETE', () => {
      this.hud.setToast('wave complete', PALETTE.uiAccent, 1.4);
    });
    // Track muzzle flashes for the lighting layer (capped pool). Heavier
    // weapons (high recoilShake) get a brighter, longer flash so shotgun /
    // sniper / rocket feel chunkier in the dark — almost free since the
    // pool is bounded.
    this.bus('WEAPON_FIRED', ({ x, y, weaponId }) => {
      if (this.muzzleFlashes.length >= 16) this.muzzleFlashes.shift();
      const wpn = weaponId && this.player && this.player.inventory.find(w => w.id === weaponId);
      const recoil = (wpn && wpn.def && wpn.def.recoilShake) || 0.1;
      const life = 0.08 + Math.min(0.18, recoil * 0.18);
      this.muzzleFlashes.push({ x, y, life, maxLife: life });
    });
    // Boss defeat → mark scene cleared even though more zombies remain.
    // Patient Zero death is the win condition; the support adds clean up
    // automatically via the night-cleared path.
    this.bus('BOSS_DEFEATED', () => {
      this.cleared = true;
      this.clearedDelay = 1.4;
      this.hud.setWaveLabel('PATIENT ZERO DOWN', PALETTE.uiAccent, 2.2);
      events.emit('SLOW_MO', { dur: 1.0, scale: 0.35 });
      events.emit('SCREEN_SHAKE', { duration: 0.5, intensity: 0.7 });
    });

    // Fuse-box short (player-shot or scripted): ramps up the lighting
    // damp factor so the floor visually darkens. Capped so a second short
    // doesn't pitch-black the room past playability.
    this.bus('FUSE_SHORTED', () => {
      this.lightingDamp = Math.min(0.45, this.lightingDamp + 0.25);
    });

    // Zone transition handler (Phase 2). On a Floor.setActiveZone() call
    // the Floor emits ZONE_CHANGED; we persist the leaving zone's
    // interactable alive flags, drain live zombies (they don't follow you
    // through walls), rebuild interactables + scareRunner from the new
    // zone, swap the ambient pool, and re-place the player.
    this.bus('ZONE_CHANGED', ({ fromId, toId, entryPoint }) => {
      // Guard: ZONE_CHANGED fires globally on the bus and can hit stale
      // listeners from scenes that never exit()'d (smoke tests, sandbox
      // launches with an Arena instead of a Floor). Bail out unless this
      // event is for our own Floor.
      if (!this.arena || !this.arena.zones || !this.arena.zones.has(toId)) return;
      const fromZone = fromId && this.arena.zones.get(fromId);
      if (fromZone) {
        // Persist alive flags in spec order so re-entry restores cleared
        // state (shot fuse boxes, triggered hanging bodies, etc.).
        fromZone.persistedState.interactableAlive =
          this.interactables.map(it => it.alive);
      }
      // Drain live zombies + hazards — they're "left behind." The wave
      // director keeps issuing spawns from the new zone's spawn points.
      if (this.director && this.director.zombies) this.director.zombies.length = 0;
      this.hazards.length = 0;
      // Rebuild for the new zone.
      this.interactables = this._buildInteractablesForActiveZone();
      this.scareRunner = this._buildScareRunnerForActiveZone();
      // Track visited + terminal flag for multi-zone night-clear gating.
      this._zoneVisited.add(toId);
      if (toId === this.arena.terminalZoneId) {
        this._terminalReached = true;
        // If waves already drained while we were elsewhere, finish the
        // night the moment we step onto the terminal zone.
        if (this._wavesDrained && !this.cleared) {
          this.cleared = true;
          this.clearedDelay = 1.6;
          this.hud.setWaveLabel('NIGHT CLEAR', PALETTE.uiAccent, 1.8);
        }
      }
      // Re-place player at the entry point.
      if (entryPoint && this.player) {
        this.player.x = entryPoint.x;
        this.player.y = entryPoint.y;
      }
      // Reset the post-process so a new room starts at low dread.
      this._dread01 *= 0.4;
      // Ambient cue pool follows the active zone.
      if (this.audio && this.audio.ambient) {
        this.audio.ambient.setPool(this._activeAmbientPool(true));
      }
      this.hud.setToast(this.arena.activeZone.id.toUpperCase(), PALETTE.uiAccent, 1.4);
      // Phase 3 hooks: fork zones push a checkpoint, chase zones spawn
      // their pursuer. The fork dedupe avoids double-pushing when the
      // player walks back into the same fork later.
      this._handleZoneKindHooks(this.arena.activeZone);
    });
  }

  // ── Zone helpers (Phase 2) ─────────────────────────────────────────────

  // Build interactables for the currently active zone, restoring `alive`
  // flags from persistedState if the zone has been visited before. Returns
  // a fresh array — the caller assigns it onto `this.interactables`.
  _buildInteractablesForActiveZone() {
    const out = [];
    const zone = this.arena && this.arena.activeZone;
    const specs = zone ? zone.interactableSpecs
      : (this.floorDef ? (this.floorDef.interactables || []) : []);
    if (!specs) return out;
    const persisted = zone && zone.persistedState && zone.persistedState.interactableAlive;
    for (let i = 0; i < specs.length; i++) {
      const it = buildInteractable(specs[i]);
      if (!it) continue;
      if (persisted && persisted[i] === false) it.alive = false;
      out.push(it);
    }
    return out;
  }

  _buildScareRunnerForActiveZone() {
    const zone = this.arena && this.arena.activeZone;
    if (zone && zone.scareEvents && zone.scareEvents.length > 0) {
      return new ScareEventRunner({ scareEvents: zone.scareEvents });
    }
    if (this.floorDef && this.floorDef.scareEvents) {
      return new ScareEventRunner(this.floorDef);
    }
    return null;
  }

  // Pool key/array for the ambient horror scheduler. Zone-level cues take
  // priority; falls back to floor-level, then generic 'combat'. The
  // `asArray` flag asks for an array directly (so setPool gets the literal
  // pool), defaulting to the AMBIENT_POOLS string key form on .start().
  _activeAmbientPool(asArray) {
    const zone = this.arena && this.arena.activeZone;
    if (zone && Array.isArray(zone.ambientCues) && zone.ambientCues.length > 0) {
      return zone.ambientCues;
    }
    if (this.floorDef && Array.isArray(this.floorDef.ambientCues) && this.floorDef.ambientCues.length > 0) {
      return this.floorDef.ambientCues;
    }
    return asArray ? ['floor_creak', 'whisper_short'] : 'combat';
  }

  // Called by WallDoor.update on player overlap.
  requestZoneChange(targetZoneId, entryPoint) {
    if (!this.arena || !this.arena.zones.has(targetZoneId)) return;
    if (this.arena.activeZoneId === targetZoneId) return;
    this.arena.setActiveZone(targetZoneId, entryPoint);
  }

  // Called from ZONE_CHANGED and from enter() to handle per-zone-kind
  // setup: fork zones snapshot a checkpoint, chase zones spawn their
  // pursuer.
  _handleZoneKindHooks(zone) {
    if (!zone) return;
    if (zone.kind === 'fork') this._maybePushCheckpoint();
    if (zone.kind === 'chase' && zone.def && zone.def.chase) {
      const c = zone.def.chase;
      this.hazards.push(new ChaseEntity({
        x: c.x, y: c.y,
        speed: c.speed, lethalR: c.lethalR,
        spawnDelay: c.spawnDelay, lethalDamage: c.lethalDamage,
      }));
    }
  }

  // Push a checkpoint only if we haven't already checkpointed THIS zone
  // (top of the stack matches activeZoneId). Walking back into the same
  // fork from a side branch must not stack duplicate checkpoints.
  _maybePushCheckpoint() {
    if (!this._runActive) return;
    const stack = runState.checkpointStack || [];
    const top = stack.length ? stack[stack.length - 1] : null;
    const zoneId = this.arena.activeZoneId;
    if (top && top.currentZoneId === zoneId) return;
    runState.pushCheckpoint(this);
    this.hud.setToast('CHECKPOINT', PALETTE.uiAccent, 1.6);
  }

  // Restore the most recent checkpoint onto the live scene — applied
  // after the death-delay expires so the impact still reads. Returns
  // true if respawn happened, false if no checkpoint was available
  // (and the caller should fall through to gameOver).
  _respawnAtCheckpoint() {
    if (!this._runActive || !runState.checkpointStack || !runState.checkpointStack.length) return false;
    const snap = runState.restoreCheckpoint(this);
    if (!snap) return false;
    // Clear hazards + zombies so the chase doesn't immediately re-catch us.
    this.hazards.length = 0;
    if (this.director && this.director.zombies) this.director.zombies.length = 0;
    this.dead = false;
    this.deathDelay = 0;
    this._dread01 = 0;
    // Move active zone back. setActiveZone fires ZONE_CHANGED which will
    // rebuild interactables, push a fresh checkpoint (since stack is now
    // empty), and reposition the player.
    if (snap.currentZoneId && this.arena && this.arena.zones.has(snap.currentZoneId)) {
      const targetZone = this.arena.zones.get(snap.currentZoneId);
      const entry = targetZone.entryPoint || { x: this.arena.w / 2, y: this.arena.h / 2 };
      if (this.arena.activeZoneId !== snap.currentZoneId) {
        this.arena.setActiveZone(snap.currentZoneId, entry);
      } else {
        // Already in the target zone — just reposition + re-handle hooks.
        if (this.player) { this.player.x = entry.x; this.player.y = entry.y; }
        this._handleZoneKindHooks(targetZone);
      }
    }
    this.hud.setWaveLabel('RESPAWN', PALETTE.uiAccent, 1.8);
    return true;
  }

  update(dt) {
    if (this.dead) {
      this.deathDelay -= dt;
      if (this.deathDelay <= 0) {
        // Phase 3: try a checkpoint respawn before falling out to game over.
        if (this._respawnAtCheckpoint()) return;
        events.emit('SCENE_CHANGE', { name: 'gameOver' });
      }
      return;
    }
    if (this.quitConfirm) {
      // Dialog open: world frozen. Yes (Y / Enter / click Yes) → quit; No
      // (N / Escape / click No) → resume the fight.
      const yes = this.input.consumeKey('y') || this.input.consumeKey('enter');
      const no  = this.input.consumeKey('n') || this.input.consumeKey('escape');
      let click = null;
      if (this.input.consumeClick() && this._quitRects) {
        const m = this.input.mouse;
        for (const r of this._quitRects) {
          if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) {
            click = r.action; break;
          }
        }
      }
      if (yes || click === 'yes') {
        // Don't end() the run — session state lets CONTINUE pick the run
        // up from the last persisted node. Only this night's in-combat
        // progress (kills/scrap/HP earned mid-fight) is forfeited.
        this.quitConfirm = false;
        events.emit('SCENE_CHANGE', { name: 'intro' });
        return;
      }
      if (no || click === 'no') {
        this.quitConfirm = false;
      }
      return;
    }
    if (this.cleared) {
      this.clearedDelay -= dt;
      if (this.clearedDelay <= 0) {
        if (this._runActive) {
          // Persist HP/inventory/scrap to RunState for the next scene.
          runState.syncFromPlayer(this.player);
          if (this.boss) {
            events.emit('SCENE_CHANGE', { name: 'victory' });
          } else {
            // Phase 5: route through the playable road segment instead
            // of jumping straight back to the map. RoadScene hands off
            // to MapScene once the player walks past the east threshold.
            events.emit('SCENE_CHANGE', { name: 'road' });
          }
        } else {
          events.emit('SCENE_CHANGE', { name: 'intro' });
        }
      }
      return;
    }

    // 1. Player — give it the live zombie list so the backup knife can
    // resolve hits without pulling a second SpatialHash query.
    this.player.setZombieList(this.director.zombies);
    this.player.update(dt, this.input, this.arena, this.projectiles, this.particles, this.audio);

    // 2. Wave director may spawn new zombies
    this.director.update(dt);

    // 3. Zombie spatial hash
    this.zombieHash.rebuild(this.director.zombies);

    // 4. Projectiles → zombie hits
    this.projectiles.update(dt, this.arena, this.zombieHash, (z, p) => this._onZombieHit(z, p));
    // Zombie projectiles hitting player (spitter acid)
    this.projectiles.resolveAgainstPlayer(this.player, (proj) => {
      this.player.takeDamage(proj.damage);
      this.particles.spawnBlood(proj.x, proj.y);
    });

    // 4b. Player projectiles vs shootable interactables. Few of each, so a
    // direct O(P*I) sweep is cheaper than threading them into the spatial
    // hash. Hit the FuseBox / GasCan path; everything else is decorative.
    if (this.interactables.length > 0 && this.projectiles.list.length > 0) {
      for (const p of this.projectiles.list) {
        if (!p.alive || p.source !== 'player') continue;
        for (const it of this.interactables) {
          if (!it.alive || !it.shootable) continue;
          const dx = it.x - p.x, dy = it.y - p.y;
          const sumR = it.r + p.r;
          if (dx * dx + dy * dy < sumR * sumR) {
            it.onShot(this);
            p.alive = false;
            break;
          }
        }
      }
    }

    // 5. Zombies update + attack player
    const ctx = { player: this.player, arena: this.arena, particles: this.particles, projectiles: this.projectiles };
    for (const z of this.director.zombies) {
      if (z.alive) z.update(dt, ctx);
    }

    // Mines & grenades update against the live zombie list.
    for (const m of this.mines) m.update(dt, this.director.zombies);
    for (let i = this.mines.length - 1; i >= 0; i--) if (!this.mines[i].alive) this.mines.splice(i, 1);
    for (const g of this.grenades) g.update(dt, this.arena);
    for (let i = this.grenades.length - 1; i >= 0; i--) if (!this.grenades[i].alive) this.grenades.splice(i, 1);

    // Hazards (ChaseEntity etc.) — separate list from zombies because
    // they don't grant kill credit / scrap and aren't damaged by the
    // player. Ticked with the same context shape zombies use.
    if (this.hazards.length > 0) {
      const hctx = { player: this.player, arena: this.arena, audio: this.audio };
      for (const h of this.hazards) {
        if (h.alive && typeof h.update === 'function') h.update(dt, hctx);
      }
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        if (!this.hazards[i].alive) this.hazards.splice(i, 1);
      }
    }

    // 6. Remove dead, update particles + HUD + flashes + interactables.
    this.director.removeDead();
    this.particles.update(dt);
    this.hud.update(dt);
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const f = this.muzzleFlashes[i];
      f.life -= dt;
      if (f.life <= 0) this.muzzleFlashes.splice(i, 1);
    }
    if (this.interactables.length > 0) {
      for (const it of this.interactables) it.update(dt, this);
      for (let i = this.interactables.length - 1; i >= 0; i--) {
        if (!this.interactables[i].alive) this.interactables.splice(i, 1);
      }
    }
    if (this.scareRunner) this.scareRunner.tick(dt, this);

    // ESC → open quit-confirm overlay (handled at the top of update next frame).
    // The world keeps running this frame; that's fine — opening the dialog is
    // a deliberate two-step gate to avoid accidental run-loss.
    if (this.input.consumeKey('escape')) {
      this.quitConfirm = true;
    }

    // Dread = blend of low HP, nearby zombie pressure, and a baseline floor
    // for the boss fight. Smoothed so heartbeat doesn't pop in/out abruptly.
    if (this.audio && this.audio.ambient) {
      const hpFrac = this.player.hp / Math.max(1, this.player.maxHp);
      let nearby = 0;
      const NEAR_R2 = 240 * 240;
      for (const z of this.director.zombies) {
        if (!z.alive) continue;
        const dx = z.x - this.player.x, dy = z.y - this.player.y;
        if (dx * dx + dy * dy < NEAR_R2) nearby++;
        if (nearby >= 8) break;
      }
      const targetDread =
        Math.max(
          (1 - hpFrac) * 0.85,
          Math.min(0.7, nearby / 8),
          this.boss ? 0.55 : 0
        );
      this._dread01 += (targetDread - this._dread01) * Math.min(1, dt * 1.2);
      this.audio.ambient.tick(dt, this._dread01);
    }

    // Feed dread to the renderer's post-process layer so vignette + CA
    // pulse track tension. Renderer caches the vignette gradient by
    // intensity-bucket so this isn't a per-frame allocation.
    if (window._wod && window._wod.renderer) {
      const r = window._wod.renderer;
      r.dreadVignette = 0.72 + Math.max(0, Math.min(1, this._dread01)) * 0.18;
      if (this._dread01 > 0.4) {
        const t = performance.now() / 1000;
        const rate = 0.6 + (this._dread01 - 0.4) * 2.4;     // Hz
        const pulse = Math.max(0, Math.sin(t * Math.PI * 2 * rate));
        r.dreadCA = pulse * (this._dread01 - 0.3) * 0.5;
      } else {
        r.dreadCA = 0;
      }
    }
  }

  exit() {
    if (this.audio && this.audio.ambient) this.audio.ambient.stop();
    if (window._wod && window._wod.renderer) {
      window._wod.renderer.dreadVignette = 0.72;
      window._wod.renderer.dreadCA = 0;
    }
    super.exit();
  }

  _onZombieHit(zombie, proj) {
    const wasAlive = zombie.alive;
    const maxHp = zombie.maxHp;
    zombie.takeDamage(proj.damage, proj.x, proj.y, proj.knockback || 0);
    this.particles.spawnDamageNumber(zombie.x, zombie.y, proj.damage);
    this.particles.spawnBlood(proj.x, proj.y);

    const wpnDef = proj.weaponId && this.player.inventory.find(w => w.id === proj.weaponId)?.def;

    // Universal hit-stop: every shot freezes the world for a moment so the
    // hit reads as physical. Scaled by damage so the pistol gets a flick
    // and the sniper gets a punch. Skip the killing-blow stop — it feels
    // mushy when the world freezes as the target collapses.
    if (wasAlive && zombie.alive) {
      const explicit = wpnDef && wpnDef.hitStop;
      const dmgStop = Math.min(0.10, Math.max(0.04, proj.damage * 0.0018));
      events.emit('HIT_STOP', explicit ? Math.max(explicit, dmgStop) : dmgStop);
    }

    if (wasAlive && !zombie.alive) {
      this.player.scrap += zombie.scrapValue;
      this.player.kills += 1;
      events.emit('ZOMBIE_KILLED', { id: zombie.id, x: zombie.x, y: zombie.y, scrap: zombie.scrapValue });

      // Always shake on kill. Intensity scales with the weapon's recoil
      // baseline — pistol gives a tap, shotgun gives a thump.
      const recoil = wpnDef ? wpnDef.recoilShake : 0.18;
      events.emit('SCREEN_SHAKE', { duration: 0.06, intensity: 0.18 + recoil * 0.4 });

      // Bigger blood pop on kill
      this.particles.spawnBlood(zombie.x, zombie.y);

      // Overkill: when the killing shot dealt ≥60% of the target's max HP,
      // spawn chunks. A pistol kill of a wounded shambler stays clean; a
      // sniper headshot or rocket impact gets the heavy gore.
      if (proj.damage >= maxHp * 0.6) {
        const chunkColor = (zombie.def && zombie.def.paletteCore) || '#5a0a14';
        this.particles.spawnChunks(zombie.x, zombie.y, chunkColor, 6);
      }

      // Heavy-weapon kills get a CA pulse and a sub-bass thump.
      if (wpnDef && wpnDef.recoilShake >= 0.4) {
        events.emit('CA_FLASH', {});
        events.emit('KILL_THUMP', {});
      }
    }
  }

  render(ctx) {
    this.arena.draw(ctx);

    // Mines under zombies (they're lying on the ground)
    for (const m of this.mines) m.draw(ctx);

    // Interactables sit between the floor and the actors. Mannequins look
    // most convincing under the same render-order as zombies but slightly
    // dimmer; everything else (fuse box, gas can, body, rat nest, door)
    // belongs on the ground plane.
    for (const it of this.interactables) it.draw(ctx);

    // Zombies
    for (const z of this.director.zombies) z.draw(ctx);

    // Hazards (ChaseEntity etc.) draw at the same depth as zombies so the
    // chase silhouette can occlude / be occluded by other actors naturally.
    for (const h of this.hazards) {
      if (h.alive && typeof h.draw === 'function') h.draw(ctx);
    }

    // Projectiles + grenades
    this.projectiles.draw(ctx);
    for (const g of this.grenades) g.draw(ctx);

    // Player
    this.player.draw(ctx);

    // Particles on top
    this.particles.draw(ctx, ctx.canvas.width, ctx.canvas.height);

    // Lighting overlay — must run after particles (so flame/blood get lit
    // by the ambient flashlight) but before the HUD (so HUD stays bright).
    // lightingDamp shifts the ambient darkness up after fuse-box shorts —
    // not so much that the player can't see, just enough to feel the room
    // lose its overhead lights.
    const baseDark = (this.floorDef && this.floorDef.theme && this.floorDef.theme.darkness != null)
      ? this.floorDef.theme.darkness
      : 0.84;
    this.lighting.darkness = Math.min(0.95, baseDark + this.lightingDamp);

    this.lighting.beginFrame(ctx);
    // Player ambient pool (close range) + flashlight cone. Sprint shrinks
    // the cone slightly — disorientation while moving fast.
    const sprinting = this.input.isDown('shift') && this.player.stamina > 0;
    const coneLen = sprinting ? 270 : 320;
    const coneArc = sprinting ? 0.48 : 0.55;
    this.lighting.addLight(this.player.x, this.player.y, 130, 1.0);
    this.lighting.addCone(this.player.x, this.player.y, this.player.aim, coneArc, coneLen);
    for (const m of this.muzzleFlashes) {
      const t = m.life / m.maxLife;
      this.lighting.addLight(m.x, m.y, 90 + t * 40, 0.5 + t * 0.5);
    }
    // Mines emit a faint pulsing red light when armed
    for (const mn of this.mines) {
      if (mn.armTimer <= 0) this.lighting.addLight(mn.x, mn.y, 35, 0.4);
    }
    this.lighting.commit(ctx);

    // HUD
    this.hud.draw(ctx, this.player, this.director);

    // Crosshair
    const acc = (this.input.mouse.leftDown && !this.player.weapon.canFire()) ? PALETTE.uiDanger : PALETTE.uiAccent;
    // Using ctx directly — the renderer's drawCursor lives on Renderer; reach through window for now
    if (window._wod && window._wod.renderer) {
      window._wod.renderer.drawCursor(this.input.mouse.x, this.input.mouse.y, acc);
    }

    if (this.quitConfirm) this._drawQuitConfirm(ctx);
  }

  _drawQuitConfirm(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    // Dim the world
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);

    const panelW = 380, panelH = 150;
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = PALETTE.uiAccent;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('QUIT TO MENU?', w / 2, panelY + 38);

    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText('progress this night will be lost', w / 2, panelY + 62);

    // Yes / No buttons
    const btnW = 120, btnH = 34;
    const btnGap = 24;
    const btnY = panelY + panelH - btnH - 16;
    const yesX = w / 2 - btnW - btnGap / 2;
    const noX  = w / 2 + btnGap / 2;
    const m = this.input.mouse;
    const hoverYes = m.x >= yesX && m.x <= yesX + btnW && m.y >= btnY && m.y <= btnY + btnH;
    const hoverNo  = m.x >=  noX && m.x <=  noX + btnW && m.y >= btnY && m.y <= btnY + btnH;

    ctx.fillStyle = hoverYes ? 'rgba(255,80,80,0.20)' : 'rgba(60,20,20,0.55)';
    ctx.fillRect(yesX, btnY, btnW, btnH);
    ctx.strokeStyle = hoverYes ? PALETTE.uiDanger : PALETTE.uiDim;
    ctx.lineWidth = hoverYes ? 2 : 1;
    ctx.strokeRect(yesX, btnY, btnW, btnH);
    ctx.fillStyle = hoverYes ? PALETTE.uiDanger : PALETTE.uiText;
    ctx.font = 'bold 14px monospace';
    ctx.fillText('YES (Y)', yesX + btnW / 2, btnY + btnH * 0.65);

    ctx.fillStyle = hoverNo ? 'rgba(126,255,102,0.15)' : 'rgba(20,40,20,0.55)';
    ctx.fillRect(noX, btnY, btnW, btnH);
    ctx.strokeStyle = hoverNo ? PALETTE.uiAccent : PALETTE.uiDim;
    ctx.lineWidth = hoverNo ? 2 : 1;
    ctx.strokeRect(noX, btnY, btnW, btnH);
    ctx.fillStyle = hoverNo ? PALETTE.uiAccent : PALETTE.uiText;
    ctx.font = 'bold 14px monospace';
    ctx.fillText('NO (N / ESC)', noX + btnW / 2, btnY + btnH * 0.65);

    this._quitRects = [
      { x: yesX, y: btnY, w: btnW, h: btnH, action: 'yes' },
      { x:  noX, y: btnY, w: btnW, h: btnH, action: 'no'  },
    ];
  }

  engineState() { return 'combat'; }
}
