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
// last line so the caller can stack content underneath. If `maxLines` is
// provided and the text wraps to more lines than that, the last drawn line
// is truncated with an ellipsis so content can't bleed past its container.
export function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  let lines = wrapText(ctx, text, maxWidth);
  if (maxLines != null && lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines);
    let last = trimmed[trimmed.length - 1];
    while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
      last = last.slice(0, -1);
    }
    trimmed[trimmed.length - 1] = last + '…';
    lines = trimmed;
  }
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  return y + lines.length * lineHeight;
}

// Truncate `text` so it fits in `maxWidth` at the current font, suffixing
// with an ellipsis when it doesn't. Useful for single-line UI labels where
// wrapping isn't appropriate (e.g., HUD weapon name, inventory list).
export function truncateToWidth(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = String(text);
  while (s.length > 0 && ctx.measureText(s + '…').width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + '…';
}
