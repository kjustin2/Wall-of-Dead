// Tiny canvas text helpers. Word-wrap and width-aware truncation. Used
// anywhere we render player-authored or variable-length copy that could
// overflow its container.

// Wrap `text` so each line fits inside `maxWidth` (in current ctx.font).
// Returns an array of strings — caller decides line spacing.
export function wrapText(ctx, text, maxWidth) {
  if (!text) return [''];
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const probe = cur ? cur + ' ' + word : word;
    if (ctx.measureText(probe).width <= maxWidth) {
      cur = probe;
    } else {
      if (cur) lines.push(cur);
      // Word itself is wider than the box — hard-break it.
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          const probe2 = chunk + ch;
          if (ctx.measureText(probe2).width <= maxWidth) {
            chunk = probe2;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        cur = chunk;
      } else {
        cur = word;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Render wrapped text inside a box. Returns the y-coord just below the
// last line so the caller can stack content underneath.
export function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = wrapText(ctx, text, maxWidth);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  return y + lines.length * lineHeight;
}
