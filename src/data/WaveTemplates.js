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
  // Night 4: bloater debut.
  {
    nightNum: 4,
    bossNight: false,
    waves: [
      { duration: 12, composition: [['shambler', 6], ['runner', 4]] },
      { duration: 14, composition: [['spitter', 2], ['runner', 4], ['bloater', 1]] },
      { duration: 14, composition: [['shambler', 6], ['bloater', 2], ['spitter', 1]] },
    ],
  },
  // Night 5: screamers + crawlers.
  {
    nightNum: 5,
    bossNight: false,
    waves: [
      { duration: 12, composition: [['runner', 6], ['screamer', 1]] },
      { duration: 14, composition: [['shambler', 6], ['spitter', 2], ['screamer', 1]] },
      { duration: 14, composition: [['crawler', 6], ['runner', 4], ['bloater', 1]] },
    ],
  },
  // Night 6: brute debut.
  {
    nightNum: 6,
    bossNight: false,
    waves: [
      { duration: 12, composition: [['shambler', 8], ['runner', 5]] },
      { duration: 14, composition: [['spitter', 3], ['screamer', 1], ['bloater', 2]] },
      { duration: 16, composition: [['brute', 1], ['shambler', 8], ['crawler', 4], ['spitter', 2]] },
    ],
  },
  // Night 7: boss night. Two waves of horde then Patient Zero arrives
  // alongside support adds. The boss multi-phase logic (summon + frenzy)
  // does most of the gameplay heavy lifting.
  {
    nightNum: 7,
    bossNight: true,
    waves: [
      { duration: 12, composition: [['shambler', 8], ['runner', 6], ['spitter', 2]] },
      { duration: 14, composition: [['screamer', 2], ['bloater', 3], ['runner', 6]] },
      { duration: 20, composition: [['patient_zero', 1], ['crawler', 6], ['shambler', 4], ['spitter', 2]] },
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
