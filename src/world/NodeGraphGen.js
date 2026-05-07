// Branching node graph for the run map. Slay-the-Spire-style: rows of 1-3
// nodes connected forward. Pattern adapted from
// roguehero2/src/RunManager.js (lines 69-132). Wall-of-Dead node types:
//
//   start     — base camp / row 0 single node
//   combat    — survive the night (the bread-and-butter)
//   elite     — harder combat, better reward
//   scavenge  — minigame node, awards loot
//   event     — text-choice (M5+; placeholder for now)
//   shop      — spend scrap (M6)
//   boss      — final-night freedom-zone fight (last row)
//
// Layer widths shape the path forks. Last layer is always 1-wide (boss).

const LAYER_WIDTHS = [1, 2, 3, 2, 3, 2, 1, 1];

const TYPE_WEIGHTS_MID = [
  ['combat',   0.45],
  ['scavenge', 0.30],
  ['event',    0.10],
  ['shop',     0.10],
  ['elite',    0.05],
];

function pickWeighted(rng, weights) {
  const r = rng();
  let acc = 0;
  for (const [type, w] of weights) {
    acc += w;
    if (r < acc) return type;
  }
  return weights[weights.length - 1][0];
}

export function generateGraph(rng) {
  const layers = [];
  const nodeMap = {};
  const maxLayers = LAYER_WIDTHS.length;

  for (let i = 0; i < maxLayers; i++) {
    const w = LAYER_WIDTHS[i];
    const row = [];
    for (let j = 0; j < w; j++) {
      let type;
      if      (i === 0)              type = 'start';
      else if (i === maxLayers - 1)  type = 'boss';
      else if (i === maxLayers - 2)  type = 'scavenge';   // pre-boss restock
      else                           type = pickWeighted(rng, TYPE_WEIGHTS_MID);

      const id = `n${i}_${j}`;
      const node = {
        id, layer: i, index: j, type,
        next: [],
        resolved: false,
        xPos: w === 1 ? 0.5 : j / Math.max(1, w - 1),
      };
      row.push(node);
      nodeMap[id] = node;
    }
    layers.push(row);
  }

  // Connect each node to next-layer nodes within an x-distance window. Same
  // 0.6 threshold as roguehero2 — biases toward "natural" forward forks
  // without crisscrossing.
  for (let i = 0; i < maxLayers - 1; i++) {
    const cur = layers[i], nxt = layers[i + 1];
    for (const node of cur) {
      for (const nn of nxt) {
        if (Math.abs(node.xPos - nn.xPos) <= 0.6) node.next.push(nn.id);
      }
      if (node.next.length === 0) node.next.push(nxt[0].id);
    }
  }

  // Mark start as the current node and resolved.
  const startId = layers[0][0].id;
  nodeMap[startId].resolved = true;

  return {
    layers, nodeMap, maxLayers,
    startId,
    endId: layers[maxLayers - 1][0].id,
  };
}

export function nodesAdjacentTo(graph, nodeId) {
  const n = graph.nodeMap[nodeId];
  if (!n) return [];
  return n.next.map(id => graph.nodeMap[id]).filter(Boolean);
}

export function isReachable(graph, fromId, toId) {
  const n = graph.nodeMap[fromId];
  return !!(n && n.next.includes(toId));
}
