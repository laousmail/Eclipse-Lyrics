/** Fade up: line rises softly and fades in, then fades out. */

import { layoutText, fillLayout } from "./layout.js";

export function fadeUp(ctx, { text, translation, progress, width, height, colors }) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let opacity = 1;
  let yOffset = 0;

  if (!reduced) {
    if (progress < 0.15) {
      const t = progress / 0.15;
      opacity = t;
      yOffset = (1 - t) * 28;
    } else if (progress > 0.85) {
      const t = (progress - 0.85) / 0.15;
      opacity = 1 - t;
      yOffset = -t * 12;
    }
  }

  const cx = width / 2;
  const cy = height * 0.55;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.text;
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 24;
  ctx.font = `600 ${Math.round(width * 0.035)}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;
  const main = layoutText(ctx, text, width * 0.82, Math.round(width * 0.045));
  fillLayout(ctx, main, cx, cy + yOffset, Math.round(width * 0.045));

  if (translation) {
    ctx.shadowBlur = 12;
    ctx.fillStyle = colors.translation;
    ctx.font = `400 ${Math.round(width * 0.022)}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;
    const tr = layoutText(ctx, translation, width * 0.78, Math.round(width * 0.03));
    fillLayout(ctx, tr, cx, cy + yOffset + width * 0.05, Math.round(width * 0.03));
  }
  ctx.restore();
}
