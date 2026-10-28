/** Glow sweep: warm orange glow sweeps across each text row. */

import { layoutText, fontString, positionY, alignX, applyTextCase } from "../layout.js";

export function glowSweep(ctx, opts) {
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

  const sizePx = settings.fontSize
    ? Number(settings.fontSize)
    : Math.round(width * 0.035);
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
  if (settings.letterSpacing) ctx.letterSpacing = `${settings.letterSpacing}px`;

  const layout = layoutText(ctx, display, maxW, lineHeight);
  const startY = cy - ((layout.lines.length - 1) * lineHeight) / 2;
  const rowCount = Math.max(1, layout.lines.length);

  ctx.fillStyle = "rgba(244,235,230,0.35)";
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lineHeight);
  });

  layout.lines.forEach((line, i) => {
    const rowProgress = Math.max(0, Math.min(1, progress * rowCount - i));
    if (rowProgress <= 0) return;
    const rowW = layout.widths[i] || ctx.measureText(line).width;
    const left =
      (settings.align || "center") === "left"
        ? cx
        : (settings.align || "center") === "right"
          ? cx - rowW
          : cx - rowW / 2;
    const sweepX = left + rowW * rowProgress;
    const y = startY + i * lineHeight;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left - 4, y - lineHeight * 0.7, Math.max(0, sweepX - left + 4), lineHeight * 1.4);
    ctx.clip();
    ctx.fillStyle = colors.text;
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 36;
    ctx.fillText(line, cx, y);
    ctx.restore();

    if (!reducedMotion && rowProgress > 0 && rowProgress < 1) {
      const grad = ctx.createLinearGradient(sweepX - 40, 0, sweepX + 40, 0);
      grad.addColorStop(0, "rgba(255,107,53,0)");
      grad.addColorStop(0.5, "rgba(255,107,53,0.55)");
      grad.addColorStop(1, "rgba(255,107,53,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(sweepX - 40, y - sizePx * 1.1, 80, sizePx * 2.2);
    }
  });

  if (translation) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = colors.translation;
    ctx.globalAlpha = 0.4 + progress * 0.6;
    const trSize = Math.round(sizePx * 0.62);
    ctx.font = fontString({ font: settings.font, weight: 400, sizePx: trSize });
    const trLayout = layoutText(ctx, applyTextCase(translation, settings.textCase), maxW * 0.95, Math.round(trSize * 1.35));
    const trStart =
      cy + sizePx * 1.45 - ((trLayout.lines.length - 1) * Math.round(trSize * 1.35)) / 2;
    trLayout.lines.forEach((line, i) => {
      ctx.fillText(line, cx, trStart + i * Math.round(trSize * 1.35));
    });
  }
  ctx.restore();
}
