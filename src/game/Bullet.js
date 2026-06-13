// Projectiles for player + companions (and re-used for spitter acid, which
// travels toward the player). Bullets are plain structs managed in a pool by
// the night scene; this module just holds the factory + step logic so the
// behavior lives in one place.

import { FIELD } from '../Config.js';

export function makeBullet(x, y, vx, vy, { damage, color, tracerLen = 14, pierce = 0, fromPlayer = true, acid = false }) {
  return {
    active: true,
    x, y, vx, vy,
    px: x, py: y,            // previous pos for segment collision
    damage, color, tracerLen,
    pierce,                  // how many extra zombies it can pass through
    fromPlayer,
    acid,                    // acid travels down toward the player instead
    life: 2.2,
  };
}

// Advance one bullet. Returns false when it should be removed.
export function stepBullet(b, dt) {
  b.px = b.x; b.py = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.life -= dt;
  if (b.life <= 0) return false;
  // Player/companion bullets die at the horizon; acid dies past the wall.
  if (!b.acid && b.y < FIELD.HORIZON_Y - 20) return false;
  if (b.x < -40 || b.x > 1320) return false;
  if (b.y > FIELD.PLAYER_Y + 40) return false;
  return true;
}
