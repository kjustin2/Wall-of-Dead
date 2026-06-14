// The day's scavenging choices. Each expedition pairs a minigame with a risk
// and a reward multiplier, so the player trades safety for supplies. The safe
// cache is always on offer; two action runs rotate by night so the menu stays
// fresh trip to trip.

import { SteadyHands } from './SteadyHands.js';
import { EvasionRun } from './EvasionRun.js';
import { GrabAndGo } from './GrabAndGo.js';
import { HoldZone } from './HoldZone.js';

export const EXPEDITIONS = {
  cache:  { id: 'cache',  title: 'Quiet Supply Cache', loc: 'A boarded-up pharmacy', risk: 'Low',  reward: 'Modest', mult: 0.9,  make: () => new SteadyHands() },
  outrun: { id: 'outrun', title: 'Outrun the Pack',    loc: 'The overrun lot',      risk: 'High', reward: 'Big',    mult: 1.45, make: () => new EvasionRun() },
  grab:   { id: 'grab',   title: 'Smash & Grab',       loc: 'A ransacked grocery',  risk: 'Med',  reward: 'Good',   mult: 1.18, make: () => new GrabAndGo() },
  siphon: { id: 'siphon', title: 'Fuel Siphon',        loc: 'The highway wrecks',   risk: 'Med',  reward: 'Good',   mult: 1.22, make: () => new HoldZone() },
};

const RISK_COLOR = { Low: '#5fbf6a', Med: '#d8a24a', High: '#d8662e' };
export const riskColor = (r) => RISK_COLOR[r] || '#9fb8a6';

export function dayOptions(night) {
  const action = ['outrun', 'grab', 'siphon'];
  const a = action[(night - 1) % action.length];
  let b = action[night % action.length];
  if (b === a) b = action[(night + 1) % action.length];
  return ['cache', a, b].map((id) => EXPEDITIONS[id]);
}
