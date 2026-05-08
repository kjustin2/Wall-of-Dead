// Text-event definitions. Each event is a single-layer choice tree:
//   pick an event → present 2-3 choices → apply outcome → show resultText.
//
// Outcomes are intentionally lopsided so the right pick depends on context
// (low HP, low ammo, etc.). `apply` mutates the runState in place.

export const OUTCOMES = {
  // — survivor —
  survivor_help: {
    resultText: 'they patch you up too. you part ways at dawn — both of you a little less alone.',
    apply: (rs) => { rs.heal(18); },
  },
  survivor_refuse: {
    resultText: 'they limp off. the firelight feels colder for it.',
    apply: (rs) => { rs.player.scrap += 6; },
  },
  survivor_rob: {
    resultText: 'they had a few rounds tucked away. they hate you for it. you tell yourself they would have done the same.',
    apply: (rs) => {
      rs.giveAmmoByType('LIGHT', 24);
      rs.player.hp = Math.max(1, rs.player.hp - 4);
    },
  },

  // — burned house —
  house_search: {
    resultText: 'a cache in the basement. someone packed it like they were coming back.',
    apply: (rs) => { rs.giveAmmoByType('LIGHT', 30); rs.giveAmmoByType('SHELL', 4); },
  },
  house_skip: {
    resultText: 'you keep moving. the dark inside felt wrong.',
    apply: (rs) => { rs.player.scrap += 4; },
  },

  // — raider ambush —
  raider_fight: {
    resultText: 'three of them, sloppy. you take a hit but the loot is worth it.',
    apply: (rs) => {
      rs.player.hp = Math.max(1, rs.player.hp - 14);
      rs.giveAmmoByType('HEAVY', 24);
      rs.player.scrap += 12;
    },
  },
  raider_run: {
    resultText: 'you ditch the road and lose them in the dead grass. costs you time, but you keep your skin.',
    apply: (rs) => { /* no-op; the trade is the avoided risk */ },
  },
  raider_bribe: {
    resultText: 'they take the scrap and let you walk. one of them spits in the dirt as you pass.',
    apply: (rs) => { rs.player.scrap = Math.max(0, rs.player.scrap - 10); rs.heal(8); },
  },

  // — supply truck —
  truck_loot: {
    resultText: 'still some pallets intact. you grab what you can carry.',
    apply: (rs) => { rs.giveAmmoByType('SHELL', 8); rs.giveAmmoByType('HEAVY', 16); },
  },
  truck_siphon: {
    resultText: 'you bleed the tank into a jerry can. fuel is fuel.',
    apply: (rs) => { rs.giveAmmoByType('FUEL', 60); rs.player.scrap += 4; },
  },

  // — child crying —
  child_help: {
    resultText: 'no child. just bait. a runner had been mimicking. you get out, but barely.',
    apply: (rs) => { rs.player.hp = Math.max(1, rs.player.hp - 18); },
  },
  child_walk_away: {
    resultText: 'you keep your distance. the crying stops the moment you turn the corner.',
    apply: (rs) => { rs.player.scrap += 3; },
  },
  child_investigate: {
    resultText: 'a real child. you give them what little you can spare. they hand you a tin medkit in return.',
    apply: (rs) => {
      rs.player.scrap = Math.max(0, rs.player.scrap - 6);
      rs.heal(28);
    },
  },

  // — locked safe —
  safe_force: {
    resultText: 'the lock gives. inside: a pistol mag and a stack of bills no one will ever spend.',
    apply: (rs) => { rs.giveAmmoByType('LIGHT', 36); rs.player.scrap += 8; },
  },
  safe_skip: {
    resultText: 'you leave it. some doors should stay shut.',
    apply: () => {},
  },

  // — broken radio —
  radio_listen: {
    resultText: 'a cracked voice gives you a heading. a survivor outpost — and they\'re trading.',
    apply: (rs) => { rs.player.scrap += 14; rs.heal(6); },
  },
  radio_ignore: {
    resultText: 'static. nothing but static. you walk on.',
    apply: () => {},
  },

  // — abandoned pharmacy —
  pharmacy_search: {
    resultText: 'expired but viable. a few painkillers, a few bandages.',
    apply: (rs) => { rs.heal(34); },
  },
  pharmacy_loot_drugs: {
    resultText: 'amphetamines. you trade what you don\'t need to the next survivor camp.',
    apply: (rs) => { rs.heal(8); rs.player.scrap += 14; },
  },
  pharmacy_torch: {
    resultText: 'no point letting raiders use it. the fire warms you for a few minutes.',
    apply: (rs) => { rs.heal(12); },
  },
};

export const EVENTS = [
  {
    id: 'survivor_camp',
    title: 'A SURVIVOR',
    blurb: 'they limp toward the firelight, hands raised. one good leg, one bad. they smell like infection but their eyes are clear.',
    choices: [
      { label: 'share a med-kit',         outcome: 'survivor_help'   },
      { label: 'turn them away',          outcome: 'survivor_refuse' },
      { label: 'rob them at gunpoint',    outcome: 'survivor_rob'    },
    ],
  },
  {
    id: 'burned_house',
    title: 'A BURNED HOUSE',
    blurb: 'half the roof is collapsed. a child\'s bicycle leans against the porch. the door is unlocked.',
    choices: [
      { label: 'search the basement',     outcome: 'house_search' },
      { label: 'keep moving',             outcome: 'house_skip'   },
    ],
  },
  {
    id: 'raider_ambush',
    title: 'RAIDERS',
    blurb: 'three of them on the highway, blocking the lane with a burnt-out van. the lead one is grinning.',
    choices: [
      { label: 'open fire first',         outcome: 'raider_fight' },
      { label: 'cut and run',             outcome: 'raider_run'   },
      { label: 'pay them off (-10 scrap)', outcome: 'raider_bribe' },
    ],
  },
  {
    id: 'supply_truck',
    title: 'A SUPPLY TRUCK',
    blurb: 'a delivery truck sits jackknifed in a ditch. cargo hold half-open. tank intact.',
    choices: [
      { label: 'grab the pallets',        outcome: 'truck_loot'   },
      { label: 'siphon the fuel',         outcome: 'truck_siphon' },
    ],
  },
  {
    id: 'child_crying',
    title: 'A CHILD CRYING',
    blurb: 'somewhere in the dark, a kid is sobbing. it could be real. it could be a runner that learned the sound.',
    choices: [
      { label: 'rush in to help',         outcome: 'child_help'         },
      { label: 'walk away',               outcome: 'child_walk_away'    },
      { label: 'check from cover',        outcome: 'child_investigate'  },
    ],
  },
  {
    id: 'locked_safe',
    title: 'A LOCKED SAFE',
    blurb: 'a wall safe behind a torn-down painting. heavy. someone wanted whatever\'s in here protected.',
    choices: [
      { label: 'force it open',           outcome: 'safe_force' },
      { label: 'leave it sealed',         outcome: 'safe_skip'  },
    ],
  },
  {
    id: 'broken_radio',
    title: 'A BROKEN RADIO',
    blurb: 'the speaker rattles between bursts of static. now and then a word breaks through.',
    choices: [
      { label: 'tune it in',              outcome: 'radio_listen' },
      { label: 'walk past',               outcome: 'radio_ignore' },
    ],
  },
  {
    id: 'pharmacy',
    title: 'AN ABANDONED PHARMACY',
    blurb: 'glass on the floor, shelves picked clean — except for a back room someone overlooked.',
    choices: [
      { label: 'search for medicine',     outcome: 'pharmacy_search'      },
      { label: 'loot the controlled meds', outcome: 'pharmacy_loot_drugs' },
      { label: 'torch the building',      outcome: 'pharmacy_torch'       },
    ],
  },
];
