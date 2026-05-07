// Base class for scavenge minigames. Each minigame:
//   - is constructed once (no shared state across plays — `start()` resets)
//   - exposes update(dt, input) and render(ctx)
//   - reports completion via getResult() → { tier: 'D|C|B|A|S', stats }
//   - reports `done` true when the player can no longer affect the score
//
// ScavengeScene drives them and translates the result tier into loot.

export const TIERS = ['D', 'C', 'B', 'A', 'S'];

// Map a 0..1 score to a tier letter. Sweet spot at S is intentionally narrow
// so a perfect run feels earned, while D/C are common enough that even a
// fumble awards some loot.
export function scoreToTier(score) {
  if (score >= 0.92) return 'S';
  if (score >= 0.78) return 'A';
  if (score >= 0.55) return 'B';
  if (score >= 0.30) return 'C';
  return 'D';
}

export class Minigame {
  constructor() {
    this.done = false;
  }
  start(opts) { this.done = false; }
  update(dt, input) {}
  render(ctx) {}
  getResult() { return { tier: 'D' }; }
}
