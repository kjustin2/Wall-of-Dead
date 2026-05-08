// Floor: drop-in replacement for Arena that adds inner walls (collision),
// authored spawn points, and a per-floor visual theme. Phase 2 extends
// Floor to own one OR many Zone instances + a transitions array.
//
// Single-zone (legacy) defs:  flat { walls, spawnPoints, theme, ... }
// Multi-zone defs:            { zones: [...], transitions: [...], entryZoneId, terminalZoneId }
//
// Both shapes work — flat defs are wrapped in a single implicit zone so
// nights 2–7 keep their existing layouts unchanged. Multi-zone Floors
// delegate clamp / draw / perimeterSpawn to their currently active zone.
// Wall / theme / cache state lives on the Zone, not the Floor.
//
// Wall collision uses circle-vs-rect closest-point resolution — robust at
// the player/zombie movement speeds we run (≤4 px/frame).

import { ARENA, PALETTE } from '../Config.js';
import { events } from '../engine/EventBus.js';
import { Zone } from './Zone.js';

export class Floor {
  constructor(def) {
    this.def = def || {};
    this.id = this.def.id || 'arena';
    this.x = 0;
    this.y = 0;
    this.w = (this.def.dims && this.def.dims.width)  || ARENA.width;
    this.h = (this.def.dims && this.def.dims.height) || ARENA.height;
    this.wall = ARENA.wall;
    this.zones = new Map();
    this.transitions = [];
    this.entryZoneId = null;
    this.terminalZoneId = null;

    if (Array.isArray(this.def.zones) && this.def.zones.length > 0) {
      // Multi-zone: build each Zone, copy transitions, pick entry/terminal.
      for (const zoneDef of this.def.zones) {
        const z = new Zone(zoneDef, { width: this.w, height: this.h });
        this.zones.set(z.id, z);
      }
      this.transitions = (this.def.transitions || []).map(t => ({ ...t }));
      this.entryZoneId = this.def.entryZoneId || this.def.zones[0].id;
      this.terminalZoneId = this.def.terminalZoneId
        || this.def.zones[this.def.zones.length - 1].id;
    } else {
      // Single-zone (legacy / flat def): wrap the FloorDef itself as one
      // zone so per-frame code never has to special-case "no zone."
      const implicit = new Zone({
        id: 'main',
        kind: 'combat',
        dims: { width: this.w, height: this.h },
        walls: this.def.walls || [],
        spawnPoints: this.def.spawnPoints || [],
        theme: this.def.theme || {},
        interactables: this.def.interactables || [],
        ambientCues: this.def.ambientCues || null,
        scareEvents: this.def.scareEvents || [],
      }, { width: this.w, height: this.h });
      this.zones.set('main', implicit);
      this.entryZoneId = 'main';
      this.terminalZoneId = 'main';
    }

    this.activeZoneId = this.entryZoneId;
  }

  get activeZone() { return this.zones.get(this.activeZoneId); }
  get isMultiZone() { return this.zones.size > 1; }

  // Convenience accessors so existing call sites that read floor.walls /
  // floor.spawnPoints / floor.theme keep working without conditional logic.
  get walls()       { return this.activeZone.walls; }
  get spawnPoints() { return this.activeZone.spawnPoints; }
  get theme()       { return this.activeZone.theme; }
  get scareEvents() { return this.activeZone.scareEvents; }
  get ambientCues() { return this.activeZone.ambientCues; }

  // Transitions whose `from` matches the active zone — what the player
  // can walk into right now. Empty for single-zone floors.
  activeTransitions() {
    if (!this.isMultiZone) return [];
    return this.transitions.filter(t => t.from === this.activeZoneId);
  }

  // Swap the active zone. Caller is responsible for repositioning the
  // player to `entryPoint` (or to the new zone's authored entryPoint).
  // Emits ZONE_CHANGED with both zone ids so listeners (CombatScene's
  // wave director / interactables / scare runner) can resync.
  setActiveZone(zoneId, entryPoint) {
    if (!this.zones.has(zoneId)) return null;
    if (zoneId === this.activeZoneId) return this.activeZone;
    const fromId = this.activeZoneId;
    this.activeZoneId = zoneId;
    const z = this.activeZone;
    z.persistedState.visited = true;
    const at = entryPoint || z.entryPoint || null;
    events.emit('ZONE_CHANGED', { fromId, toId: zoneId, entryPoint: at });
    return z;
  }

  // Outer-bounds clamp + AABB push-out against the active zone's walls.
  clamp(e) {
    const minX = this.x + this.wall + e.r;
    const maxX = this.x + this.w - this.wall - e.r;
    const minY = this.y + this.wall + e.r;
    const maxY = this.y + this.h - this.wall - e.r;
    if (e.x < minX) e.x = minX;
    else if (e.x > maxX) e.x = maxX;
    if (e.y < minY) e.y = minY;
    else if (e.y > maxY) e.y = maxY;

    const walls = this.activeZone.walls;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const cx = Math.max(w.x, Math.min(e.x, w.x + w.w));
      const cy = Math.max(w.y, Math.min(e.y, w.y + w.h));
      const dx = e.x - cx;
      const dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      const r2 = e.r * e.r;
      if (d2 < r2) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          e.x = cx + (dx / d) * e.r;
          e.y = cy + (dy / d) * e.r;
        } else {
          const lx = e.x - w.x;
          const rx = (w.x + w.w) - e.x;
          const ty = e.y - w.y;
          const by = (w.y + w.h) - e.y;
          const m = Math.min(lx, rx, ty, by);
          if (m === lx)      e.x = w.x - e.r;
          else if (m === rx) e.x = w.x + w.w + e.r;
          else if (m === ty) e.y = w.y - e.r;
          else                e.y = w.y + w.h + e.r;
        }
      }
    }
  }

  // Spawn dispatcher — picks an authored spawn point if available,
  // weighted toward points farthest from the player so zombies emerge
  // off-camera. Falls back to perimeter spawn (Arena-style) when the
  // active zone has no authored points.
  perimeterSpawn(rng, opts) {
    const points = this.activeZone.spawnPoints;
    if (points.length === 0) {
      const r = rng();
      const margin = this.wall + 8;
      if (r < 0.25) return { x: this.x + margin + rng() * (this.w - 2 * margin), y: this.y + margin };
      if (r < 0.5)  return { x: this.x + margin + rng() * (this.w - 2 * margin), y: this.y + this.h - margin };
      if (r < 0.75) return { x: this.x + margin, y: this.y + margin + rng() * (this.h - 2 * margin) };
      return { x: this.x + this.w - margin, y: this.y + margin + rng() * (this.h - 2 * margin) };
    }

    const px = opts && opts.playerX;
    const py = opts && opts.playerY;
    if (px == null || py == null) {
      const p = points[Math.floor(rng() * points.length)];
      return { x: p.x, y: p.y };
    }

    let total = 0;
    const weights = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const dx = p.x - px, dy = p.y - py;
      const wt = dx * dx + dy * dy;
      weights[i] = wt;
      total += wt;
    }
    if (total <= 0) {
      const p = points[Math.floor(rng() * points.length)];
      return { x: p.x, y: p.y };
    }
    const t = rng() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (t < acc) {
        const p = points[i];
        return { x: p.x, y: p.y };
      }
    }
    const last = points[points.length - 1];
    return { x: last.x, y: last.y };
  }

  // Pre-render the active zone's floor + walls into an offscreen canvas
  // once. Each zone owns its own cache so swapping zones doesn't
  // re-rasterize the previous one when the player walks back.
  _buildFloorCache(zone) {
    const off = document.createElement('canvas');
    off.width = this.w; off.height = this.h;
    const ctx = off.getContext('2d');
    const t = zone.theme || {};
    const floorCol  = t.floor  || PALETTE.bgFloor;
    const wallCol   = t.wall   || PALETTE.wall;
    const accentCol = t.accent || PALETTE.wallHi;

    ctx.fillStyle = floorCol;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let i = 0; i < 320; i++) {
      const x = Math.random() * this.w, y = Math.random() * this.h;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * this.w, y = Math.random() * this.h;
      const sw = 2 + Math.random() * 5;
      const sh = 1 + Math.random() * 4;
      ctx.fillRect(x, y, sw, sh);
    }

    ctx.fillStyle = wallCol;
    ctx.fillRect(0, 0, this.w, this.wall);
    ctx.fillRect(0, this.h - this.wall, this.w, this.wall);
    ctx.fillRect(0, 0, this.wall, this.h);
    ctx.fillRect(this.w - this.wall, 0, this.wall, this.h);
    ctx.fillStyle = accentCol;
    ctx.fillRect(0, this.wall - 2, this.w, 2);
    ctx.fillRect(0, this.h - this.wall, this.w, 2);

    for (const w of zone.walls) {
      ctx.fillStyle = wallCol;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = accentCol;
      ctx.fillRect(w.x, w.y, w.w, 2);
      ctx.fillRect(w.x, w.y + w.h - 2, w.w, 2);
    }

    zone._floorCache = off;
  }

  draw(ctx) {
    const z = this.activeZone;
    if (!z._floorCache) this._buildFloorCache(z);
    ctx.drawImage(z._floorCache, this.x, this.y);
  }
}
