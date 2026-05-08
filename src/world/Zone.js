// A single playable space inside a Floor — walls, spawn points, theme,
// interactable specs, ambient cue pool, scare events, plus the per-zone
// render cache and persisted state used to restore the zone when the
// player walks back into it.
//
// All zones in the same Floor share the Floor's outer dims (canvas size).
// Different walls / spawn points / theme per zone are how a multi-zone
// Floor reads as different rooms even though the camera doesn't move.
//
// `kind` is reserved for Phase 3 ('combat' | 'fork' | 'chase'). Phase 2
// only reads it as opaque metadata.

import { ARENA, PALETTE } from '../Config.js';

export class Zone {
  constructor(def, parentDims) {
    this.def = def || {};
    this.id = this.def.id || 'main';
    this.kind = this.def.kind || 'combat';
    const dims = this.def.dims || parentDims || { width: ARENA.width, height: ARENA.height };
    this.w = dims.width;
    this.h = dims.height;
    this.walls = (this.def.walls || []).map(w => ({ ...w }));
    this.spawnPoints = (this.def.spawnPoints || []).map(p => ({ ...p }));
    this.theme = this.def.theme || {};
    this.interactableSpecs = (this.def.interactables || []).map(s => ({ ...s }));
    this.ambientCues = this.def.ambientCues || null;
    this.scareEvents = this.def.scareEvents || [];
    this.entryPoint = this.def.entryPoint || null;   // default spawn for the player when this zone activates
    this._floorCache = null;
    // persistedState is what the Floor stores when the player leaves this
    // zone, so re-entry restores cleared state (interactables already shot,
    // wave already drained). interactableAlive is a parallel array of bools
    // matching the order of `interactableSpecs`. corpses[] is reserved for
    // Phase 3 polish — Phase 2 never populates it.
    this.persistedState = {
      visited: false,
      cleared: false,
      interactableAlive: null,
      corpses: [],
    };
  }
}
