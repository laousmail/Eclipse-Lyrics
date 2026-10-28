/** Smoke: letters drift in with blur and settle into place. */

import { layoutText, fillLayout } from "./layout.js";

export function smoke(ctx, { text, translation, progress, width, height, colors }) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cx = width / 2;
  const cy = height * 0.55;
  const fontSize = Math.round(width * 0.035);
  const lineHeight = Math.round(width * 0.045);
  const maxWidth = width * 0.82;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fontSize}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;

  const layout = layoutText(ctx, text, maxWidth, lineHeight);
  const startY = cy - ((layout.lines.length - 1) * lineHeight) / 2;

  // Per-character smoke within each wrapped row
  let charIndex = 0;
  const allChars = Array.from(String(text).replace(/\s+/g, " "));
  const totalChars = Math.max(1, allChars.length);

  layout.lines.forEach((line, row) => {
    const rowChars = Array.from(line);
    const rowW = ctx.measureText(line).width;
    let x = cx - rowW / 2;
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
      if (!reduced) {
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
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.min(1, progress * 1.4);
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.translation;
    ctx.font = `400 ${Math.round(width * 0.022)}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;
    const trLayout = layoutText(ctx, translation, width * 0.78, Math.round(width * 0.03));
    fillLayout(ctx, trLayout, cx, cy + width * 0.05 + (layout.lines.length - 1) * lineHeight * 0.35, Math.round(width * 0.03));
  }
  ctx.restore();
}
