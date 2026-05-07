// MapUI: renders the run graph + handles click hit-testing for reachable
// nodes. Lives outside MapScene so the same render code can be reused
// (e.g. on the GameOverScene to show "you reached this node").

import { PALETTE, NIGHT } from '../Config.js';

// Colors per node type
const TYPE_COLOR = {
  start:    '#cdd6c0',
  combat:   '#ff7755',
  elite:    '#ff5544',
  scavenge: '#7eff66',
  event:    '#9ad0ff',
  shop:     '#ffaa33',
  boss:     '#ff3344',
};

const TYPE_GLYPH = {
  start:    '◊',
  combat:   '✕',
  elite:    '✕',
  scavenge: '◇',
  event:    '?',
  shop:     '$',
  boss:     '★',
};

const TYPE_LABEL = {
  start:    'BASE CAMP',
  combat:   'NIGHT',
  elite:    'ELITE NIGHT',
  scavenge: 'SCAVENGE',
  event:    'EVENT',
  shop:     'SHOP',
  boss:     'FREEDOM ZONE',
};

const TYPE_DESC = {
  combat:   'survive a wave of zombies',
  elite:    'tougher waves, better loot',
  scavenge: 'play a minigame for supplies',
  event:    'a survivor encounter',
  shop:     'spend scrap on gear',
  boss:     'final fight to escape',
};

export class MapUI {
  constructor() {
    this._spheres = [];   // { id, x, y, r } — recomputed each frame
    this._hoverId = null;
  }

  layout(graph, w, h) {
    const padTop = 90, padBot = 70, padX = 80;
    const layerH = (h - padTop - padBot) / Math.max(1, graph.maxLayers - 1);
    const colW = w - padX * 2;
    this._spheres.length = 0;
    for (let i = 0; i < graph.maxLayers; i++) {
      const row = graph.layers[i];
      // Row Y is inverted: layer 0 at bottom, boss at top — feels like climbing.
      const yPos = h - padBot - i * layerH;
      const widthRange = (row.length === 1) ? 0 : colW;
      const startX = padX + (colW - widthRange) / 2;
      for (let j = 0; j < row.length; j++) {
        const node = row[j];
        const x = (row.length === 1)
          ? w / 2
          : startX + node.xPos * widthRange;
        this._spheres.push({ id: node.id, x, y: yPos, r: 22 });
      }
    }
  }

  // returns hovered node id (or null)
  updateHover(mouseX, mouseY, currentNodeId, graph) {
    const cur = graph.nodeMap[currentNodeId];
    const reachable = cur ? new Set(cur.next) : new Set();
    this._hoverId = null;
    for (const s of this._spheres) {
      if (!reachable.has(s.id)) continue;
      const dx = mouseX - s.x, dy = mouseY - s.y;
      if (dx * dx + dy * dy <= s.r * s.r) {
        this._hoverId = s.id;
        return s.id;
      }
    }
    return null;
  }

  // Click → returns advanced-to nodeId, or null
  hitTest(mouseX, mouseY, currentNodeId, graph) {
    const cur = graph.nodeMap[currentNodeId];
    if (!cur) return null;
    for (const s of this._spheres) {
      if (!cur.next.includes(s.id)) continue;
      const dx = mouseX - s.x, dy = mouseY - s.y;
      if (dx * dx + dy * dy <= s.r * s.r) return s.id;
    }
    return null;
  }

  draw(ctx, graph, currentNodeId) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const cur = graph.nodeMap[currentNodeId];
    const reachable = cur ? new Set(cur.next) : new Set();

    // Background gradient — dark camp ground feel
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, w, h);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, 'rgba(255,80,80,0.05)');
    bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Connection lines first
    ctx.lineWidth = 2;
    for (const a of this._spheres) {
      const node = graph.nodeMap[a.id];
      for (const nextId of node.next) {
        const b = this._spheres.find(s => s.id === nextId);
        if (!b) continue;
        const isOnPath = node.resolved && reachable.has(nextId);
        ctx.strokeStyle = isOnPath ? 'rgba(126,255,102,0.55)' : 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Nodes
    for (const s of this._spheres) {
      const node = graph.nodeMap[s.id];
      const isCurrent = s.id === currentNodeId;
      const isReachable = reachable.has(s.id);
      const isHovered = s.id === this._hoverId;
      const isPast = node.resolved && !isCurrent;
      const color = TYPE_COLOR[node.type] || PALETTE.uiText;

      // Halo for reachable / current
      if (isReachable || isCurrent) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + (isHovered ? 8 : 4), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = isHovered ? 0.22 : 0.12;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Body
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = isPast
        ? 'rgba(40,40,46,0.85)'
        : (isReachable || isCurrent ? color : 'rgba(60,60,70,0.5)');
      ctx.globalAlpha = isPast ? 0.6 : (isReachable || isCurrent ? 0.85 : 0.4);
      ctx.fill();
      ctx.strokeStyle = '#0a0a0c';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Glyph
      ctx.fillStyle = isPast ? PALETTE.uiDim : '#0a0a0c';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TYPE_GLYPH[node.type] || '?', s.x, s.y + 1);

      // Current marker
      if (isCurrent) {
        ctx.strokeStyle = PALETTE.uiAccent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.textBaseline = 'alphabetic';

    // Header
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('THE ROAD', 24, 32);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText(`reach the freedom zone · ${graph.maxLayers - 1} layers`, 24, 50);

    // Hover description (bottom-left)
    if (this._hoverId) {
      const n = graph.nodeMap[this._hoverId];
      ctx.fillStyle = TYPE_COLOR[n.type] || PALETTE.uiText;
      ctx.font = 'bold 14px monospace';
      ctx.fillText(TYPE_LABEL[n.type] || '???', 24, h - 36);
      ctx.fillStyle = PALETTE.uiText;
      ctx.font = '12px monospace';
      ctx.fillText(TYPE_DESC[n.type] || '', 24, h - 20);
    } else {
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '12px monospace';
      ctx.fillText('click a glowing node to advance', 24, h - 20);
    }
  }
}
