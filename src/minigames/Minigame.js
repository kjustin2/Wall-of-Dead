// Minigame base + shared scoring. Every scavenge minigame implements the same
// tiny contract so DayScene can drive any of them interchangeably:
//
//   start()                 initialize
//   update(dt, input)       advance; set this.done = true when finished
//   render(ctx)             draw full-screen (each minigame owns its backdrop)
//   getResult() -> { tier, frac }   D..S performance, 0..1 fraction
//
// Metadata (title / objective / controls) is shown by the minigame's own HUD.

export class Minigame {
  constructor() {
    this.done = false;
    this.title = 'Scavenge';
    this.objective = '';
    this.controls = '';
    this.elapsed = 0;
  }
  start() {}
  update(dt, input) {}
  render(ctx) {}
  getResult() { return { tier: 'C', frac: 0.5 }; }
}

// Map a 0..1 performance fraction to a loot tier.
export function tierFromFrac(f) {
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  if (f >= 0.92) return 'S';
  if (f >= 0.75) return 'A';
  if (f >= 0.5) return 'B';
  if (f >= 0.25) return 'C';
  return 'D';
}
