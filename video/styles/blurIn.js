/** Blur in: text starts blurred and sharpens while fading in. */

import { layoutText, fillLayout, fontString, positionY, alignX, applyTextCase, lyricSizePx, letterSpacingPx } from "../layout.js";

export function blurIn(ctx, opts) {
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

  const inOut = Math.max(0.05, Math.min(0.4, Number(settings.inOutSpeed) || 0.15));
  let opacity = 1;
  let blur = 0;

  if (!reducedMotion) {
    if (progress < inOut) {
      const t = progress / inOut;
      opacity = t;
      blur = (1 - t) * 12;
    } else if (progress > 1 - inOut) {
      const t = (progress - (1 - inOut)) / inOut;
      opacity = 1 - t;
      blur = t * 6;
    }
  }

  const sizePx = lyricSizePx(settings, width, height);
  const maxW = width * ((Number(settings.maxWidthPct) || 82) / 100);
  const cx = alignX(width, settings.align || "center");
  const cy = positionY(height, settings.position || "center");
  const display = applyTextCase(text, settings.textCase);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  if (blur > 0.4 && ctx.filter !== undefined) ctx.filter = `blur(${blur}px)`;
  ctx.textAlign = settings.align || "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.text;
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 20 + blur;
  ctx.font = fontString({
    font: settings.font,
    weight: settings.fontWeight || 600,
    sizePx,
  });
  if (settings.letterSpacing) ctx.letterSpacing = `${letterSpacingPx(settings, width, height)}px`;

  const main = layoutText(ctx, display, maxW, Math.round(sizePx * 1.28));
  fillLayout(ctx, main, cx, cy, Math.round(sizePx * 1.28), {
    align: settings.align || "center",
  });

  if (translation) {
    ctx.filter = "none";
    ctx.shadowBlur = 10;
    ctx.fillStyle = colors.translation;
    const trSize = Math.round(sizePx * 0.62);
    ctx.font = fontString({ font: settings.font, weight: 400, sizePx: trSize });
    const tr = layoutText(
      ctx,
      applyTextCase(translation, settings.textCase),
      maxW * 0.95,
      Math.round(trSize * 1.35)
    );
    fillLayout(ctx, tr, cx, cy + sizePx * 1.45, Math.round(trSize * 1.35), {
      align: settings.align || "center",
    });
  }
  ctx.restore();
}
