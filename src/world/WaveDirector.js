// WaveDirector: queues spawns for a single night, scales by night#.
// Each wave is a list of [zombieClass, count] pairs, all spawning over
// `waveDuration` seconds with a short pre-roll telegraph. Wave N+1 starts
// only after every wave-N zombie is dead AND the inter-wave gap has elapsed.
//
// Night completion = all waves spawned + zombies array empty.

import { events } from '../engine/EventBus.js';
import { Shambler } from '../zombies/Shambler.js';
import { Runner } from '../zombies/Runner.js';
import { Spitter } from '../zombies/Spitter.js';
import { Bloater } from '../zombies/Bloater.js';
import { Brute } from '../zombies/Brute.js';
import { Screamer } from '../zombies/Screamer.js';
import { Crawler } from '../zombies/Crawler.js';
import { BossPatientZero } from '../zombies/BossPatientZero.js';
import { getNightTemplate } from '../data/WaveTemplates.js';

const ZOMBIE_CLASS = {
  shambler: Shambler,
  runner: Runner,
  spitter: Spitter,
  bloater: Bloater,
  brute: Brute,
  screamer: Screamer,
  crawler: Crawler,
  patient_zero: BossPatientZero,
};

export class WaveDirector {
  constructor(arena, rng) {
    this.arena = arena;
    this.rng = rng;
    this.waves = [];
    this.waveIdx = 0;
    this.waveTimer = 0;          // time since current wave started
    this.preRoll = 1.5;          // delay before first spawn each wave
    this.interWaveGap = 3.0;     // pause between wave N cleared and wave N+1 announce
    this.zombies = [];
    this.spawnedInWave = 0;
    this.totalToSpawnThisWave = 0;
    this._between = 0;           // counter during inter-wave pause
    this.nightNum = 1;
    this.complete = false;
  }

  // M1 default plan: night 1 = 5 shamblers in one wave.
  // M2 will replace this with reading from data/WaveTemplates.js by night#.
  setNight(n) {
    this.nightNum = n;
    this.waves = this._planForNight(n);
    this.waveIdx = 0;
    this.waveTimer = 0;
    this._between = 0;
    this.spawnedInWave = 0;
    this.totalToSpawnThisWave = this.waves[0]
      ? this.waves[0].composition.reduce((a, [, c]) => a + c, 0)
      : 0;
    this.zombies.length = 0;
    this.complete = false;
    events.emit('NIGHT_START', { nightNum: n, waveCount: this.waves.length });
    if (this.waves.length > 0) {
      events.emit('WAVE_ANNOUNCE', { waveIdx: 0, total: this.waves.length });
    }
  }

  _planForNight(n) {
    const tpl = getNightTemplate(n);
    this.bossNight = tpl.bossNight;
    return tpl.waves;
  }

  spawn(zombie) {
    this.zombies.push(zombie);
    events.emit('ZOMBIE_SPAWN', { id: zombie.id, x: zombie.x, y: zombie.y });
  }

  // Direct spawn for screamer reinforcements: bypass perimeter, spawn near
  // a target point. Caller passes the class id.
  spawnNear(klassId, x, y, jitter) {
    const Klass = ZOMBIE_CLASS[klassId];
    if (!Klass) return null;
    const j = jitter != null ? jitter : 60;
    const ang = Math.random() * Math.PI * 2;
    const r   = j * (0.5 + Math.random() * 0.7);
    const z = new Klass(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    this.zombies.push(z);
    events.emit('ZOMBIE_SPAWN', { id: z.id, x: z.x, y: z.y });
    return z;
  }

  _spawnOne(klassId) {
    const Klass = ZOMBIE_CLASS[klassId];
    if (!Klass) return;
    const pos = this.arena.perimeterSpawn(this.rng);
    const z = new Klass(pos.x, pos.y);
    this.spawn(z);
  }

  update(dt) {
    if (this.complete) return;
    if (this.waveIdx >= this.waves.length) {
      // All waves issued — night completes when arena clears.
      if (this.zombies.length === 0) {
        this.complete = true;
        events.emit('NIGHT_COMPLETE', { nightNum: this.nightNum });
      }
      return;
    }

    const wave = this.waves[this.waveIdx];
    this.waveTimer += dt;

    if (this.waveTimer < this.preRoll) return;

    // Linear spawn schedule: spread totalToSpawnThisWave across waveDuration
    const spawnElapsed = this.waveTimer - this.preRoll;
    const targetSpawned = Math.min(
      this.totalToSpawnThisWave,
      Math.floor((spawnElapsed / wave.duration) * this.totalToSpawnThisWave) + 1,
    );

    while (this.spawnedInWave < targetSpawned) {
      // Pick from composition counts left
      let bucket = 0;
      let pickClass = null;
      for (const [id, count] of wave.composition) {
        if (count <= 0) continue;
        bucket += count;
      }
      if (bucket === 0) break;
      const r = this.rng() * bucket;
      let acc = 0;
      for (let k = 0; k < wave.composition.length; k++) {
        const entry = wave.composition[k];
        acc += entry[1];
        if (r < acc) { pickClass = entry[0]; entry[1] -= 1; break; }
      }
      if (pickClass) this._spawnOne(pickClass);
      this.spawnedInWave += 1;
    }

    // Advance to next wave when current wave is fully spawned AND cleared
    if (this.spawnedInWave >= this.totalToSpawnThisWave && this.zombies.length === 0) {
      this._between += dt;
      if (this._between >= this.interWaveGap) {
        events.emit('WAVE_COMPLETE', { waveIdx: this.waveIdx });
        this.waveIdx += 1;
        this.waveTimer = 0;
        this._between = 0;
        this.spawnedInWave = 0;
        if (this.waveIdx < this.waves.length) {
          this.totalToSpawnThisWave = this.waves[this.waveIdx].composition.reduce((a, [, c]) => a + c, 0);
          events.emit('WAVE_ANNOUNCE', { waveIdx: this.waveIdx, total: this.waves.length });
        }
      }
    }
  }

  removeDead() {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (!this.zombies[i].alive) {
        this.zombies[i] = this.zombies[this.zombies.length - 1];
        this.zombies.pop();
      }
    }
  }
}
