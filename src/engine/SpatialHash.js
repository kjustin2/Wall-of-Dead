// Uniform-grid spatial hash. Replaces O(n×m) loops in zombie-vs-projectile
// and AoE checks with O(n + k) where k is the count of entities in the
// queried cells. Ported verbatim from roguehero2/src/SpatialHash.js.
//
// Usage:
//   const hash = new SpatialHash(64);
//   hash.rebuild(zombies);
//   for (const z of hash.query(bx, by, br)) {
//     if (z.alive && distSq(z.x, z.y, bx, by) < (z.r + br) ** 2) { ... }
//   }

export class SpatialHash {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this._cells = new Map();
    this._out = [];
    this._seen = new Set();
  }

  _key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }

  rebuild(entities) {
    const cs = this.cellSize;
    this._cells.clear();
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || !e.alive) continue;
      const cx = (e.x / cs) | 0;
      const cy = (e.y / cs) | 0;
      const k = this._key(cx, cy);
      let bucket = this._cells.get(k);
      if (!bucket) { bucket = []; this._cells.set(k, bucket); }
      bucket.push(e);
    }
  }

  query(x, y, radius) {
    const cs = this.cellSize;
    const minCx = ((x - radius) / cs) | 0;
    const maxCx = ((x + radius) / cs) | 0;
    const minCy = ((y - radius) / cs) | 0;
    const maxCy = ((y + radius) / cs) | 0;
    this._out.length = 0;
    this._seen.clear();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this._cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (this._seen.has(e)) continue;
          this._seen.add(e);
          this._out.push(e);
        }
      }
    }
    return this._out;
  }

  forEachInCircle(x, y, radius, cb) {
    const candidates = this.query(x, y, radius);
    for (let i = 0; i < candidates.length; i++) {
      const e = candidates[i];
      const dx = e.x - x, dy = e.y - y;
      const t = radius + (e.r || 0);
      if (dx * dx + dy * dy < t * t) cb(e);
    }
  }
}
