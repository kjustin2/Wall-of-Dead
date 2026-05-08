// MapUI — the "apocalypse road" navigator.
//
// The graph data (layers, nodes, next-arrays, resolvedIds) is unchanged
// from NodeGraphGen.js — only the *rendering* is rebuilt. Layer 0 sits
// at the bottom of the screen (past); each layer above represents a step
// further along the road; the boss layer is at the top of the screen.
//
// Each unresolved location renders as a roadside vignette (signpost +
// lantern + per-type icon) instead of an arcade graph node. Forks split
// the road around debris. The current node carries a hooded player token.
//
// API is preserved so MapScene needs minimal changes:
//   layout(graph, w, h)
//   updateHover(mx, my, currentNodeId, graph) -> hovered id | null
//   hitTest(mx, my, currentNodeId, graph)     -> clicked id | null
//   draw(ctx, graph, currentNodeId)

import { PALETTE } from '../Config.js';

// Per-type display metadata. Names are evocative roadside-location labels;
// icons are small canvas glyphs drawn alongside each signpost.
const TYPE_LABEL = {
  start:    'BASE CAMP',
  combat:   'BARRICADE',
  elite:    'BLOCKADE',
  scavenge: 'WRECKAGE',
  event:    'STRANGER',
  shop:     'TRADER',
  boss:     'FREEDOM ZONE',
};

const TYPE_BLURB = {
  combat:   'a thrown-up barricade. things shift behind it.',
  elite:    'heavier opposition. better leavings, if you live.',
  scavenge: 'cars left where they stopped. dig through them.',
  event:    'someone is alive. that is not the same as safe.',
  shop:     'a lit window. a hand inside that takes scrap.',
  boss:     'where the road ends. or where you do.',
};

const TYPE_COLOR = {
  start:    '#cdd6c0',
  combat:   '#ff7755',
  elite:    '#ff5544',
  scavenge: '#a8e066',
  event:    '#9ad0ff',
  shop:     'rgb(255,170,55)',
  boss:     '#ff3344',
};

// Pool of authored location names — picked deterministically per node id
// so a given run keeps the same names across resume/redraw. Each pool
// keys off the node type so the names match the iconography.
const LOCATION_NAMES = {
  combat:   ['THE OVERPASS', 'GAS STATION', 'DUSTBOWL CROSSING', 'OLD MILE 47', 'DEAD CHAPEL', 'WEST RAIL', 'GREYWATER BRIDGE'],
  elite:    ['BLOOD JUNCTION', 'THE SLAUGHTER YARD', 'BLACK PINE PASS', 'NORTH GATE'],
  scavenge: ['ABANDONED LOT', 'PILEUP', 'TOWED ROW', 'ROADSIDE STORE', 'CRASHED CONVOY'],
  event:    ['HITCHHIKER', 'CAMP FIRE', 'LONE FIGURE', 'WAVING SURVIVOR', 'ABANDONED BAG'],
  shop:     ['THE TRADER\'S WAGON', 'KEROSENE STAND', 'THE LIT WINDOW', 'BLACK MARKET TENT'],
  boss:     ['THE FREEDOM ZONE'],
  start:    ['CAMP'],
};

function pickName(typeKey, seed) {
  const pool = LOCATION_NAMES[typeKey] || ['UNKNOWN'];
  // FNV-ish hash of the node id keeps the same name across re-renders.
  let h = 2166136261 >>> 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return pool[h % pool.length];
}

export class MapUI {
  constructor() {
    this._slots = [];        // { id, x, y, r, type, name, blurb }
    this._hoverId = null;
    this._bgGrad = null;
    this._bgGradKey = null;
    this._silhouettes = null;
    this._silhouettesW = 0;
  }

  // Lays out road slots top-to-bottom: boss at top, start at bottom.
  // x is jittered around the column-center based on node.xPos so forks
  // visually split. r is large enough to be a comfortable click target.
  layout(graph, w, h) {
    const padTop = 120, padBot = 120, padX = 140;
    const layerCount = Math.max(1, graph.maxLayers);
    const layerSpan = (h - padTop - padBot) / Math.max(1, layerCount - 1);
    const colW = w - padX * 2;
    this._slots.length = 0;

    for (let i = 0; i < layerCount; i++) {
      const row = graph.layers[i];
      // Top = boss layer; bottom = start. Player walks "into the screen".
      const yPos = padTop + (layerCount - 1 - i) * layerSpan;
      for (let j = 0; j < row.length; j++) {
        const node = row[j];
        const x = (row.length === 1)
          ? w / 2
          : padX + (node.xPos != null ? node.xPos : (j + 0.5) / row.length) * colW;
        this._slots.push({
          id: node.id,
          x, y: yPos, r: 28,
          type: node.type,
          name: pickName(node.type, node.id),
          blurb: TYPE_BLURB[node.type] || '',
        });
      }
    }
  }

  updateHover(mouseX, mouseY, currentNodeId, graph) {
    const cur = graph.nodeMap[currentNodeId];
    const reachable = cur ? new Set(cur.next) : new Set();
    this._hoverId = null;
    for (const s of this._slots) {
      if (!reachable.has(s.id)) continue;
      const dx = mouseX - s.x, dy = mouseY - s.y;
      // Lantern hit-radius is generous so signposts feel clickable.
      if (dx * dx + dy * dy <= (s.r + 8) * (s.r + 8)) {
        this._hoverId = s.id;
        return s.id;
      }
    }
    return null;
  }

  hitTest(mouseX, mouseY, currentNodeId, graph) {
    const cur = graph.nodeMap[currentNodeId];
    if (!cur) return null;
    for (const s of this._slots) {
      if (!cur.next.includes(s.id)) continue;
      const dx = mouseX - s.x, dy = mouseY - s.y;
      if (dx * dx + dy * dy <= (s.r + 8) * (s.r + 8)) return s.id;
    }
    return null;
  }

  draw(ctx, graph, currentNodeId) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const cur = graph.nodeMap[currentNodeId];
    const reachable = cur ? new Set(cur.next) : new Set();
    const nightFrac = (graph.maxLayers > 1)
      ? (1 - (cur ? cur.layer / (graph.maxLayers - 1) : 0))
      : 0;

    this._drawSky(ctx, w, h, nightFrac);
    this._drawSilhouettes(ctx, w, h);
    this._drawFog(ctx, w, h);
    this._drawRoad(ctx, w, h, graph, currentNodeId, reachable);

    // Locations on the road
    for (const s of this._slots) {
      const node = graph.nodeMap[s.id];
      const isCurrent  = s.id === currentNodeId;
      const isReachable = reachable.has(s.id);
      const isHovered  = s.id === this._hoverId;
      const isPast     = node.resolved && !isCurrent;
      this._drawLocation(ctx, s, node, { isCurrent, isReachable, isHovered, isPast });
    }

    // Player token over the current node
    if (cur) {
      const cs = this._slots.find(s => s.id === currentNodeId);
      if (cs) this._drawPlayerToken(ctx, cs.x, cs.y - 8);
    }

    this._drawHeader(ctx, w, h, cur, graph);
    this._drawHover(ctx, w, h, graph);
  }

  // ── pieces ────────────────────────────────────────────────────────────

  _drawSky(ctx, w, h, nightFrac) {
    const key = `${w}x${h}@${nightFrac.toFixed(2)}`;
    if (key !== this._bgGradKey) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      // Top = night sky deepening; bottom = ember-glow horizon. As the
      // player nears the boss, both ends darken and redden.
      const r = 0.22 + nightFrac * 0.4;
      g.addColorStop(0, `rgba(${Math.floor(20 + r * 30)},${Math.floor(8 + r * 14)},${Math.floor(14 + r * 18)},1)`);
      g.addColorStop(0.55, `rgba(${Math.floor(40 + r * 50)},${Math.floor(14 + r * 18)},${Math.floor(20 + r * 22)},1)`);
      g.addColorStop(0.85, `rgba(${Math.floor(70 + r * 60)},${Math.floor(22 + r * 18)},${Math.floor(20 + r * 14)},1)`);
      g.addColorStop(1,    `rgba(${Math.floor(28 + r * 10)},${Math.floor(8  + r * 6)},${Math.floor(10 + r * 6)},1)`);
      this._bgGrad = g;
      this._bgGradKey = key;
    }
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  _drawSilhouettes(ctx, w, h) {
    // Cached silhouettes — random skyline of burnt buildings + dead trees.
    if (!this._silhouettes || this._silhouettesW !== w) {
      const off = document.createElement('canvas');
      off.width = w; off.height = 200;
      const o = off.getContext('2d');
      o.fillStyle = 'rgba(0,0,0,0.85)';
      let x = 0;
      while (x < w) {
        const isTree = Math.random() < 0.25;
        if (isTree) {
          const tx = x + 8;
          const ty = 200;
          o.fillRect(tx, ty - 50 - Math.random() * 30, 2, 60 + Math.random() * 30);
          // Branches
          for (let b = 0; b < 3; b++) {
            o.fillRect(tx - 6 - Math.random() * 4, ty - 70 + b * 8, 14, 1.5);
          }
          x += 20 + Math.random() * 30;
        } else {
          const bw = 30 + Math.random() * 80;
          const bh = 40 + Math.random() * 80;
          o.fillRect(x, 200 - bh, bw, bh);
          // Window holes
          if (Math.random() < 0.4) {
            o.clearRect(x + 6 + Math.random() * (bw - 18), 200 - bh + 12, 4, 6);
          }
          x += bw + 4 + Math.random() * 20;
        }
      }
      // Far radio tower
      const tx2 = w * 0.78;
      o.fillStyle = 'rgba(0,0,0,0.7)';
      o.fillRect(tx2, 80, 1.5, 120);
      o.fillRect(tx2 - 8, 100, 18, 1);
      o.fillRect(tx2 - 6, 120, 14, 1);
      o.fillRect(tx2 - 10, 90, 22, 1);
      this._silhouettes = off;
      this._silhouettesW = w;
    }
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this._silhouettes, 0, h * 0.32);
    ctx.globalAlpha = 1;
  }

  _drawFog(ctx, w, h) {
    // Drifting fog band — animated by performance.now() so it never sits
    // still. Cheap: two big translucent rectangles with a sin offset.
    const t = performance.now() * 0.00006;
    const yMid = h * 0.55;
    ctx.fillStyle = `rgba(60,40,40,${0.18 + 0.04 * Math.sin(t * 6)})`;
    ctx.fillRect(0, yMid, w, 80);
    ctx.fillStyle = `rgba(80,55,55,${0.10 + 0.03 * Math.sin(t * 4 + 1.7)})`;
    ctx.fillRect(0, yMid + 30, w, 60);
  }

  _drawRoad(ctx, w, h, graph, currentNodeId, reachable) {
    // Find the lowest (start-ish) and highest (boss) y in the slot list to
    // span the road across the full play surface.
    let minY = Infinity, maxY = -Infinity;
    for (const s of this._slots) {
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    if (!isFinite(minY)) return;

    // Trunk: a wide tapering road — narrow at top (far), wide at bottom.
    const cx = w / 2;
    const farW = 60;
    const nearW = 220;
    ctx.fillStyle = 'rgba(28,18,14,0.92)';
    ctx.beginPath();
    ctx.moveTo(cx - farW / 2,  minY - 30);
    ctx.lineTo(cx + farW / 2,  minY - 30);
    ctx.lineTo(cx + nearW / 2, maxY + 60);
    ctx.lineTo(cx - nearW / 2, maxY + 60);
    ctx.closePath();
    ctx.fill();
    // Edge lines (ragged)
    ctx.strokeStyle = 'rgba(180,140,80,0.18)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(cx - farW / 2,  minY - 30);
    ctx.lineTo(cx - nearW / 2, maxY + 60);
    ctx.moveTo(cx + farW / 2,  minY - 30);
    ctx.lineTo(cx + nearW / 2, maxY + 60);
    ctx.stroke();
    ctx.setLineDash([]);
    // Broken yellow centerline
    ctx.strokeStyle = 'rgba(220,160,60,0.32)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 22]);
    ctx.beginPath();
    ctx.moveTo(cx, minY - 30);
    ctx.lineTo(cx, maxY + 60);
    ctx.stroke();
    ctx.setLineDash([]);

    // Branch path lines: each connection from a slot to its `next` slots
    // draws a thin road branch. Forks are visually meaningful — different
    // x-offsets create the impression of the road splitting.
    for (const a of this._slots) {
      const node = graph.nodeMap[a.id];
      for (const nextId of node.next) {
        const b = this._slots.find(s => s.id === nextId);
        if (!b) continue;
        const isOnPath = node.resolved && reachable.has(nextId);
        const reachableFromCurrent = a.id === currentNodeId && reachable.has(nextId);
        ctx.strokeStyle = reachableFromCurrent
          ? 'rgba(255,200,90,0.55)'
          : isOnPath ? 'rgba(120,200,90,0.30)' : 'rgba(120,90,70,0.18)';
        ctx.lineWidth = reachableFromCurrent ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - 4);
        // Slight curve via a control point — keeps branches from looking
        // like rubber bands.
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - 6;
        ctx.quadraticCurveTo(mx, my, b.x, b.y + 4);
        ctx.stroke();
      }
    }
  }

  _drawLocation(ctx, s, node, st) {
    const color = TYPE_COLOR[s.type] || PALETTE.uiText;
    const reachableOrCurrent = st.isCurrent || st.isReachable;
    const lanternOn = reachableOrCurrent && !st.isPast;

    // Halo for hovered
    if (st.isHovered) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r + 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(s.x, s.y);

    // Signpost (small leaning post + sign board)
    const leanPx = (((s.id || '').charCodeAt(0) || 0) % 5) - 2;
    ctx.save();
    ctx.rotate(leanPx * 0.04);
    ctx.fillStyle = st.isPast ? '#3a2a20' : '#5a4030';
    ctx.fillRect(-1.5, -22, 3, 22);
    // Sign board
    ctx.fillStyle = st.isPast ? 'rgba(60,50,40,0.9)' : 'rgba(80,60,42,0.95)';
    ctx.fillRect(-22, -28, 44, 12);
    ctx.strokeStyle = st.isPast ? 'rgba(120,90,60,0.4)' : 'rgba(180,140,80,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-22, -28, 44, 12);
    ctx.restore();

    // Lantern: glow circle + core
    if (lanternOn) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -8, s.r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(0, -8, s.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Type-specific icon at the lantern (drawn over glow)
    this._drawTypeIcon(ctx, s.type, st);

    // Sign label — small ALL-CAPS over the sign board
    ctx.fillStyle = st.isPast ? PALETTE.uiDim
                  : (reachableOrCurrent ? PALETTE.uiText : PALETTE.uiDim);
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.name, 0, -19);

    // Current marker ring
    if (st.isCurrent) {
      ctx.strokeStyle = PALETTE.uiAccent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, -2, s.r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  _drawTypeIcon(ctx, type, st) {
    const dim = st.isPast ? 0.4 : 1;
    ctx.globalAlpha = dim;
    ctx.fillStyle = TYPE_COLOR[type] || PALETTE.uiText;
    ctx.strokeStyle = '#0a0a0c';
    ctx.lineWidth = 1.5;

    switch (type) {
      case 'combat':
        // Crossed barricade planks
        ctx.save();
        ctx.translate(0, -8);
        ctx.fillStyle = '#221816';
        ctx.fillRect(-12, -2, 24, 4);
        ctx.fillRect(-2, -12, 4, 24);
        ctx.strokeStyle = TYPE_COLOR.combat;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-12, -10); ctx.lineTo(12, 10);
        ctx.moveTo(12, -10);  ctx.lineTo(-12, 10);
        ctx.stroke();
        ctx.restore();
        break;
      case 'elite':
        // Burning fire pit
        ctx.fillStyle = '#1a1010';
        ctx.fillRect(-12, -2, 24, 6);
        ctx.fillStyle = TYPE_COLOR.elite;
        ctx.beginPath();
        ctx.moveTo(-8, -2);
        ctx.quadraticCurveTo(-4, -16, 0, -8);
        ctx.quadraticCurveTo(2, -18, 6, -10);
        ctx.quadraticCurveTo(10, -16, 8, -2);
        ctx.closePath();
        ctx.fill();
        break;
      case 'scavenge':
        // Truck silhouette
        ctx.fillStyle = '#2a2218';
        ctx.fillRect(-12, -2, 22, 8);
        ctx.fillRect(-12, -8, 12, 6);
        ctx.fillStyle = TYPE_COLOR.scavenge;
        ctx.beginPath();
        ctx.arc(-7, 6, 2.5, 0, Math.PI * 2);
        ctx.arc(6, 6, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'event':
        // Cloaked figure
        ctx.fillStyle = '#1a1418';
        ctx.beginPath();
        ctx.moveTo(-7, 6);
        ctx.lineTo(0, -10);
        ctx.lineTo(7, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = TYPE_COLOR.event;
        ctx.beginPath();
        ctx.arc(0, -10, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'shop':
        // Lit window
        ctx.fillStyle = '#1c1410';
        ctx.fillRect(-9, -10, 18, 14);
        ctx.fillStyle = TYPE_COLOR.shop;
        ctx.fillRect(-7, -8, 14, 10);
        ctx.fillStyle = '#1c1410';
        ctx.fillRect(-1, -8, 2, 10);
        ctx.fillRect(-7, -2, 14, 1);
        break;
      case 'boss':
        // Looming gate
        ctx.fillStyle = '#1a0a0e';
        ctx.fillRect(-14, -16, 28, 22);
        ctx.fillStyle = TYPE_COLOR.boss;
        ctx.fillRect(-2, -14, 4, 14);
        ctx.fillRect(-10, -16, 20, 2);
        break;
      case 'start':
      default:
        ctx.fillStyle = TYPE_COLOR.start;
        ctx.beginPath();
        ctx.arc(0, -8, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.globalAlpha = 1;
  }

  _drawPlayerToken(ctx, x, y) {
    // Hooded silhouette — a dark drop with a pale face strip.
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 9, 3, 0, 0, Math.PI * 2);     // shadow
    ctx.fill();
    ctx.fillStyle = '#1a1a1c';
    ctx.beginPath();
    ctx.moveTo(-7, 12);
    ctx.lineTo(0, -10);
    ctx.lineTo(7, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cdd6c0';
    ctx.fillRect(-2, -3, 4, 1.5);                     // thin face strip
    ctx.restore();
  }

  _drawHeader(ctx, w, h, cur, graph) {
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('THE ROAD', 24, 36);
    ctx.fillStyle = PALETTE.uiDim;
    ctx.font = '11px monospace';
    if (cur) {
      const layer = cur.layer + 1;
      ctx.fillText(`stage ${layer} / ${graph.maxLayers}  ·  pick the next path`, 24, 54);
    } else {
      ctx.fillText('the freedom zone is somewhere ahead', 24, 54);
    }
  }

  _drawHover(ctx, w, h, graph) {
    if (this._hoverId) {
      const s = this._slots.find(x => x.id === this._hoverId);
      if (!s) return;
      ctx.fillStyle = TYPE_COLOR[s.type] || PALETTE.uiText;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${TYPE_LABEL[s.type] || '???'}  ·  ${s.name}`, 24, h - 36);
      ctx.fillStyle = PALETTE.uiText;
      ctx.font = '12px monospace';
      ctx.fillText(s.blurb, 24, h - 18);
    } else {
      ctx.fillStyle = PALETTE.uiDim;
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('click a glowing roadside location to walk to it', 24, h - 18);
    }
  }
}
