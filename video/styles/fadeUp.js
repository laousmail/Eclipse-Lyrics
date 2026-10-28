/** Fade up: line rises softly and fades in, then fades out. */

import { layoutText, fillLayout, fontString, positionY, alignX, applyTextCase } from "../layout.js";

export function fadeUp(ctx, opts) {
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

  const inOut = Math.max(0.05, Math.min(0.4, (Number(settings.inOutSpeed) || 0.15)));
  let opacity = 1;
  let yOffset = 0;

  if (!reducedMotion) {
    if (progress < inOut) {
      const t = progress / inOut;
      opacity = t;
      yOffset = (1 - t) * 28;
    } else if (progress > 1 - inOut) {
      const t = (progress - (1 - inOut)) / inOut;
      opacity = 1 - t;
      yOffset = -t * 12;
    }
  }

  const sizePx = settings.fontSize
    ? Number(settings.fontSize)
    : Math.round(width * 0.035);
  const maxW = width * ((Number(settings.maxWidthPct) || 82) / 100);
  const cx = alignX(width, settings.align || "center");
  const cy = positionY(height, settings.position || "center");
  const display = applyTextCase(text, settings.textCase);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.textAlign = settings.align || "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.text;
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 24;
  if (settings.letterSpacing) ctx.letterSpacing = `${settings.letterSpacing}px`;
  ctx.font = fontString({
    font: settings.font,
    weight: settings.fontWeight || 600,
    sizePx,
  });
  const main = layoutText(ctx, display, maxW, Math.round(sizePx * 1.28));
  fillLayout(ctx, main, cx, cy + yOffset, Math.round(sizePx * 1.28), {
    align: settings.align || "center",
  });

  if (translation) {
    ctx.shadowBlur = 12;
    ctx.fillStyle = colors.translation;
    const trSize = Math.round(sizePx * 0.62);
    ctx.font = fontString({
      font: settings.font,
      weight: 400,
      sizePx: trSize,
    });
    const tr = layoutText(ctx, applyTextCase(translation, settings.textCase), maxW * 0.95, Math.round(trSize * 1.35));
    fillLayout(ctx, tr, cx, cy + yOffset + sizePx * 1.45, Math.round(trSize * 1.35), {
      align: settings.align || "center",
    });
  }
  ctx.restore();
}
