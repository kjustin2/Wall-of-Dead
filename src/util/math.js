// Small math helpers. Kept dependency-free and allocation-free for the hot
// paths (range checks use squared distance — no Math.sqrt).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

// Smooth approach: move `cur` toward `target` by a frame-rate-independent
// fraction. `rate` ~ how fast (higher = snappier). dt in seconds.
export const approach = (cur, target, rate, dt) =>
  lerp(cur, target, 1 - Math.exp(-rate * dt));

export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

export const rand = (lo, hi) => lo + Math.random() * (hi - lo);

export const randInt = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));

export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// Weighted pick: entries is [{ weight, ...}], returns the chosen entry.
export const weightedPick = (entries) => {
  let total = 0;
  for (const e of entries) total += e.weight;
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
};

// Squared distance from point (px,py) to segment (ax,ay)-(bx,by). Used for
// swept bullet→zombie collision so fast bullets don't tunnel through.
export function pointSegDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cy = ay + dy * t;
  const ex = px - cx, ey = py - cy;
  return ex * ex + ey * ey;
}

export const TAU = Math.PI * 2;
