// Narrative beats. NOTES are scrawled paper / wall messages — pure text.
// TAPES are voice recordings — text + a synth sfxId so the player hears
// something resembling a recorded voice as the transcript surfaces.
// STORY_ARC carries the light protagonist hook ("reach the harbor")
// surfaced at intro / act 1 / boss reveal / victory.
//
// Tone: deliberately unfinished. The horror reads better when the player
// fills in the gaps. Notes are second-person fragments, tapes are
// interrupted mid-sentence. Don't add lore that explains the apocalypse.

export const STORY_ARC = {
  intro:
    'NIGHT 1. You woke up to the sirens — they stopped at 4:14am.\n' +
    'The harbor radio said the boats are still leaving.\n' +
    'You head south.',
  act1Beat:
    'The lights are out across the city. Whoever\'s still alive\n' +
    'is hiding. You stop hearing footsteps that aren\'t yours.',
  bossReveal:
    'The figure in the basement isn\'t a survivor.\n' +
    'It knows your name.',
  ending:
    'You make it to the harbor at dawn.\n' +
    'A trawler is leaving. No one calls out as you climb aboard.',
};

export const NOTES = {
  apt_diary_01:
    'day 14. they don\'t sleep.\n' +
    'stop trying to be brave.\n' +
    'the basement is wrong.',
  apt_wall_01:
    'IF YOU CAN READ THIS\n' +
    'YOU\'RE ALREADY TOO LOUD',
  apt_register_01:
    'Apartment 308 — DO NOT ENTER.\n' +
    'They were trying to leave too.',
};

export const TAPES = {
  apt_radio_01: {
    transcript:
      '...static... if anyone is hearing this,\n' +
      'the harbor is still — *click*',
    sfxId: 'radio_static',
  },
  apt_voicemail_01: {
    transcript:
      'Mom, I\'m at the apartment. Don\'t come.\n' +
      'I\'m sorry. I love y— *beep*',
    sfxId: 'whisper_long',
  },
};

export function isKnownNote(id) { return Object.prototype.hasOwnProperty.call(NOTES, id); }
export function isKnownTape(id) { return Object.prototype.hasOwnProperty.call(TAPES, id); }
