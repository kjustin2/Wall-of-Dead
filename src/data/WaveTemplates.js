// Wave compositions per night. Threat-budget scaled so night 7 is roughly
// 4× the load of night 1. Each "wave" entry is a list of [zombieClassId, count]
// pairs with `duration` seconds to drip them in over.
//
// M2 ships nights 1-3 with shambler/runner/spitter mix. Later milestones
// add bloater/brute/screamer/crawler and re-tune the budget curve.

export const WAVE_TEMPLATES = [
  // Night 1: easy intro — pure shamblers, single wave.
  {
    nightNum: 1,
    bossNight: false,
    waves: [
      { duration: 14, composition: [['shambler', 6]] },
    ],
  },
  // Night 2: introduce runners.
  {
    nightNum: 2,
    bossNight: false,
    waves: [
      { duration: 12, composition: [['shambler', 5], ['runner', 2]] },
      { duration: 14, composition: [['runner', 4], ['shambler', 3]] },
    ],
  },
  // Night 3: introduce spitters.
  {
    nightNum: 3,
    bossNight: false,
    waves: [
      { duration: 12, composition: [['shambler', 5], ['runner', 3]] },
      { duration: 14, composition: [['spitter', 2], ['shambler', 4]] },
      { duration: 14, composition: [['runner', 5], ['spitter', 1]] },
    ],
  },
  // Night 4-6: progressively meaner combos. Final wave gets denser.
  {
    nightNum: 4,
    bossNight: false,
    waves: [
      { duration: 12, composition: [['shambler', 6], ['runner', 4]] },
      { duration: 14, composition: [['spitter', 3], ['runner', 4]] },
      { duration: 14, composition: [['shambler', 7], ['runner', 4], ['spitter', 1]] },
    ],
  },
  {
    nightNum: 5,
    bossNight: false,
    waves: [
      { duration: 12, composition: [['runner', 8], ['spitter', 1]] },
      { duration: 14, composition: [['shambler', 8], ['spitter', 3]] },
      { duration: 14, composition: [['runner', 6], ['spitter', 3], ['shambler', 5]] },
    ],
  },
  {
    nightNum: 6,
    bossNight: false,
    waves: [
      { duration: 12, composition: [['shambler', 10], ['runner', 5]] },
      { duration: 14, composition: [['spitter', 4], ['runner', 8]] },
      { duration: 16, composition: [['shambler', 10], ['runner', 8], ['spitter', 3]] },
    ],
  },
  // Night 7: boss night. Boss zombie definition lands in M6 — for now this
  // entry is a stand-in heavy wave so the night still completes.
  {
    nightNum: 7,
    bossNight: true,
    waves: [
      { duration: 12, composition: [['shambler', 10], ['runner', 8]] },
      { duration: 14, composition: [['spitter', 5], ['runner', 8]] },
      { duration: 18, composition: [['shambler', 14], ['runner', 10], ['spitter', 4]] },
    ],
  },
];

export function getNightTemplate(n) {
  // Clamp to last entry so a misconfigured nightNum still yields *something*.
  const idx = Math.max(0, Math.min(WAVE_TEMPLATES.length - 1, n - 1));
  // Deep-copy the composition arrays so the WaveDirector can mutate counts
  // without polluting the shared template (next run would see drained counts).
  const tpl = WAVE_TEMPLATES[idx];
  return {
    nightNum: tpl.nightNum,
    bossNight: tpl.bossNight,
    waves: tpl.waves.map(w => ({
      duration: w.duration,
      composition: w.composition.map(([id, c]) => [id, c]),
    })),
  };
}
