// 2.5D depth helpers shared by every field entity. There's no real camera;
// "depth" is just a function of screen-y. A zombie near the horizon is small
// and dim; as it advances toward the wall it grows and brightens. This single
// mapping is what sells the perspective.

import { FIELD, DEPTH } from '../Config.js';

// 0 at horizon, 1 at the wall.
export function depthT(y) {
  const t = (y - FIELD.HORIZON_Y) / (FIELD.WALL_Y - FIELD.HORIZON_Y);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// Sprite scale factor for a given y.
export function depthScale(y) {
  return DEPTH.scaleFar + (DEPTH.scaleNear - DEPTH.scaleFar) * depthT(y);
}

// Brightness 0..1 — things at the horizon are swallowed by the dark.
export function depthShade(y) {
  return 0.25 + 0.75 * depthT(y);
}

// Convert a forward-speed (px/s in world terms) to screen px/s. Far things
// move slower on screen to reinforce depth.
export function depthSpeed(y, base) {
  return base * (0.5 + 0.5 * depthT(y));
}
