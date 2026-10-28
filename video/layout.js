/** Shared canvas text layout + wrapping for lyric video styles (pure). */

/**
 * @param {{ measureText: (t: string) => { width: number } }} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @returns {{ lines: string[], widths: number[], totalHeight: number, maxWidth: number }}
 */
export function layoutText(ctx, text, maxWidth, lineHeight) {
  const raw = String(text ?? "");
  const words = raw.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  if (!words.length && raw) {
    lines.push(raw);
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

/**
 * Draw a layout centered (or aligned) around (x, y).
 * @returns {number} startY of first line
 */
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

/** Apply text case transform from settings. */
export function applyTextCase(text, textCase) {
  const s = String(text ?? "");
  if (textCase === "upper") return s.toUpperCase();
  if (textCase === "lower") return s.toLowerCase();
  if (textCase === "title") {
    return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return s;
}

/**
 * Resolve canvas font string with Kabyle + Tifinagh fallbacks.
 * @param {{ font?: string, weight?: string|number, sizePx: number }} opts
 */
export function fontString({ font = "Noto Sans", weight = 600, sizePx }) {
  const family = `"${font}", "Noto Sans", "Noto Sans Tifinagh", sans-serif`;
  return `${weight} ${Math.round(sizePx)}px ${family}`;
}

/** Vertical anchor Y from position thirds. */
export function positionY(height, position = "center") {
  if (position === "top") return height * 0.28;
  if (position === "bottom") return height * 0.72;
  return height * 0.55;
}

/** Horizontal X from alignment. */
export function alignX(width, align = "center") {
  if (align === "left") return width * 0.1;
  if (align === "right") return width * 0.9;
  return width / 2;
}
