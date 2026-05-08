// RoadScene — the playable strip between nights. Player walks left to
// right across a styled corridor; a few ambient zombies wander the road
// so the trip costs ammo (or a dodge); reaching the east threshold
// emits SCENE_CHANGE → 'map' so the existing graph-pick UI continues.
//
// Reuses Floor + Player + ProjectileManager + ParticleSystem from the
// combat path so combat-feel polish (Phase 1 hit-stop, knockback,
// chunks, casings, kill thump) carries over without duplication. The
// scene owns its own WaveDirector replacement — a tiny inline spawner
// that drips one zombie every few seconds up to a small cap.
//
// Listener hygiene is the largest risk in this phase: every subscription
// goes through `this.bus(...)` so the base Scene.exit() removes them.
// The smoke test runs a 5x enter/exit listener-leak loop on this scene.

import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { SpatialHash } from '../engine/SpatialHash.js';
import { ParticleSystem } from '../engine/Particles.js';
import { ProjectileManager } from '../core/Projectile.js';
import { Player } from '../core/Player.js';
import { Floor } from '../world/Floor.js';
import { getRoadSegmentForNight } from '../world/RoadDefs.js';
import { Shambler } from '../zombies/Shambler.js';
import { Runner } from '../zombies/Runner.js';
import { Lighting } from '../engine/Lighting.js';
import { runState } from '../world/RunState.js';
import { mulberry32 } from '../util/rng.js';
import { SPATIAL_HASH, PALETTE } from '../Config.js';

const ROAD_EXIT_X = 1200;       // crossing this x-threshold ends the segment
const AMBIENT_CAP = 4;          // never more than this many alive on the road
const SPAWN_INTERVAL = 4.5;     // seconds between ambient drip-spawns

export class RoadScene extends Scene {
  constructor(input, audio) {
    super();
    this.input = input;
    this.audio = audio;
    this.player = null;
    this.arena = null;
    this.projectiles = null;
    this.particles = null;
    this.zombies = [];
    this.zombieHash = null;
    this.lighting = null;
    this.muzzleFlashes = [];
    this._spawnTimer = 0;
    this._rng = Math.random;
    this._exited = false;
  }

  enter(_params) {
    this._exited = false;
    const segment = getRoadSegmentForNight(runState.nightNum);
    this.arena = new Floor(segment);
    this.segmentDef = segment;

    // Player spawns at the west edge so they walk east across the road.
    // If we're resuming mid-road, place them at the saved progress point.
    const startX = (runState.onRoad && runState.roadProgress)
      ? Math.max(60, Math.min(ROAD_EXIT_X - 40, runState.roadProgress * this.arena.w))
      : 90;
    this.player = new Player(startX, this.arena.h / 2);
    if (runState.active) runState.applyToPlayer(this.player);

    this.projectiles = new ProjectileManager();
    this.particles = new ParticleSystem();
    this.zombieHash = new SpatialHash(SPATIAL_HASH.cellSize);
    this.zombies = [];
    this.muzzleFlashes = [];
    this.lighting = new Lighting();
    this._rng = mulberry32((runState.seed ^ 0x52ad ^ runState.nightNum) | 0);
    this._spawnTimer = 1.2;     // first drip a beat after entry

    // Mark "on road" so a mid-segment refresh resumes here, not at a
    // combat arena. CombatScene clears this on its own enter().
    if (runState.active) {
      runState.onRoad = true;
      runState.roadProgress = startX / this.arena.w;
      runState.persist();
    }

    // Ambient horror layer — segment's own pool.
    if (this.audio && this.audio.ambient) {
      this.audio.ambient.start(segment.ambientCues || 'outdoor');
    }

    this.bus('AOE_EXPLOSION', ({ x, y, radius, damage, falloff }) => {
      this.particles.spawnExplosion(x, y, radius);
      events.emit('SCREEN_SHAKE', { duration: 0.18, intensity: 0.6 });
      events.emit('CA_FLASH', {});
      const rSq = radius * radius;
      const fall = falloff != null ? falloff : 0.5;
      for (const z of this.zombies) {
        if (!z.alive) continue;
        const dx = z.x - x, dy = z.y - y;
        const dSq = dx * dx + dy * dy;
        if (dSq > rSq) continue;
        const t = 1 - (dSq / rSq);
        const dmg = Math.max(1, Math.floor(damage * (fall + (1 - fall) * t)));
        z.takeDamage(dmg);
      }
      const dx = this.player.x - x, dy = this.player.y - y;
      if (dx * dx + dy * dy < rSq) {
        const t = 1 - ((dx * dx + dy * dy) / rSq);
        this.player.takeDamage(Math.max(2, Math.floor(damage * 0.35 * t)));
      }
    });

    // Same kill-credit logic as CombatScene for the road's stragglers.
    this.bus('KNIFE_HIT', ({ zombie, damage }) => {
      this.particles.spawnDamageNumber(zombie.x, zombie.y, damage);
      if (!zombie.alive) {
        this.player.scrap += zombie.scrapValue;
        this.player.kills += 1;
        events.emit('ZOMBIE_KILLED', { id: zombie.id, x: zombie.x, y: zombie.y, scrap: zombie.scrapValue });
      }
    });
    this.bus('FLAME_HIT', ({ zombie, damage }) => {
      this.particles.spawnDamageNumber(zombie.x, zombie.y, damage);
      if (!zombie.alive) {
        this.player.scrap += zombie.scrapValue;
        this.player.kills += 1;
        events.emit('ZOMBIE_KILLED', { id: zombie.id, x: zombie.x, y: zombie.y, scrap: zombie.scrapValue });
      }
    });

    this.bus('PLAYER_DIED', () => { this._dying = true; this._dyingT = 1.4; });

    this.bus('WEAPON_FIRED', ({ x, y, weaponId }) => {
      if (this.muzzleFlashes.length >= 16) this.muzzleFlashes.shift();
      const wpn = weaponId && this.player && this.player.inventory.find(w => w.id === weaponId);
      const recoil = (wpn && wpn.def && wpn.def.recoilShake) || 0.1;
      const life = 0.08 + Math.min(0.18, recoil * 0.18);
      this.muzzleFlashes.push({ x, y, life, maxLife: life });
    });
  }

  _spawnAmbient() {
    if (this.zombies.length >= AMBIENT_CAP) return;
    const pos = this.arena.perimeterSpawn(this._rng,
      { playerX: this.player.x, playerY: this.player.y });
    // Mostly shamblers, occasional runner — the road wants menace, not
    // a wave. Reserves the more dangerous archetypes for combat scenes.
    const Klass = this._rng() < 0.78 ? Shambler : Runner;
    const z = new Klass(pos.x, pos.y);
    this.zombies.push(z);
    events.emit('ZOMBIE_SPAWN', { id: z.id, x: z.x, y: z.y });
  }

  update(dt) {
    if (this._exited) return;
    if (this._dying) {
      this._dyingT -= dt;
      if (this._dyingT <= 0) {
        this._exited = true;
        events.emit('SCENE_CHANGE', { name: 'gameOver' });
      }
      return;
    }

    this.player.setZombieList(this.zombies);
    this.player.update(dt, this.input, this.arena, this.projectiles, this.particles, this.audio);

    // Drip-spawner.
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = SPAWN_INTERVAL + (this._rng() - 0.5) * 1.5;
      this._spawnAmbient();
    }

    this.zombieHash.rebuild(this.zombies);

    this.projectiles.update(dt, this.arena, this.zombieHash, (z, p) => this._onZombieHit(z, p));
    this.projectiles.resolveAgainstPlayer(this.player, (proj) => {
      this.player.takeDamage(proj.damage);
      this.particles.spawnBlood(proj.x, proj.y);
    });

    const ctx = { player: this.player, arena: this.arena, particles: this.particles, projectiles: this.projectiles };
    for (const z of this.zombies) if (z.alive) z.update(dt, ctx);

    // Sweep dead zombies.
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (!this.zombies[i].alive) {
        this.zombies[i] = this.zombies[this.zombies.length - 1];
        this.zombies.pop();
      }
    }

    this.particles.update(dt);
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const f = this.muzzleFlashes[i];
      f.life -= dt;
      if (f.life <= 0) this.muzzleFlashes.splice(i, 1);
    }

    // Persist progress so a refresh resumes mid-road.
    if (runState.active) {
      runState.roadProgress = Math.max(0, Math.min(1, this.player.x / this.arena.w));
    }

    // Cross the east threshold → segment complete, hand off to map.
    if (this.player.x >= ROAD_EXIT_X && !this._exited) {
      this._exited = true;
      if (runState.active) {
        runState.onRoad = false;
        runState.roadProgress = 0;
        runState.syncFromPlayer(this.player);
        runState.persist();
      }
      events.emit('SCENE_CHANGE', { name: 'map' });
    }

    // Light dread tick for the heartbeat layer — never peak (this is
    // travel time, not combat). HP-gated only.
    if (this.audio && this.audio.ambient) {
      const hpFrac = this.player.hp / Math.max(1, this.player.maxHp);
      const dread = Math.max(0, (1 - hpFrac) * 0.5);
      this.audio.ambient.tick(dt, dread);
    }
  }

  _onZombieHit(zombie, proj) {
    const wasAlive = zombie.alive;
    const maxHp = zombie.maxHp;
    zombie.takeDamage(proj.damage, proj.x, proj.y, proj.knockback || 0);
    this.particles.spawnDamageNumber(zombie.x, zombie.y, proj.damage);
    this.particles.spawnBlood(proj.x, proj.y);
    const wpnDef = proj.weaponId && this.player.inventory.find(w => w.id === proj.weaponId)?.def;
    if (wasAlive && zombie.alive) {
      const explicit = wpnDef && wpnDef.hitStop;
      const dmgStop = Math.min(0.10, Math.max(0.04, proj.damage * 0.0018));
      events.emit('HIT_STOP', explicit ? Math.max(explicit, dmgStop) : dmgStop);
    }
    if (wasAlive && !zombie.alive) {
      this.player.scrap += zombie.scrapValue;
      this.player.kills += 1;
      events.emit('ZOMBIE_KILLED', { id: zombie.id, x: zombie.x, y: zombie.y, scrap: zombie.scrapValue });
      const recoil = wpnDef ? wpnDef.recoilShake : 0.18;
      events.emit('SCREEN_SHAKE', { duration: 0.06, intensity: 0.18 + recoil * 0.4 });
      this.particles.spawnBlood(zombie.x, zombie.y);
      if (proj.damage >= maxHp * 0.6) {
        const chunkColor = (zombie.def && zombie.def.paletteCore) || '#5a0a14';
        this.particles.spawnChunks(zombie.x, zombie.y, chunkColor, 6);
      }
      if (wpnDef && wpnDef.recoilShake >= 0.4) {
        events.emit('CA_FLASH', {});
        events.emit('KILL_THUMP', {});
      }
    }
  }

  render(ctx) {
    this.arena.draw(ctx);
    for (const z of this.zombies) z.draw(ctx);
    this.projectiles.draw(ctx);
    this.player.draw(ctx);
    this.particles.draw(ctx, ctx.canvas.width, ctx.canvas.height);

    // Lighting overlay — same beginFrame / addLight / commit pattern as
    // CombatScene. Darkness is a touch lighter than combat floors so the
    // road reads as outdoors.
    const baseDark = (this.segmentDef && this.segmentDef.theme && this.segmentDef.theme.darkness != null)
      ? this.segmentDef.theme.darkness
      : 0.78;
    this.lighting.darkness = baseDark;
    this.lighting.beginFrame(ctx);
    this.lighting.addLight(this.player.x, this.player.y, 130, 1.0);
    this.lighting.addCone(this.player.x, this.player.y, this.player.aim, 0.55, 320);
    for (const f of this.muzzleFlashes) {
      const t = f.life / f.maxLife;
      this.lighting.addLight(f.x, f.y, 90 + t * 40, 0.5 + t * 0.5);
    }
    this.lighting.commit(ctx);

    // Eastward "next stop" hint near the threshold so the player knows
    // walking past the right edge ends the segment.
    ctx.save();
    ctx.fillStyle = 'rgba(220,200,160,0.55)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('→ NEXT STOP', ROAD_EXIT_X + 30, 80);
    ctx.restore();

    // HP / scrap mini-readout, top-left.
    ctx.save();
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP  ${Math.ceil(this.player.hp)} / ${this.player.maxHp}`, 16, 24);
    ctx.fillStyle = PALETTE.uiAccent;
    ctx.fillText(`SCRAP  ${this.player.scrap}`, 16, 42);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('walk east to continue', 16, 62);
    ctx.restore();
  }

  exit() {
    if (this.audio && this.audio.ambient) this.audio.ambient.stop();
    super.exit();
  }

  engineState() { return 'combat'; }
}
