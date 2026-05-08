import { Scene } from './Scene.js';
import { events } from '../engine/EventBus.js';
import { runState } from '../world/RunState.js';
import { MapUI } from '../ui/MapUI.js';
import { truncateToWidth } from '../util/text.js';
import { PALETTE, NIGHT } from '../Config.js';

// Owns the run-graph navigation. Reads runState.graph and routes the user
// to the next scene based on the chosen node type.

const NODE_DEST = {
  combat:   'combat',
  elite:    'combat',           // routes to combat with `elite: true` param
  boss:     'combat',           // routes to combat with `boss: true` param
  scavenge: 'scavenge',
  event:    'event',
  shop:     'shop',
};

export class MapScene extends Scene {
  constructor(input) {
    super();
    this.input = input;
    this.ui = new MapUI();
    this._laidOutFor = null;   // re-layout if canvas resizes mid-scene
  }

  enter() {
    if (!runState.active || !runState.graph) {
      // Defensive — should not happen in normal flow. Bounce to intro.
      events.emit('SCENE_CHANGE', { name: 'intro' });
      return;
    }
    const w = this.input.canvas.width, h = this.input.canvas.height;
    this.ui.layout(runState.graph, w, h);
    this._laidOutFor = `${w}x${h}`;
  }

  update(dt) {
    if (!runState.graph) return;
    const w = this.input.canvas.width, h = this.input.canvas.height;
    const dim = `${w}x${h}`;
    if (dim !== this._laidOutFor) {
      this.ui.layout(runState.graph, w, h);
      this._laidOutFor = dim;
    }

    this.ui.updateHover(this.input.mouse.x, this.input.mouse.y, runState.currentNodeId, runState.graph);
    if (this.input.consumeClick()) {
      const tgt = this.ui.hitTest(this.input.mouse.x, this.input.mouse.y, runState.currentNodeId, runState.graph);
      if (tgt) {
        runState.advanceTo(tgt);
        const node = runState.graph.nodeMap[tgt];
        const dest = NODE_DEST[node.type];
        if (!dest) return;
        const params = {};
        if (node.type === 'elite') { params.elite = true; }
        if (node.type === 'boss')  { params.boss  = true; }
        params.nightNum = runState.nightNum;
        events.emit('SCENE_CHANGE', { name: dest, params });
      }
    }

    if (this.input.consumeKey('escape')) {
      events.emit('SCENE_CHANGE', { name: 'intro' });
    }
  }

  render(ctx) {
    if (!runState.graph) return;
    this.ui.draw(ctx, runState.graph, runState.currentNodeId);

    // Status panel (top-right): HP / scrap / weapons
    const w = ctx.canvas.width;
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`HP  ${Math.ceil(runState.player.hp)} / ${runState.player.maxHp}`, w - 24, 32);
    ctx.fillStyle = PALETTE.uiAccent;
    ctx.fillText(`SCRAP  ${runState.player.scrap}`, w - 24, 50);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText(`night ${runState.nightNum} / ${NIGHT.totalNights}`, w - 24, 68);
    ctx.fillText(`kills ${runState.player.kills}`, w - 24, 84);

    // Inventory list — names truncated so multi-word weapons (e.g.
    // "Assault Rifle", "Proximity Mine") still fit alongside the ammo
    // counts on narrower viewports.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    let yy = 110;
    for (const wpn of runState.player.inventory) {
      const cur = wpn === runState.player.inventory[runState.player.currentWeaponIdx];
      ctx.fillStyle = cur ? PALETTE.uiText : PALETTE.uiDim;
      const shortName = truncateToWidth(ctx, wpn.name, 90);
      ctx.fillText(`${shortName}  ${wpn.mag}/${wpn.reserve}`, w - 24, yy);
      yy += 14;
    }
  }

  engineState() { return 'menu'; }
}
