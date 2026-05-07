// Small geometry helpers. Squared-distance is used everywhere we compare a
// distance against a threshold — Math.sqrt is only needed when we want the
// scalar distance itself (e.g. for normalizing a direction vector).

export function distSq(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function angleTo(fromX, fromY, toX, toY) {
  return Math.atan2(toY - fromY, toX - fromX);
}

export function normalizeAngle(a) {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
