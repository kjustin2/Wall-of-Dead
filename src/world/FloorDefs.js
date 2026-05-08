// Hand-authored floor layouts, one per night. Each entry drives Floor.js
// (walls + spawn points + visual theme), plus the per-floor interactable
// + scare-event scripting. Coordinates are in canvas pixels; the playable
// area is 1280×720 with a 36px outer wall margin (so safe interior is
// roughly x=36–1244, y=36–684).
//
// Picking philosophy: each floor introduces ONE new sensory hook that
// competes for the player's attention with the zombies — a fuse box that
// kills the lights, gas cans that beg to be shot, mannequins designed to
// be mistaken for zombies, etc. Encounters get tighter and darker as the
// week progresses, peaking at the church-basement boss arena.

import { ScareEventRunner } from './ScareEvents.js';
import { isKnownType } from './Interactables.js';
import { isKnownNote, isKnownTape } from './Narrative.js';

export const FLOORS = [
  // ── Night 1: Apartment Lobby (multi-zone canary) ─────────────────────
  // Phase 2 turns Night 1 into a 4-zone connected level: the player starts
  // in the lobby, threads through a stairwell + hallway, and ends on the
  // roof. WaveDirector spawns are scoped to whichever zone is active, so
  // the night still drains in linear time even if the player explores.
  // Other nights remain single-zone (legacy flat schema).
  {
    id: 'apartment_lobby',
    name: 'BUILDING A · APT 308',
    blurb: 'You smell wet ash. The elevator chimes by itself.',
    dims: { width: 1280, height: 720 },
    entryZoneId: 'lobby',
    terminalZoneId: 'roof',
    ambientCues: ['floor_creak', 'pipe_drip', 'whisper_short', 'flicker_buzz'],
    zones: [
      {
        id: 'lobby',
        kind: 'combat',
        theme: { floor: '#15101a', wall: '#28181f', accent: '#3a1f28', fogTint: '#241016' },
        walls: [
          { x: 560, y: 320, w: 160, h: 60 },     // reception desk
          { x: 320, y: 200, w: 40,  h: 40 },     // pillar NW
          { x: 320, y: 480, w: 40,  h: 40 },     // pillar SW
          { x: 880, y: 80,  w: 20,  h: 220 },    // right divider top
          { x: 880, y: 420, w: 20,  h: 220 },    // right divider bottom (door slot in middle)
        ],
        spawnPoints: [
          { x: 80,   y: 360 },
          { x: 200,  y: 80  },
          { x: 640,  y: 80  },
          { x: 1080, y: 600 },
        ],
        interactables: [
          { type: 'HangingBody', x: 200, y: 160 },
          { type: 'FuseBox',     x: 80,  y: 320, lights: ['lobby_main'] },
          { type: 'Mannequin',   x: 640, y: 290 },
          { type: 'WallDoor',    x: 920, y: 360, w: 56, h: 14, label: 'STAIRWELL',
            targetZoneId: 'stairwell', entryPoint: { x: 120, y: 360 } },
        ],
        scareEvents: [
          { trigger: 'time', after: 4, do: 'flicker_lights' },
          { trigger: 'hp_below', frac: 0.5, do: 'whisper_close' },
          { trigger: 'kills_remaining', n: 2, do: 'scream_distant' },
        ],
        ambientCues: ['floor_creak', 'pipe_drip', 'whisper_short', 'flicker_buzz'],
      },
      {
        id: 'stairwell',
        kind: 'combat',
        theme: { floor: '#0c0810', wall: '#1c1018', accent: '#2a1822', fogTint: '#1a0c14', darkness: 0.90 },
        walls: [
          { x: 360, y: 80,  w: 20, h: 560 },     // long left rail
          { x: 880, y: 80,  w: 20, h: 560 },     // long right rail
          { x: 480, y: 240, w: 320, h: 30 },     // landing top
          { x: 480, y: 460, w: 320, h: 30 },     // landing bottom
        ],
        spawnPoints: [
          { x: 640, y: 100 },
          { x: 640, y: 620 },
        ],
        interactables: [
          { type: 'WallDoor', x: 96,  y: 360, w: 56, h: 14, label: 'LOBBY',
            targetZoneId: 'lobby',   entryPoint: { x: 880, y: 360 } },
          { type: 'WallDoor', x: 1184, y: 360, w: 56, h: 14, label: 'HALLWAY',
            targetZoneId: 'hallway', entryPoint: { x: 80, y: 360 } },
        ],
        scareEvents: [
          { trigger: 'time', after: 3, do: 'whisper_close' },
          { trigger: 'kills_remaining', n: 1, do: 'chain_drag_pass' },
        ],
        ambientCues: ['chain_drag', 'pipe_drip', 'whisper_long'],
      },
      {
        id: 'hallway',
        kind: 'fork',
        theme: { floor: '#100c14', wall: '#241420', accent: '#341e2c', fogTint: '#1a0c12' },
        walls: [
          { x: 200, y: 220, w: 300, h: 30 },
          { x: 200, y: 470, w: 300, h: 30 },
          { x: 700, y: 220, w: 300, h: 30 },
          { x: 700, y: 470, w: 300, h: 30 },
          { x: 600, y: 320, w: 80,  h: 80 },     // central blockage
        ],
        spawnPoints: [
          { x: 120,  y: 360 },
          { x: 1160, y: 360 },
          { x: 640,  y: 80  },
          { x: 640,  y: 620 },
        ],
        interactables: [
          { type: 'GasCan',    x: 800, y: 360 },
          { type: 'Mannequin', x: 240, y: 360 },
          { type: 'WallDoor',  x: 96,  y: 360, w: 56, h: 14, label: 'STAIRWELL',
            targetZoneId: 'stairwell', entryPoint: { x: 1160, y: 360 } },
          { type: 'WallDoor',  x: 1184, y: 360, w: 56, h: 14, label: 'ROOF · SAFE',
            targetZoneId: 'roof', entryPoint: { x: 120, y: 540 } },
          { type: 'WallDoor',  x: 640, y: 660, w: 64, h: 14, label: 'BASEMENT · SHORTCUT',
            targetZoneId: 'stairwell_down', entryPoint: { x: 120, y: 360 } },
        ],
        scareEvents: [
          { trigger: 'time', after: 5, do: 'whisper_long' },
          { trigger: 'hp_below', frac: 0.4, do: 'scream_distant' },
        ],
        ambientCues: ['floor_creak', 'rat_skitter', 'whisper_short'],
      },
      {
        id: 'stairwell_down',
        kind: 'chase',
        // The chase branch: pitch-dark stairwell descending into the
        // building's guts. Slam_doors fires immediately, sealing the
        // lobby exit. ChaseEntity spawns at the far end and stalks the
        // player toward the only escape — a fire door at the east side
        // that empties onto the roof.
        theme: { floor: '#08060a', wall: '#1a0c10', accent: '#2a141a', fogTint: '#100408', darkness: 0.94 },
        // Walls leave a clean y≈340–400 corridor for the chase. Cover
        // above and below gives the player something to pivot around
        // while still funneling the pursuit east-to-west.
        walls: [
          { x: 240, y: 120, w: 60, h: 200 },     // left support upper
          { x: 240, y: 420, w: 60, h: 200 },     // left support lower
          { x: 980, y: 120, w: 60, h: 200 },     // right support upper
          { x: 980, y: 420, w: 60, h: 200 },     // right support lower
          { x: 480, y: 180, w: 60, h: 100 },     // pillar above corridor
          { x: 740, y: 460, w: 60, h: 100 },     // pillar below corridor
        ],
        spawnPoints: [
          { x: 1100, y: 360 },                   // chase exit side
          { x: 640,  y: 100 },
          { x: 640,  y: 620 },
        ],
        interactables: [
          { type: 'Door',     x: 96,  y: 360, w: 56, h: 14 },         // slammed by scare event
          { type: 'WallDoor', x: 1184, y: 360, w: 56, h: 14, label: 'FIRE EXIT',
            targetZoneId: 'roof', entryPoint: { x: 120, y: 540 } },
        ],
        chase: { x: 1140, y: 360, speed: 220, lethalR: 32, spawnDelay: 1.2 },
        scareEvents: [
          { trigger: 'time', after: 0.4, do: 'slam_doors' },
          { trigger: 'time', after: 0.6, do: 'breath_panic' },
          { trigger: 'time', after: 3,   do: 'scream_distant' },
        ],
        ambientCues: ['heartbeat_fast', 'whisper_long', 'chain_drag', 'breath_panic'],
      },
      {
        id: 'roof',
        kind: 'combat',
        theme: { floor: '#1a1820', wall: '#3a2c2e', accent: '#5a3e3e', fogTint: '#2c1c20', darkness: 0.62 },
        walls: [
          { x: 540, y: 200, w: 120, h: 60 },     // AC unit
          { x: 760, y: 440, w: 100, h: 60 },     // vent housing
        ],
        spawnPoints: [
          { x: 80,   y: 80  },
          { x: 1180, y: 80  },
          { x: 80,   y: 620 },
          { x: 1180, y: 620 },
        ],
        interactables: [
          { type: 'WallDoor', x: 96, y: 540, w: 56, h: 14, label: 'BACK',
            targetZoneId: 'hallway', entryPoint: { x: 1160, y: 360 } },
          // Phase 4 narrative pickups — the "go up and interact" beats
          // the user called out specifically. Roof is the rewarded
          // safe path; finding both completes the apt-308 lore arc.
          { type: 'NarrativeNote', x: 620, y: 240, noteId: 'apt_diary_01' },
          { type: 'VoiceTape',     x: 820, y: 460, tapeId: 'apt_radio_01' },
        ],
        scareEvents: [
          { trigger: 'time', after: 6, do: 'music_box_phrase' },
        ],
        ambientCues: ['floor_creak', 'distant_scream', 'whisper_long'],
      },
    ],
  },

  // ── Night 2: Parking Garage ──────────────────────────────────────────
  // Concrete pillars give cover but break sightlines. Gas cans turn into
  // crowd-control opportunities (or panic explosions if shot blindly).
  {
    id: 'parking_garage',
    name: 'SUBLEVEL B · GARAGE',
    blurb: 'Sodium lights buzz. Something dragged itself across the oil.',
    theme: { floor: '#0e1014', wall: '#1c2026', accent: '#2c3038', fogTint: '#101820' },
    dims: { width: 1280, height: 720 },
    walls: [
      { x: 280, y: 200, w: 60, h: 60 },
      { x: 600, y: 200, w: 60, h: 60 },
      { x: 920, y: 200, w: 60, h: 60 },
      { x: 280, y: 480, w: 60, h: 60 },
      { x: 600, y: 480, w: 60, h: 60 },
      { x: 920, y: 480, w: 60, h: 60 },
      { x: 880, y: 360, w: 200, h: 60 },     // car wreck
    ],
    spawnPoints: [
      { x: 80,   y: 100 },
      { x: 1180, y: 100 },
      { x: 80,   y: 620 },
      { x: 1180, y: 620 },
      { x: 640,  y: 80  },
    ],
    interactables: [
      { type: 'GasCan',      x: 420, y: 380 },
      { type: 'GasCan',      x: 740, y: 320 },
      { type: 'GasCan',      x: 1040, y: 540 },
      { type: 'Mannequin',   x: 360, y: 200 },     // half-hidden behind pillar
      { type: 'HangingBody', x: 220, y: 400 },
      { type: 'FuseBox',     x: 80,  y: 400, lights: ['garage_main'] },
    ],
    scareEvents: [
      { trigger: 'time', after: 6, do: 'flicker_lights' },
      { trigger: 'hp_below', frac: 0.4, do: 'scream_distant' },
      { trigger: 'kills_remaining', n: 3, do: 'chain_drag_pass' },
    ],
    ambientCues: ['chain_drag', 'distant_scream', 'rat_skitter', 'pipe_drip'],
  },

  // ── Night 3: Pharmacy Aisles ─────────────────────────────────────────
  // Aisles force LoS-based fights; mannequins make every silhouette
  // suspect. Glass shatter cue when half-cleared sells the place falling
  // apart.
  {
    id: 'pharmacy_aisles',
    name: 'CORNER PHARMACY',
    blurb: 'Most of the meds are gone. Most of the staff, too.',
    theme: { floor: '#141a16', wall: '#22302a', accent: '#3a5042', fogTint: '#182018' },
    dims: { width: 1280, height: 720 },
    walls: [
      { x: 140, y: 180, w: 320, h: 16 },
      { x: 580, y: 180, w: 420, h: 16 },
      { x: 1100,y: 180, w: 100, h: 16 },
      { x: 140, y: 360, w: 420, h: 16 },
      { x: 700, y: 360, w: 320, h: 16 },
      { x: 140, y: 540, w: 320, h: 16 },
      { x: 580, y: 540, w: 420, h: 16 },
      { x: 1100,y: 540, w: 100, h: 16 },
    ],
    spawnPoints: [
      { x: 80,   y: 100 },
      { x: 1200, y: 100 },
      { x: 80,   y: 620 },
      { x: 1200, y: 620 },
      { x: 640,  y: 660 },
    ],
    interactables: [
      { type: 'Mannequin',   x: 400, y: 240 },
      { type: 'Mannequin',   x: 820, y: 420 },
      { type: 'Mannequin',   x: 540, y: 600 },
      { type: 'Mannequin',   x: 300, y: 420 },
      { type: 'FuseBox',     x: 80,  y: 400, lights: ['pharmacy_main'] },
      { type: 'HangingBody', x: 940, y: 240 },
    ],
    scareEvents: [
      { trigger: 'time', after: 8, do: 'flicker_lights' },
      { trigger: 'kills_remaining', n: 4, do: 'whisper_long' },
      { trigger: 'hp_below', frac: 0.3, do: 'breath_panic' },
    ],
    ambientCues: ['floor_creak', 'whisper_short', 'music_box', 'pipe_drip'],
  },

  // ── Night 4: Overgrown Park ─────────────────────────────────────────
  // Open-ish with sparse trees. Two rat nests scatter when player
  // approaches. The tilt — outdoor "safe" sky relief that turns out to
  // hide just as much as the basement did.
  {
    id: 'overgrown_park',
    name: 'CITY PARK · DUSK',
    blurb: 'The swings creak by themselves. Something is up the slide.',
    theme: { floor: '#0c140a', wall: '#1c2810', accent: '#2c3818', fogTint: '#101810' },
    dims: { width: 1280, height: 720 },
    walls: [
      { x: 300, y: 200, w: 40, h: 40 },     // tree
      { x: 900, y: 160, w: 40, h: 40 },     // tree
      { x: 600, y: 380, w: 40, h: 40 },     // tree
      { x: 380, y: 540, w: 40, h: 40 },     // tree
      { x: 1020,y: 480, w: 40, h: 40 },     // tree
      { x: 200, y: 380, w: 80, h: 16 },     // bench
      { x: 760, y: 540, w: 80, h: 16 },     // bench
    ],
    spawnPoints: [
      { x: 80,   y: 80  },
      { x: 1200, y: 80  },
      { x: 80,   y: 640 },
      { x: 1200, y: 640 },
      { x: 640,  y: 80  },
      { x: 640,  y: 640 },
    ],
    interactables: [
      { type: 'HangingBody', x: 320, y: 280 },     // "from the tree"
      { type: 'HangingBody', x: 920, y: 240 },
      { type: 'Mannequin',   x: 600, y: 200 },     // scarecrow
      { type: 'RatNest',     x: 180, y: 180 },
      { type: 'RatNest',     x: 1080, y: 600 },
    ],
    scareEvents: [
      { trigger: 'time', after: 10, do: 'whisper_long' },
      { trigger: 'kills_remaining', n: 2, do: 'scream_distant' },
      { trigger: 'hp_below', frac: 0.5, do: 'whisper_close' },
    ],
    ambientCues: ['rat_skitter', 'floor_creak', 'distant_scream', 'whisper_short'],
  },

  // ── Night 5: Subway Platform ─────────────────────────────────────────
  // Long platform with tight pillars. Distant scream halfway through
  // doubles as a "train coming" cue, telegraphing intensity rise.
  {
    id: 'subway_platform',
    name: 'GREENLINE STATION',
    blurb: 'No trains. The third rail hums anyway.',
    theme: { floor: '#0e0c12', wall: '#1c1a24', accent: '#2c2a3a', fogTint: '#181620' },
    dims: { width: 1280, height: 720 },
    walls: [
      { x: 80,  y: 140, w: 1120, h: 20 },     // top rail edge
      { x: 80,  y: 560, w: 1120, h: 20 },     // bottom rail edge
      { x: 240, y: 300, w: 40, h: 120 },      // pillar
      { x: 600, y: 300, w: 40, h: 120 },      // pillar
      { x: 960, y: 300, w: 40, h: 120 },      // pillar
    ],
    spawnPoints: [
      { x: 80,   y: 360 },
      { x: 1200, y: 360 },
      { x: 80,   y: 280 },
      { x: 1200, y: 460 },
    ],
    interactables: [
      { type: 'FuseBox',     x: 240, y: 280, lights: ['platform_north'] },
      { type: 'HangingBody', x: 600, y: 200 },
      { type: 'Mannequin',   x: 820, y: 440 },
      { type: 'RatNest',     x: 980, y: 240 },
    ],
    scareEvents: [
      { trigger: 'time', after: 7, do: 'flicker_lights' },
      { trigger: 'time', after: 14, do: 'scream_distant' },
      { trigger: 'kills_remaining', n: 5, do: 'panic_pulse' },
      { trigger: 'hp_below', frac: 0.4, do: 'chain_drag_pass' },
    ],
    ambientCues: ['rat_skitter', 'distant_scream', 'chain_drag', 'flicker_buzz'],
  },

  // ── Night 6: Boiler Room ─────────────────────────────────────────────
  // Hardest pre-boss. Klaxon at 2s, gas cans + gas-leak event keep the
  // player moving. Catwalk forces commitment to one route.
  {
    id: 'boiler_room',
    name: 'BOILER ROOM',
    blurb: 'Steam, rust, the steady tick of metal trying to give up.',
    theme: { floor: '#160d08', wall: '#3a2010', accent: '#5a3010', fogTint: '#1a0e08' },
    dims: { width: 1280, height: 720 },
    walls: [
      { x: 200, y: 180, w: 120, h: 160 },     // boiler bank A
      { x: 920, y: 200, w: 120, h: 140 },     // boiler bank B
      { x: 100, y: 460, w: 300, h: 20 },      // pipe
      { x: 700, y: 460, w: 400, h: 20 },      // pipe
      { x: 400, y: 320, w: 440, h: 20 },      // catwalk
    ],
    spawnPoints: [
      { x: 80,   y: 80  },
      { x: 1200, y: 80  },
      { x: 80,   y: 640 },
      { x: 1200, y: 640 },
    ],
    interactables: [
      { type: 'GasCan',    x: 320, y: 540 },
      { type: 'GasCan',    x: 620, y: 600 },
      { type: 'GasCan',    x: 1000,y: 540 },
      { type: 'FuseBox',   x: 80,  y: 280, lights: ['boiler_main'] },
      { type: 'Mannequin', x: 220, y: 600 },        // worker in hardhat
    ],
    scareEvents: [
      { trigger: 'time', after: 2, do: 'radio_static_burst' },     // klaxon
      { trigger: 'time', after: 8, do: 'flicker_lights' },
      { trigger: 'kills_remaining', n: 6, do: 'gas_leak' },
      { trigger: 'hp_below', frac: 0.5, do: 'panic_pulse' },
    ],
    ambientCues: ['pipe_drip', 'flicker_buzz', 'chain_drag', 'distant_scream'],
  },

  // ── Night 7: Boss · Church Basement ──────────────────────────────────
  // Open arena (no inner walls — boss phases need free movement). Music
  // box ambient, hanging bodies in the corners, very dark theme. The
  // BossPatientZero AI handles most of the threat; environment is mood.
  {
    id: 'boss_floor',
    name: 'CRYPT · PATIENT ZERO',
    blurb: 'Candles, but no smoke. The hymn is in the wrong key.',
    theme: { floor: '#0a050a', wall: '#1a0c14', accent: '#3a121e', fogTint: '#10060c' },
    dims: { width: 1280, height: 720 },
    walls: [],
    spawnPoints: [
      { x: 100,  y: 100 },
      { x: 1180, y: 100 },
      { x: 100,  y: 620 },
      { x: 1180, y: 620 },
      { x: 640,  y: 100 },
      { x: 640,  y: 620 },
    ],
    interactables: [
      { type: 'HangingBody', x: 180,  y: 180 },
      { type: 'HangingBody', x: 1100, y: 180 },
      { type: 'HangingBody', x: 180,  y: 540 },
      { type: 'HangingBody', x: 1100, y: 540 },
    ],
    scareEvents: [
      { trigger: 'time', after: 3, do: 'panic_pulse' },
      { trigger: 'time', after: 14, do: 'music_box_phrase' },
      { trigger: 'hp_below', frac: 0.5, do: 'whisper_long' },
      { trigger: 'hp_below', frac: 0.2, do: 'chain_drag_pass' },
    ],
    ambientCues: ['music_box', 'whisper_long', 'chain_drag', 'breath_held'],
  },
];

// Pick the floor for a given night. Night 7 (boss) always returns the
// boss floor. Other nights pick by index. Falls back to the lobby for
// out-of-range values so an unexpected nightNum still produces a level.
export function getFloorForNight(nightNum, isBoss) {
  if (isBoss) return FLOORS[FLOORS.length - 1];
  const idx = Math.max(0, Math.min(FLOORS.length - 2, (nightNum || 1) - 1));
  return FLOORS[idx];
}

// Internal sanity check used by the smoke test. Verifies every floor's
// interactable types and scare-event actions reference real classes /
// handlers so a typo in this file fails fast. Walks zones for multi-zone
// floors (Phase 2) and also checks that every transition's `from`/`to`
// resolve to real zone ids.
export function validateFloorDefs() {
  const errors = [];
  for (const f of FLOORS) {
    if (!f.dims || !f.dims.width || !f.dims.height) {
      errors.push(`floor ${f.id}: missing dims`);
    }
    const zoneList = Array.isArray(f.zones) && f.zones.length > 0 ? f.zones : null;
    if (zoneList) {
      const zoneIds = new Set(zoneList.map(z => z.id));
      for (const z of zoneList) {
        for (const i of (z.interactables || [])) {
          if (!isKnownType(i.type)) errors.push(`floor ${f.id}/${z.id}: unknown interactable type "${i.type}"`);
          if (i.type === 'WallDoor' && i.targetZoneId && !zoneIds.has(i.targetZoneId)) {
            errors.push(`floor ${f.id}/${z.id}: WallDoor targets unknown zone "${i.targetZoneId}"`);
          }
          if (i.type === 'NarrativeNote' && i.noteId && !isKnownNote(i.noteId)) {
            errors.push(`floor ${f.id}/${z.id}: NarrativeNote references unknown noteId "${i.noteId}"`);
          }
          if (i.type === 'VoiceTape' && i.tapeId && !isKnownTape(i.tapeId)) {
            errors.push(`floor ${f.id}/${z.id}: VoiceTape references unknown tapeId "${i.tapeId}"`);
          }
        }
        for (const s of (z.scareEvents || [])) {
          if (!ScareEventRunner.isKnownAction(s.do)) {
            errors.push(`floor ${f.id}/${z.id}: unknown scare action "${s.do}"`);
          }
        }
      }
      for (const t of (f.transitions || [])) {
        if (!zoneIds.has(t.from)) errors.push(`floor ${f.id}: transition.from "${t.from}" not a zone`);
        if (!zoneIds.has(t.to))   errors.push(`floor ${f.id}: transition.to "${t.to}" not a zone`);
      }
      if (f.entryZoneId && !zoneIds.has(f.entryZoneId)) {
        errors.push(`floor ${f.id}: entryZoneId "${f.entryZoneId}" not a zone`);
      }
      if (f.terminalZoneId && !zoneIds.has(f.terminalZoneId)) {
        errors.push(`floor ${f.id}: terminalZoneId "${f.terminalZoneId}" not a zone`);
      }
    } else {
      for (const i of (f.interactables || [])) {
        if (!isKnownType(i.type)) errors.push(`floor ${f.id}: unknown interactable type "${i.type}"`);
      }
      for (const s of (f.scareEvents || [])) {
        if (!ScareEventRunner.isKnownAction(s.do)) {
          errors.push(`floor ${f.id}: unknown scare action "${s.do}"`);
        }
      }
    }
  }
  return errors;
}
