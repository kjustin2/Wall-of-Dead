// ScareEvents: scripted scare triggers attached to a floor.
//
// A trigger is a small spec like `{ trigger: 'time', after: 4, do: 'flicker_lights' }`
// or `{ trigger: 'hp_below', frac: 0.4, do: 'whisper_close' }`. Each trigger
// fires AT MOST once per level — once fired, it latches via `fired = true`.
//
// Action handlers all sit in ACTIONS below. They route through events +
// audio so the rest of the engine sees the scare the same way it sees a
// player-driven event (fuse box short, screen shake, AOE damage).

import { events } from '../engine/EventBus.js';

const ACTIONS = {
  // Brief flicker followed by reduced lighting — same end state as shooting
  // a fuse box, but driven by the scripted timeline instead of player input.
  flicker_lights(scene) {
    if (scene.audio) scene.audio.playSfx('flicker_buzz');
    events.emit('FUSE_SHORTED', { x: scene.player.x, y: scene.player.y, lights: ['__scripted__'] });
    events.emit('SCREEN_SHAKE', { duration: 0.06, intensity: 0.18 });
  },
  whisper_close(scene) {
    if (scene.audio) scene.audio.playSfx('whisper_short');
  },
  whisper_long(scene) {
    if (scene.audio) scene.audio.playSfx('whisper_long');
  },
  scream_distant(scene) {
    if (scene.audio) scene.audio.playSfx('distant_scream');
  },
  music_box_phrase(scene) {
    if (scene.audio) scene.audio.playSfx('music_box');
  },
  chain_drag_pass(scene) {
    if (scene.audio) scene.audio.playSfx('chain_drag');
  },
  breath_panic(scene) {
    if (scene.audio) scene.audio.playSfx('breath_panic');
  },
  radio_static_burst(scene) {
    if (scene.audio) scene.audio.playSfx('radio_static');
  },
  // Slam any unslammed Door interactables on the floor (simultaneously).
  slam_doors(scene) {
    if (scene.audio) scene.audio.playSfx('door_slam');
    if (!scene.interactables) return;
    for (const it of scene.interactables) {
      if (it.type === 'Door' && it.slam) it.slam(scene);
    }
  },
  // Steam vent / gas leak — small AOE around player. Non-lethal but
  // forces movement. Telegraphs with radio_static so the player has a
  // chance to step away.
  gas_leak(scene) {
    if (scene.audio) scene.audio.playSfx('radio_static');
    setTimeout(() => {
      events.emit('AOE_EXPLOSION', {
        x: scene.player.x, y: scene.player.y,
        radius: 90, damage: 18, falloff: 0.7,
      });
    }, 700);
  },
  // Combo cue: heartbeat pulse + whisper, used as a high-tension moment.
  panic_pulse(scene) {
    if (scene.audio) scene.audio.playSfx('heartbeat_fast');
    if (scene.audio) scene.audio.playSfx('whisper_short');
    events.emit('CA_FLASH', {});
  },
};

export class ScareEventRunner {
  constructor(floorDef) {
    // Deep-clone trigger specs and attach `fired` flag so the original
    // FloorDef (frozen const) is never mutated.
    this.triggers = (floorDef && floorDef.scareEvents)
      ? floorDef.scareEvents.map(t => ({ ...t, fired: false }))
      : [];
    this.elapsed = 0;
  }

  // Called every frame from CombatScene.update().
  tick(dt, scene) {
    if (!this.triggers.length) return;
    this.elapsed += dt;
    for (const t of this.triggers) {
      if (t.fired) continue;
      if (this._isReady(t, scene)) {
        t.fired = true;
        const fn = ACTIONS[t.do];
        if (fn) fn(scene);
        else console.warn('[ScareEvents] unknown action:', t.do);
      }
    }
  }

  _isReady(t, scene) {
    switch (t.trigger) {
      case 'time':
        return this.elapsed >= (t.after || 0);
      case 'hp_below': {
        const frac = scene.player.hp / Math.max(1, scene.player.maxHp);
        return frac < (t.frac || 0.5);
      }
      case 'kills':
        return scene.player.kills >= (t.n || 1);
      case 'kills_remaining': {
        // Fires once the live zombie count drops to <= n AND at least one
        // spawn has happened (so it doesn't fire pre-roll on an empty arena).
        if (!scene.director) return false;
        const live = scene.director.zombies.filter(z => z.alive).length;
        const spawnedAny = scene.director.spawnedInWave > 0 || scene.director.waveIdx > 0;
        return spawnedAny && live <= (t.n || 0);
      }
      case 'wave':
        return scene.director && scene.director.waveIdx >= (t.n || 0);
      default:
        return false;
    }
  }

  // Used by check-imports.mjs to verify all scare-event `do` keys resolve.
  static isKnownAction(name) { return !!ACTIONS[name]; }
  static actionNames() { return Object.keys(ACTIONS); }
}
