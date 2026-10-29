/** Smoke: letters drift in with blur and settle into place. */

import { layoutText, fillLayout, fontString, positionY, alignX, applyTextCase, lyricSizePx, letterSpacingPx } from "../layout.js";

export function smoke(ctx, opts) {
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

  ctx.save();
  ctx.textAlign = settings.align || "center";
  ctx.textBaseline = "middle";
  ctx.font = fontString({
    font: settings.font,
    weight: settings.fontWeight || 600,
    sizePx,
  });
  if (settings.letterSpacing) ctx.letterSpacing = `${letterSpacingPx(settings, width, height)}px`;

  const layout = layoutText(ctx, display, maxW, lineHeight);
  const startY = cy - ((layout.lines.length - 1) * lineHeight) / 2;

  let charIndex = 0;
  const allChars = Array.from(display.replace(/\s+/g, " "));
  const totalChars = Math.max(1, allChars.length);

  layout.lines.forEach((line, row) => {
    const rowChars = Array.from(line);
    const rowW = ctx.measureText(line).width;
    let x =
      (settings.align || "center") === "left"
        ? cx
        : (settings.align || "center") === "right"
          ? cx - rowW
          : cx - rowW / 2;
    const y = startY + row * lineHeight;
    rowChars.forEach((ch) => {
      const i = charIndex;
      charIndex += 1;
      const charDelay = totalChars > 1 ? i / (totalChars - 1) : 0;
      const local = Math.max(0, Math.min(1, (progress - charDelay * 0.35) / 0.45));
      const ease = 1 - Math.pow(1 - local, 3);

      let blur = 0;
      let dy = 0;
      let alpha = 1;
      if (!reducedMotion) {
        blur = (1 - ease) * 8;
        dy = (1 - ease) * -22;
        alpha = 0.15 + ease * 0.85;
      }

      ctx.save();
      ctx.textAlign = "left";
      ctx.globalAlpha = alpha;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = blur > 0 ? 18 : 12;
      if (blur > 0.5 && ctx.filter !== undefined) {
        ctx.filter = `blur(${blur}px)`;
      }
      ctx.fillStyle = colors.text;
      ctx.fillText(ch, x, y + dy);
      ctx.restore();

      x += ctx.measureText(ch).width;
    });
  });

  if (translation) {
    ctx.textAlign = settings.align || "center";
    ctx.globalAlpha = Math.min(1, progress * 1.4);
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
    fillLayout(
      ctx,
      trLayout,
      cx,
      cy + sizePx * 1.45 + (layout.lines.length - 1) * lineHeight * 0.35,
      Math.round(trSize * 1.35),
      { align: settings.align || "center" }
    );
  }
  ctx.restore();
}
