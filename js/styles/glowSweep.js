/** Glow sweep: warm orange glow sweeps across each text row as it's sung. */

import { layoutText } from "./layout.js";

export function glowSweep(ctx, { text, translation, progress, width, height, colors }) {
  const cx = width / 2;
  const cy = height * 0.55;
  const fontSize = Math.round(width * 0.035);
  const lineHeight = Math.round(width * 0.045);
  const maxWidth = width * 0.82;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fontSize}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;

  const layout = layoutText(ctx, text, maxWidth, lineHeight);
  const startY = cy - ((layout.lines.length - 1) * lineHeight) / 2;
  const rowCount = Math.max(1, layout.lines.length);

  // Base muted text (all rows)
  ctx.fillStyle = "rgba(244,235,230,0.35)";
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lineHeight);
  });

  // Sweep row-by-row in reading order, using measured row widths
  layout.lines.forEach((line, i) => {
    const rowProgress = Math.max(0, Math.min(1, progress * rowCount - i));
    if (rowProgress <= 0) return;
    const rowW = layout.widths[i] || ctx.measureText(line).width;
    const left = cx - rowW / 2;
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

    if (!reduced && rowProgress > 0 && rowProgress < 1) {
      const grad = ctx.createLinearGradient(sweepX - 40, 0, sweepX + 40, 0);
      grad.addColorStop(0, "rgba(255,107,53,0)");
      grad.addColorStop(0.5, "rgba(255,107,53,0.55)");
      grad.addColorStop(1, "rgba(255,107,53,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(sweepX - 40, y - fontSize * 1.1, 80, fontSize * 2.2);
    }
  });

  if (translation) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = colors.translation;
    ctx.globalAlpha = 0.4 + progress * 0.6;
    ctx.font = `400 ${Math.round(width * 0.022)}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;
    const trLayout = layoutText(ctx, translation, width * 0.78, Math.round(width * 0.03));
    const trStart = cy + width * 0.05 - ((trLayout.lines.length - 1) * Math.round(width * 0.03)) / 2;
    trLayout.lines.forEach((line, i) => {
      ctx.fillText(line, cx, trStart + i * Math.round(width * 0.03));
    });
  }
  ctx.restore();
}
