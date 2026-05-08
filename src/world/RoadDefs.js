// Road segments — the playable corridor that sits between night nodes
// on the apocalypse road. Phase 5 ships ONE default segment so every
// non-boss night ends in the same atmospheric walk; later phases can
// swap in per-night themes (overgrown overpass after parking-garage,
// flooded subway tunnel after pharmacy, etc.) by keying on `nightNum`.
//
// Each segment is a Floor-shaped def: walls, spawn points, theme,
// ambient cues. RoadScene wraps it with Floor() and reuses the same
// clamp / spawn / draw plumbing the combat scenes use.

export const ROAD_SEGMENTS = {
  default: {
    id: 'apocalypse_road',
    name: 'APOCALYPSE ROAD',
    blurb: 'The road south. Nothing moves but the wind.',
    dims: { width: 1280, height: 720 },
    theme: { floor: '#0e0d12', wall: '#1c1820', accent: '#2c2530', fogTint: '#16111a', darkness: 0.78 },
    walls: [
      // Roadside debris — visual obstacles, not gameplay walls.
      { x: 220, y: 220, w: 60, h: 30 },
      { x: 460, y: 460, w: 100, h: 40 },
      { x: 760, y: 240, w: 80,  h: 36 },
      { x: 980, y: 480, w: 60,  h: 30 },
      // Crumpled car frames flanking the road
      { x: 60,  y: 100, w: 120, h: 50 },
      { x: 60,  y: 580, w: 120, h: 50 },
      { x: 1100, y: 120, w: 120, h: 60 },
      { x: 1100, y: 560, w: 120, h: 60 },
    ],
    spawnPoints: [
      { x: 800, y: 200 },
      { x: 800, y: 540 },
      { x: 600, y: 100 },
      { x: 1000, y: 360 },
    ],
    ambientCues: ['floor_creak', 'distant_scream', 'whisper_long', 'rat_skitter'],
  },
};

// Resolve a segment def for a given source nightNum. Phase 5 returns the
// default for every night — keyed lookup is the path future per-night
// segments will plug into.
export function getRoadSegmentForNight(_nightNum) {
  return ROAD_SEGMENTS.default;
}
