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
import { Arena } from '../world/Arena.js';
import { WaveDirector } from '../world/WaveDirector.js';
import { HUD } from '../ui/HUD.js';
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
    this.hud = new HUD();
    // Wave RNG is a per-night substream — run-seed XORed with nightNum so
    // the same run plays back identically on resume.
    const baseSeed = (params && params.seed) != null ? params.seed
      : (this._runActive ? (runState.seed ^ (runState.nightNum * 0x9E3779B9)) : ((Math.random() * 2 ** 31) | 0));
    this.director = new WaveDirector(this.arena, mulberry32(baseSeed));
    const nightNum = (params && params.nightNum) || (this._runActive ? runState.nightNum : 1) || 1;
    this.boss = !!(params && params.boss);
    this.elite = !!(params && params.elite);
    this.director.setNight(nightNum);
    this.cleared = false;
    this.clearedDelay = 0;
    this.dead = false;
    this.deathDelay = 0;

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

    // 1. Player
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

    // 6. Remove dead, update particles + HUD
    this.director.removeDead();
    this.particles.update(dt);
    this.hud.update(dt);

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

    // Zombies
    for (const z of this.director.zombies) z.draw(ctx);

    // Projectiles
    this.projectiles.draw(ctx);

    // Player
    this.player.draw(ctx);

    // Particles on top
    this.particles.draw(ctx, ctx.canvas.width, ctx.canvas.height);

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
