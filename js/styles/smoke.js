/** Smoke: letters drift in with blur and settle into place. */

export function smoke(ctx, { text, translation, progress, width, height, colors }) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cx = width / 2;
  const cy = height * 0.55;
  const fontSize = Math.round(width * 0.035);
  const chars = Array.from(String(text));

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fontSize}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;

  const totalW = ctx.measureText(text).width;
  let x = cx - totalW / 2;

  chars.forEach((ch, i) => {
    const charDelay = chars.length > 1 ? i / (chars.length - 1) : 0;
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
    ctx.globalAlpha = alpha;
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = blur > 0 ? 18 : 12;
    if (blur > 0.5 && ctx.filter !== undefined) {
      ctx.filter = `blur(${blur}px)`;
    }
    ctx.fillStyle = colors.text;
    ctx.fillText(ch, x, cy + dy);
    ctx.restore();

    x += ctx.measureText(ch).width;
  });

  if (translation) {
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.min(1, progress * 1.4);
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.translation;
    ctx.font = `400 ${Math.round(width * 0.022)}px "Noto Sans", "Noto Sans Tifinagh", sans-serif`;
    ctx.fillText(translation, cx, cy + width * 0.05);
  }
  ctx.restore();
}
