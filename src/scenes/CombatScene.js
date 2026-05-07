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
  }

  enter(params) {
    this.arena = new Arena();
    this.player = new Player(this.arena.w / 2, this.arena.h / 2);
    // If a run is active, sync inventory + HP + scrap from RunState so the
    // CombatScene continues from where the map left off. Sandbox launches
    // (intro→combat without runState.start) keep the fresh-Player defaults.
    this._runActive = !!runState.active;
    if (this._runActive) {
      runState.applyToPlayer(this.player);
    }
    this.projectiles = new ProjectileManager();
    this.particles = new ParticleSystem();
    this.zombieHash = new SpatialHash(SPATIAL_HASH.cellSize);
    this.mines = [];
    this.grenades = [];
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
    this.cleared = false;
    this.clearedDelay = 0;
    this.dead = false;
    this.deathDelay = 0;

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
    // Track muzzle flashes for the lighting layer (capped pool).
    this.bus('WEAPON_FIRED', ({ x, y }) => {
      if (this.muzzleFlashes.length >= 16) this.muzzleFlashes.shift();
      this.muzzleFlashes.push({ x, y, life: 0.10, maxLife: 0.10 });
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
  }

  update(dt) {
    if (this.dead) {
      this.deathDelay -= dt;
      if (this.deathDelay <= 0) events.emit('SCENE_CHANGE', { name: 'gameOver' });
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
            events.emit('SCENE_CHANGE', { name: 'map' });
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

    // 6. Remove dead, update particles + HUD + flashes
    this.director.removeDead();
    this.particles.update(dt);
    this.hud.update(dt);
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const f = this.muzzleFlashes[i];
      f.life -= dt;
      if (f.life <= 0) this.muzzleFlashes.splice(i, 1);
    }

    // ESC → intro
    if (this.input.consumeKey('escape')) {
      events.emit('SCENE_CHANGE', { name: 'intro' });
    }
  }

  _onZombieHit(zombie, proj) {
    const wasAlive = zombie.alive;
    zombie.takeDamage(proj.damage);
    this.particles.spawnDamageNumber(zombie.x, zombie.y, proj.damage);
    this.particles.spawnBlood(proj.x, proj.y);
    // Heavy-hit hit-stop: weapon defs may opt in via `hitStop` (shotgun does).
    // Skip on the killing blow — hit-stop on death feels mushy.
    const wpnDef = proj.weaponId && this.player.inventory.find(w => w.id === proj.weaponId)?.def;
    if (wpnDef && wpnDef.hitStop && wasAlive && zombie.alive) {
      events.emit('HIT_STOP', wpnDef.hitStop);
    }
    if (wasAlive && !zombie.alive) {
      this.player.scrap += zombie.scrapValue;
      this.player.kills += 1;
      events.emit('ZOMBIE_KILLED', { id: zombie.id, x: zombie.x, y: zombie.y, scrap: zombie.scrapValue });
      // Bigger blood pop on kill
      this.particles.spawnBlood(zombie.x, zombie.y);
    }
  }

  render(ctx) {
    this.arena.draw(ctx);

    // Mines under zombies (they're lying on the ground)
    for (const m of this.mines) m.draw(ctx);

    // Zombies
    for (const z of this.director.zombies) z.draw(ctx);

    // Projectiles + grenades
    this.projectiles.draw(ctx);
    for (const g of this.grenades) g.draw(ctx);

    // Player
    this.player.draw(ctx);

    // Particles on top
    this.particles.draw(ctx, ctx.canvas.width, ctx.canvas.height);

    // Lighting overlay — must run after particles (so flame/blood get lit
    // by the ambient flashlight) but before the HUD (so HUD stays bright).
    this.lighting.beginFrame(ctx);
    this.lighting.addLight(this.player.x, this.player.y, 130, 1.0);
    this.lighting.addCone(this.player.x, this.player.y, this.player.aim, 0.55, 320);
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
  }

  engineState() { return 'combat'; }
}
