/** Glow sweep: warm orange glow sweeps across the line as it's sung. */

export function glowSweep(ctx, { text, translation, progress, width, height, colors }) {
  const cx = width / 2;
  const cy = height * 0.55;
  const fontSize = Math.round(width * 0.035);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fontSize}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;

  // Base muted text
  ctx.fillStyle = "rgba(244,235,230,0.35)";
  wrapFillText(ctx, text, cx, cy, width * 0.82, Math.round(width * 0.045));

  // Sweep mask
  const sweepX = width * (0.1 + progress * 0.8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sweepX, height);
  ctx.clip();

  ctx.fillStyle = colors.text;
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 36;
  wrapFillText(ctx, text, cx, cy, width * 0.82, Math.round(width * 0.045));
  ctx.restore();

  // Glow edge
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced) {
    const grad = ctx.createLinearGradient(sweepX - 40, 0, sweepX + 40, 0);
    grad.addColorStop(0, "rgba(255,107,53,0)");
    grad.addColorStop(0.5, "rgba(255,107,53,0.55)");
    grad.addColorStop(1, "rgba(255,107,53,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(sweepX - 40, cy - fontSize * 1.4, 80, fontSize * 2.8);
  }

  if (translation) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = colors.translation;
    ctx.globalAlpha = 0.4 + progress * 0.6;
    ctx.font = `400 ${Math.round(width * 0.022)}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;
    wrapFillText(ctx, translation, cx, cy + width * 0.05, width * 0.78, Math.round(width * 0.03));
  }
  ctx.restore();
}

function wrapFillText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
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
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
}
