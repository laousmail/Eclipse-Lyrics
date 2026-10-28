/** Shared canvas text layout + wrapping for lyric video styles. */

/**
 * @returns {{ lines: string[], widths: number[], totalHeight: number, maxWidth: number }}
 */
export function layoutText(ctx, text, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  if (!words.length && text) {
    lines.push(String(text));
  }
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  if (!lines.length) lines.push("");
  const widths = lines.map((line) => ctx.measureText(line).width);
  return {
    lines,
    widths,
    totalHeight: lines.length * lineHeight,
    maxWidth: widths.length ? Math.max(...widths) : 0,
  };
}

export function fillLayout(ctx, layout, x, y, lineHeight, { align = "center" } = {}) {
  const startY = y - ((layout.lines.length - 1) * lineHeight) / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = align;
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, x, startY + i * lineHeight);
  });
  ctx.textAlign = prevAlign;
  return startY;
}
