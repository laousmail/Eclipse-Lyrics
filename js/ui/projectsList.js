/** Projects home list rendering. */

import { formatMs, progressTimed } from "../sync.js";

function formatEdited(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

function formatDur(ms) {
  if (!ms) return "—:—";
  return formatMs(ms);
}

function drawThumb(canvas, thumb) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0608";
  ctx.fillRect(0, 0, w, h);
  const data = Array.isArray(thumb) && thumb.length ? thumb : Array.from({ length: 32 }, () => 0.15);
  const mid = h / 2;
  const barW = w / data.length;
  for (let i = 0; i < data.length; i++) {
    const amp = Math.max(1, data[i] * mid * 1.6);
    ctx.fillStyle = "rgba(255,106,19,0.75)";
    ctx.fillRect(i * barW, mid - amp, Math.max(1, barW * 0.7), amp * 2);
  }
}

/**
 * @param {HTMLElement} listEl
 * @param {{ projects: object[], onOpen, onDuplicate, onRename, onDelete, onExport }} handlers
 */
export function renderProjectsList(listEl, emptyEl, { projects, onOpen, onDuplicate, onRename, onDelete, onExport }) {
  if (!listEl) return;
  listEl.replaceChildren();
  const rows = projects || [];
  if (emptyEl) emptyEl.hidden = rows.length > 0;

  rows.forEach((p) => {
    const { timed, total } = progressTimed(p.lines || []);
    const li = document.createElement("li");
    li.className = "project-card";
    li.dataset.id = p.id;
    li.innerHTML = `
      <canvas class="project-thumb" width="96" height="36" aria-hidden="true"></canvas>
      <div class="project-meta">
        <p class="project-title"></p>
        <p class="project-sub muted"></p>
        <p class="project-progress"></p>
      </div>
      <div class="project-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-act="open"></button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="more" aria-haspopup="true">⋯</button>
      </div>
      <div class="project-menu" hidden>
        <button type="button" data-act="duplicate"></button>
        <button type="button" data-act="rename"></button>
        <button type="button" data-act="export"></button>
        <button type="button" data-act="delete"></button>
      </div>`;
    li.querySelector(".project-title").textContent = p.title || p.audio?.fileName || "Untitled";
    li.querySelector(".project-sub").textContent = [
      p.artist || "",
      formatDur(p.audio?.durationMs || 0),
      formatEdited(p.updatedAt),
    ]
      .filter(Boolean)
      .join(" · ");
    li.querySelector(".project-progress").textContent = `${timed} / ${total}`;
    li.querySelector('[data-act="open"]').textContent = "Open";
    li.querySelector('[data-act="duplicate"]').textContent = "Duplicate";
    li.querySelector('[data-act="rename"]').textContent = "Rename";
    li.querySelector('[data-act="export"]').textContent = "Export file";
    li.querySelector('[data-act="delete"]').textContent = "Delete";
    drawThumb(li.querySelector(".project-thumb"), p.audio?.waveformThumb);

    li.querySelector('[data-act="open"]').addEventListener("click", () => onOpen?.(p));
    li.querySelector(".project-meta").addEventListener("click", () => onOpen?.(p));
    const menu = li.querySelector(".project-menu");
    li.querySelector('[data-act="more"]').addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    li.querySelector('[data-act="duplicate"]').addEventListener("click", () => {
      menu.hidden = true;
      onDuplicate?.(p);
    });
    li.querySelector('[data-act="rename"]').addEventListener("click", () => {
      menu.hidden = true;
      onRename?.(p);
    });
    li.querySelector('[data-act="export"]').addEventListener("click", () => {
      menu.hidden = true;
      onExport?.(p);
    });
    li.querySelector('[data-act="delete"]').addEventListener("click", () => {
      menu.hidden = true;
      onDelete?.(p);
    });
    listEl.appendChild(li);
  });
}
