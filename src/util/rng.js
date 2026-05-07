// Seeded RNG so map generation and wave compositions are reproducible.
// Ported from roguehero2/src/RunManager.js (mulberry32). 32-bit state, fast,
// good enough for game randomness — never use for crypto.

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convenience for "between min and max" — note max is exclusive for ints.
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
