// Per-floor environmental hazards + scares. Each instance is a small state
// machine with `update(dt, scene)`, `draw(ctx)`, and optional hooks
// `onShot(scene)` (shootable interactables) / `onPlayerNear(scene)`
// (proximity triggers). CombatScene owns the list and removes any with
// `alive === false` each frame.
//
// All visuals are pure Canvas2D — no sprite atlas — and intentionally muted
// so the lighting layer can do most of the legwork on perceived "creepy".

import { events } from '../engine/EventBus.js';
import { NOTES, TAPES } from './Narrative.js';

// ── FuseBox ────────────────────────────────────────────────────────────
// Shootable. When shot, kills the floor's ambient light briefly (intensity
// pulse via lighting.flicker), then leaves the room dimmer for a stretch.
// Emits FUSE_SHORTED so other systems (e.g., HUD toast) can react.
export class FuseBox {
  constructor(opts) {
    this.type = 'FuseBox';
    this.x = opts.x;
    this.y = opts.y;
    this.r = 14;
    this.alive = true;        // always alive — but `shorted` toggles state
    this.shootable = true;
    this.shorted = false;
    this.flickerT = 0;        // counts up while flickering
    this.cooldown = 0;        // shorted-state lifetime
    this.lights = opts.lights || [];   // string ids of lights this controls
  }

  onShot(scene) {
    if (this.shorted) return;
    this.shorted = true;
    this.flickerT = 0;
    this.cooldown = 6.0;
    if (scene && scene.audio) scene.audio.playSfx('flicker_buzz');
    if (scene && scene.audio) scene.audio.playSfx('glass_shatter');
    events.emit('FUSE_SHORTED', { x: this.x, y: this.y, lights: this.lights });
    events.emit('SCREEN_SHAKE', { duration: 0.08, intensity: 0.3 });
  }

  update(dt) {
    if (this.shorted) {
      this.flickerT += dt;
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        // Stay shorted for the rest of the level — turning back on would
        // undo the dread payoff. The lighting hint is what fades out.
        this.flickerT = 0;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // Box body
    ctx.fillStyle = this.shorted ? '#1a0c0c' : '#2c2418';
    ctx.fillRect(-12, -16, 24, 32);
    ctx.strokeStyle = '#4a3820';
    ctx.lineWidth = 1;
    ctx.strokeRect(-12, -16, 24, 32);
    // Status lamp
    if (!this.shorted) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
      ctx.fillStyle = `rgba(255,170,55,${pulse})`;
      ctx.beginPath();
      ctx.arc(0, -8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.flickerT < 1.4) {
      // Erratic spark right after the short.
      if (Math.random() < 0.4) {
        ctx.fillStyle = '#ffe6a8';
        ctx.beginPath();
        ctx.arc(0, -8, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#1a0c0c';
      ctx.beginPath();
      ctx.arc(0, -8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── GasCan ─────────────────────────────────────────────────────────────
// Shootable. Detonates a short fuse on hit, then explodes — emits
// AOE_EXPLOSION so CombatScene's existing handler does damage + particles.
export class GasCan {
  constructor(opts) {
    this.type = 'GasCan';
    this.x = opts.x;
    this.y = opts.y;
    this.r = 12;
    this.alive = true;
    this.shootable = true;
    this.fuse = -1;            // -1 = unlit; >=0 = ticking down
    this.aoe = opts.aoe || { radius: 100, damage: 65, falloff: 0.55 };
  }

  onShot(scene) {
    if (this.fuse >= 0) return;
    this.fuse = 0.45;          // brief telegraph
    if (scene && scene.audio) scene.audio.playSfx('flicker_buzz');
  }

  update(dt) {
    if (this.fuse < 0) return;
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.alive = false;
      events.emit('AOE_EXPLOSION', {
        x: this.x, y: this.y,
        radius: this.aoe.radius,
        damage: this.aoe.damage,
        falloff: this.aoe.falloff,
      });
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#5a2b14';
    ctx.fillRect(-8, -10, 16, 20);
    ctx.fillStyle = '#3a1810';
    ctx.fillRect(-6, -8, 12, 4);
    ctx.strokeStyle = '#7a3a20';
    ctx.lineWidth = 1;
    ctx.strokeRect(-8, -10, 16, 20);
    if (this.fuse >= 0) {
      // Visible fuse pulse — colored bright so the player sees the warning.
      const t = 1 - (this.fuse / 0.45);
      const alpha = 0.5 + 0.5 * Math.sin(performance.now() * 0.05);
      ctx.fillStyle = `rgba(255,${120 + Math.floor(t * 80)},40,${alpha})`;
      ctx.beginPath();
      ctx.arc(0, -2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── HangingBody ────────────────────────────────────────────────────────
// Proximity scare. Hangs motionless until the player gets within triggerR,
// then drops with a body_drop SFX, screen shake, and a CA flash. Stays
// "dropped" (visual) for the rest of the level.
export class HangingBody {
  constructor(opts) {
    this.type = 'HangingBody';
    this.x = opts.x;
    this.y = opts.y;
    this.r = 10;
    this.alive = true;
    this.shootable = false;
    this.triggered = false;
    this.dropT = 0;
    this.swingPhase = Math.random() * Math.PI * 2;
    this.triggerR = opts.triggerR || 90;
  }

  onPlayerNear(scene) {
    if (this.triggered) return;
    this.triggered = true;
    if (scene && scene.audio) scene.audio.playSfx('body_drop');
    events.emit('SCREEN_SHAKE', { duration: 0.18, intensity: 0.55 });
    events.emit('CA_FLASH', {});
  }

  update(dt, scene) {
    this.swingPhase += dt * (this.triggered ? 0.1 : 0.6);
    if (this.triggered) {
      this.dropT = Math.min(1, this.dropT + dt * 1.4);
    }
    // Distance-based proximity — only check against the live player.
    if (!this.triggered && scene && scene.player) {
      const dx = scene.player.x - this.x;
      const dy = scene.player.y - this.y;
      if (dx * dx + dy * dy < this.triggerR * this.triggerR) {
        this.onPlayerNear(scene);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    const sway = Math.sin(this.swingPhase) * (this.triggered ? 1.5 : 4);
    const dy = this.dropT * 36;
    ctx.translate(this.x + sway, this.y + dy);
    // Rope (above hanging point)
    if (!this.triggered || this.dropT < 1) {
      ctx.strokeStyle = `rgba(160,140,110,${1 - this.dropT})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -36);
      ctx.lineTo(0, -10);
      ctx.stroke();
    }
    // Body
    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a1818';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Slumped legs sketch
    ctx.fillStyle = '#1c1614';
    ctx.fillRect(-6, 6, 12, 14);
    ctx.restore();
  }
}

// ── Mannequin ──────────────────────────────────────────────────────────
// Looks like a zombie silhouette under low light. Doesn't move, doesn't
// die — but the player will absolutely waste shots on it. That's the point.
export class Mannequin {
  constructor(opts) {
    this.type = 'Mannequin';
    this.x = opts.x;
    this.y = opts.y;
    this.r = 11;
    this.alive = true;
    this.shootable = false;     // bullets pass through (or count as miss)
    this.facing = opts.facing != null ? opts.facing : Math.random() * Math.PI * 2;
  }

  update() { /* static */ }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing);
    // Body (dim, easy to mistake for a zombie)
    ctx.fillStyle = '#2a2c20';
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1c10';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Forward-facing nub gives the player a fake "this is dangerous" cue
    ctx.fillStyle = '#3a4030';
    ctx.beginPath();
    ctx.arc(this.r * 0.45, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── RatNest ────────────────────────────────────────────────────────────
// Proximity scare. Skitter SFX + brief particle scatter when player
// approaches. Stays "spooked" for the rest of the level.
export class RatNest {
  constructor(opts) {
    this.type = 'RatNest';
    this.x = opts.x;
    this.y = opts.y;
    this.r = 14;
    this.alive = true;
    this.shootable = false;
    this.spooked = false;
    this.triggerR = opts.triggerR || 70;
  }

  onPlayerNear(scene) {
    if (this.spooked) return;
    this.spooked = true;
    if (scene && scene.audio) scene.audio.playSfx('rat_skitter');
    if (scene && scene.particles) {
      // Quick scatter — uses _pushParticle directly to bypass the helpers.
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 110;
        scene.particles._pushParticle({
          x: this.x, y: this.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r: 1.5 + Math.random() * 1.5,
          color: '#3a2a1c',
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.6,
          drag: 0.92,
        });
      }
    }
  }

  update(dt, scene) {
    if (this.spooked || !scene || !scene.player) return;
    const dx = scene.player.x - this.x;
    const dy = scene.player.y - this.y;
    if (dx * dx + dy * dy < this.triggerR * this.triggerR) {
      this.onPlayerNear(scene);
    }
  }

  draw(ctx) {
    if (this.spooked) return;     // empties out once player triggers
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22180e';
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + 0.2;
      ctx.fillRect(Math.cos(a) * 6 - 1, Math.sin(a) * 6 - 1, 2, 2);
    }
    ctx.restore();
  }
}

// ── Door ────────────────────────────────────────────────────────────
// Scripted slam. Stays open until ScareEvent triggers; on slam, plays
// door_slam sfx + small CA flash. Visual only — does not insert a wall
// into floor.walls (would require dynamic floor cache rebuild). Treat
// slammed doors as audio/visual decoration, not pathing barriers.
export class Door {
  constructor(opts) {
    this.type = 'Door';
    this.x = opts.x;
    this.y = opts.y;
    this.w = opts.w || 40;
    this.h = opts.h || 8;
    this.r = Math.max(this.w, this.h) * 0.5;
    this.alive = true;
    this.shootable = false;
    this.closed = false;
    this.slamT = 0;
  }

  slam(scene) {
    if (this.closed) return;
    this.closed = true;
    this.slamT = 0.5;
    if (scene && scene.audio) scene.audio.playSfx('door_slam');
    events.emit('SCREEN_SHAKE', { duration: 0.14, intensity: 0.45 });
    events.emit('CA_FLASH', {});
  }

  update(dt) {
    if (this.slamT > 0) this.slamT = Math.max(0, this.slamT - dt);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // Frame
    ctx.fillStyle = '#2a1c10';
    ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    if (this.closed) {
      ctx.fillStyle = '#1a1208';
      ctx.fillRect(-this.w / 2 + 2, -this.h / 2 + 1, this.w - 4, this.h - 2);
      // Slam frame flash
      if (this.slamT > 0) {
        const a = this.slamT / 0.5;
        ctx.strokeStyle = `rgba(255,80,80,${a * 0.6})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
      }
    } else {
      // Open: subtle gap
      ctx.strokeStyle = '#3a2818';
      ctx.lineWidth = 1;
      ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}

// ── WallDoor ──────────────────────────────────────────────────────────
// A walk-through door that triggers a zone transition when the player
// overlaps it. Visually a slab of frame on the floor; behaviorally just
// a trigger volume. The zone-id is encoded in `targetZoneId`; CombatScene
// reads that on overlap and asks the Floor to swap zones.
//
// Distinct from `Door` (above) which is a scripted slam decoration —
// WallDoor is the connective tissue between Zones.
export class WallDoor {
  constructor(opts) {
    this.type = 'WallDoor';
    this.x = opts.x;
    this.y = opts.y;
    this.w = opts.w || 56;
    this.h = opts.h || 14;
    this.r = Math.max(this.w, this.h) * 0.5;
    this.alive = true;
    this.shootable = false;
    this.targetZoneId = opts.targetZoneId || null;
    this.entryPoint = opts.entryPoint || null;
    this.label = opts.label || null;
    this._cooldown = 0;             // brief debounce after a transition
  }

  update(dt, scene) {
    if (this._cooldown > 0) this._cooldown = Math.max(0, this._cooldown - dt);
    if (this._cooldown > 0 || !scene || !scene.player || !this.targetZoneId) return;
    // AABB overlap with the player circle.
    const cx = Math.max(this.x - this.w / 2, Math.min(scene.player.x, this.x + this.w / 2));
    const cy = Math.max(this.y - this.h / 2, Math.min(scene.player.y, this.y + this.h / 2));
    const dx = scene.player.x - cx, dy = scene.player.y - cy;
    if (dx * dx + dy * dy < scene.player.r * scene.player.r) {
      if (typeof scene.requestZoneChange === 'function') {
        scene.requestZoneChange(this.targetZoneId, this.entryPoint);
        this._cooldown = 0.6;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // Door frame: a wider darker base with an accent strip so it reads
    // as a doorway against the floor texture.
    ctx.fillStyle = '#1c130a';
    ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(-this.w / 2 + 2, -this.h / 2 + 2, this.w - 4, this.h - 4);
    // Threshold accent — a soft glow strip the player can read at a glance.
    ctx.fillStyle = 'rgba(255,180,80,0.18)';
    ctx.fillRect(-this.w / 2 + 4, -1, this.w - 8, 2);
    if (this.label) {
      ctx.fillStyle = 'rgba(220,200,160,0.55)';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.label, 0, -this.h / 2 - 4);
    }
    ctx.restore();
  }
}

// ── NarrativeNote ─────────────────────────────────────────────────────
// Proximity pickup. Surfaces a lore toast on the HUD, latches `alive=false`
// after a single read, and emits NOTE_READ so RunState can track which
// notes the player has found. Visual: a small rectangle of paper with a
// faint glow so the player can spot it in dark zones.
export class NarrativeNote {
  constructor(opts) {
    this.type = 'NarrativeNote';
    this.x = opts.x;
    this.y = opts.y;
    this.r = 12;
    this.alive = true;
    this.shootable = false;
    this.noteId = opts.noteId || null;
    this.triggerR = opts.triggerR || 40;
    this._pulse = Math.random() * Math.PI * 2;
  }

  update(dt, scene) {
    this._pulse += dt * 1.6;
    if (!this.alive || !scene || !scene.player || !this.noteId) return;
    const dx = scene.player.x - this.x, dy = scene.player.y - this.y;
    if (dx * dx + dy * dy < this.triggerR * this.triggerR) {
      this.alive = false;
      const text = NOTES[this.noteId] || '(missing note)';
      if (scene.hud && scene.hud.setLoreToast) {
        scene.hud.setLoreToast(text, 6.0);
      } else if (scene.hud && scene.hud.setToast) {
        scene.hud.setToast(text.split('\n')[0], '#cdb88a', 4.0);
      }
      events.emit('NOTE_READ', { noteId: this.noteId, x: this.x, y: this.y });
    }
  }

  draw(ctx) {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const a = 0.55 + 0.25 * Math.sin(this._pulse);
    ctx.fillStyle = `rgba(220,200,150,${a.toFixed(3)})`;
    ctx.fillRect(-7, -9, 14, 18);
    ctx.fillStyle = '#5c4a2a';
    ctx.fillRect(-7, -9, 14, 1);
    ctx.fillRect(-7, 8, 14, 1);
    ctx.fillStyle = 'rgba(60,40,20,0.6)';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-5, -5 + i * 4, 10, 1);
    }
    ctx.restore();
  }
}

// ── VoiceTape ─────────────────────────────────────────────────────────
// Proximity pickup that plays an audio cue + surfaces a transcript. Same
// latch behavior as NarrativeNote; emits TAPE_PLAYED for RunState.
export class VoiceTape {
  constructor(opts) {
    this.type = 'VoiceTape';
    this.x = opts.x;
    this.y = opts.y;
    this.r = 12;
    this.alive = true;
    this.shootable = false;
    this.tapeId = opts.tapeId || null;
    this.triggerR = opts.triggerR || 40;
    this._pulse = Math.random() * Math.PI * 2;
  }

  update(dt, scene) {
    this._pulse += dt * 2.4;
    if (!this.alive || !scene || !scene.player || !this.tapeId) return;
    const dx = scene.player.x - this.x, dy = scene.player.y - this.y;
    if (dx * dx + dy * dy < this.triggerR * this.triggerR) {
      this.alive = false;
      const tape = TAPES[this.tapeId] || { transcript: '(missing tape)', sfxId: null };
      if (tape.sfxId && scene.audio && scene.audio.playSfx) scene.audio.playSfx(tape.sfxId);
      if (scene.hud && scene.hud.setLoreToast) {
        scene.hud.setLoreToast(tape.transcript, 7.0);
      } else if (scene.hud && scene.hud.setToast) {
        scene.hud.setToast('TAPE PLAYED', '#cdb88a', 3.0);
      }
      events.emit('TAPE_PLAYED', { tapeId: this.tapeId, x: this.x, y: this.y });
    }
  }

  draw(ctx) {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    // Cassette body
    ctx.fillStyle = '#1a1820';
    ctx.fillRect(-10, -7, 20, 14);
    ctx.strokeStyle = '#3a2a30';
    ctx.lineWidth = 1;
    ctx.strokeRect(-10, -7, 20, 14);
    // Reels
    const a = 0.6 + 0.3 * Math.sin(this._pulse);
    ctx.fillStyle = `rgba(180,160,120,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(-4, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( 4, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Factory — string id → instance. Lets FloorDefs reference types by name.
const REGISTRY = {
  FuseBox, GasCan, HangingBody, Mannequin, RatNest, Door, WallDoor,
  NarrativeNote, VoiceTape,
};

export function buildInteractable(spec) {
  const Klass = REGISTRY[spec.type];
  if (!Klass) {
    console.warn('[Interactables] unknown type:', spec.type);
    return null;
  }
  return new Klass(spec);
}

export function isKnownType(name) { return !!REGISTRY[name]; }
