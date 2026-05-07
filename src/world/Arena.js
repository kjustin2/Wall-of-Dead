// Combat arena: the bounded area zombies spawn in and the player can move
// within. Drawn as a dark floor with a faint grid for spatial reference.

import { ARENA, PALETTE } from '../Config.js';

export class Arena {
  constructor(w, h) {
    this.x = 0;
    this.y = 0;
    this.w = w != null ? w : ARENA.width;
    this.h = h != null ? h : ARENA.height;
    this.wall = ARENA.wall;
    this._floorCache = null;
  }

  // Clamp an entity inside the playable area minus a wall margin.
  clamp(e) {
    const minX = this.x + this.wall + e.r;
    const maxX = this.x + this.w - this.wall - e.r;
    const minY = this.y + this.wall + e.r;
    const maxY = this.y + this.h - this.wall - e.r;
    if (e.x < minX) e.x = minX;
    else if (e.x > maxX) e.x = maxX;
    if (e.y < minY) e.y = minY;
    else if (e.y > maxY) e.y = maxY;
  }

  // Random spawn point along the perimeter, just outside the wall, used by
  // WaveDirector so zombies emerge from the edge of the arena.
  perimeterSpawn(rng) {
    const r = rng();
    const margin = this.wall + 8;
    if (r < 0.25) {
      return { x: this.x + margin + rng() * (this.w - 2 * margin), y: this.y + margin };
    } else if (r < 0.5) {
      return { x: this.x + margin + rng() * (this.w - 2 * margin), y: this.y + this.h - margin };
    } else if (r < 0.75) {
      return { x: this.x + margin, y: this.y + margin + rng() * (this.h - 2 * margin) };
    } else {
      return { x: this.x + this.w - margin, y: this.y + margin + rng() * (this.h - 2 * margin) };
    }
  }

  _buildFloorCache() {
    const off = document.createElement('canvas');
    off.width = this.w; off.height = this.h;
    const ctx = off.getContext('2d');

    // Floor base
    ctx.fillStyle = PALETTE.bgFloor;
    ctx.fillRect(0, 0, this.w, this.h);

    // Faint grid (every 64px)
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < this.w; x += 64) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, this.h); }
    for (let y = 0; y < this.h; y += 64) { ctx.moveTo(0, y + 0.5); ctx.lineTo(this.w, y + 0.5); }
    ctx.stroke();

    // Speckles for texture
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * this.w, y = Math.random() * this.h;
      ctx.fillRect(x, y, 1, 1);
    }

    // Walls
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(0, 0, this.w, this.wall);
    ctx.fillRect(0, this.h - this.wall, this.w, this.wall);
    ctx.fillRect(0, 0, this.wall, this.h);
    ctx.fillRect(this.w - this.wall, 0, this.wall, this.h);

    // Wall highlight (top edge)
    ctx.fillStyle = PALETTE.wallHi;
    ctx.fillRect(0, this.wall - 2, this.w, 2);
    ctx.fillRect(0, this.h - this.wall, this.w, 2);

    this._floorCache = off;
  }

  draw(ctx) {
    if (!this._floorCache) this._buildFloorCache();
    ctx.drawImage(this._floorCache, this.x, this.y);
  }
}
