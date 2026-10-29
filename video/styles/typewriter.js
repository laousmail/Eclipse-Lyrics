/** Typewriter: characters appear sequentially. */

import { layoutText, fontString, positionY, alignX, applyTextCase, lyricSizePx, letterSpacingPx } from "../layout.js";

export function typewriter(ctx, opts) {
  const {
    text,
    translation,
    progress,
    width,
    height,
    colors,
    settings = {},
    reducedMotion = false,
  } = opts;

  const sizePx = lyricSizePx(settings, width, height);
  const lineHeight = Math.round(sizePx * 1.28);
  const maxW = width * ((Number(settings.maxWidthPct) || 82) / 100);
  const cx = alignX(width, settings.align || "center");
  const cy = positionY(height, settings.position || "center");
  const display = applyTextCase(text, settings.textCase);
  const inOut = Math.max(0.05, Math.min(0.4, Number(settings.inOutSpeed) || 0.15));

  const chars = Array.from(display);
  const reveal = reducedMotion ? 1 : Math.min(1, progress / Math.max(0.35, 1 - inOut));
  const shown = Math.floor(chars.length * reveal);
  const partial = chars.slice(0, shown).join("");

  ctx.save();
  ctx.textAlign = settings.align || "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.text;
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 18;
  ctx.font = fontString({
    font: settings.font,
    weight: settings.fontWeight || 600,
    sizePx,
  });
  if (settings.letterSpacing) ctx.letterSpacing = `${letterSpacingPx(settings, width, height)}px`;

  const layout = layoutText(ctx, partial || " ", maxW, lineHeight);
  const startY = cy - ((layout.lines.length - 1) * lineHeight) / 2;
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lineHeight);
  });

  // Cursor blink while typing
  if (!reducedMotion && reveal < 1 && shown < chars.length) {
    const last = layout.lines[layout.lines.length - 1] || "";
    const lastW = ctx.measureText(last).width;
    const cursorX =
      (settings.align || "center") === "left"
        ? cx + lastW + 4
        : (settings.align || "center") === "right"
          ? cx - 4
          : cx + lastW / 2 + 4;
    const cursorY = startY + (layout.lines.length - 1) * lineHeight;
    if (Math.floor(progress * 10) % 2 === 0) {
      ctx.fillRect(cursorX, cursorY - sizePx * 0.55, Math.max(2, sizePx * 0.06), sizePx * 1.05);
    }
  }

  if (translation && reveal > 0.85) {
    const fade = Math.min(1, (reveal - 0.85) / 0.15);
    ctx.globalAlpha = fade;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.translation;
    const trSize = Math.round(sizePx * 0.62);
    ctx.font = fontString({ font: settings.font, weight: 400, sizePx: trSize });
    const trLayout = layoutText(
      ctx,
      applyTextCase(translation, settings.textCase),
      maxW * 0.95,
      Math.round(trSize * 1.35)
    );
    const trStart =
      cy + sizePx * 1.45 - ((trLayout.lines.length - 1) * Math.round(trSize * 1.35)) / 2;
    trLayout.lines.forEach((line, i) => {
      ctx.fillText(line, cx, trStart + i * Math.round(trSize * 1.35));
    });
  }
  ctx.restore();
}
