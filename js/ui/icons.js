/** Inline Lucide-style SVG icons (MIT). */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.75",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};

function svg(paths, { size = 20, className = "icon" } = {}) {
  const attrs = Object.entries(STROKE)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" ${attrs} aria-hidden="true">${paths}</svg>`;
}

export const icons = {
  music: () =>
    svg(
      `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`
    ),
  list: () =>
    svg(`<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>`),
  target: () =>
    svg(`<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`),
  download: () =>
    svg(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>`),
  film: () =>
    svg(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>`),
  play: () => svg(`<polygon points="6 3 20 12 6 21 6 3"/>`),
  pause: () => svg(`<rect x="14" y="4" width="4" height="16"/><rect x="6" y="4" width="4" height="16"/>`),
  undo: () =>
    svg(`<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 2.93L3 13"/>`),
  redo: () =>
    svg(`<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.69 2.93L21 13"/>`),
  more: () =>
    svg(`<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>`),
  skipBack: () =>
    svg(`<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>`),
  skipForward: () =>
    svg(`<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>`),
};

/** Replace [data-icon] elements' innerHTML with the named icon. */
export function applyIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.getAttribute("data-icon");
    const fn = icons[name];
    if (!fn) return;
    const size = Number(el.getAttribute("data-icon-size")) || 20;
    el.innerHTML = fn({ size });
  });
}

export function iconHtml(name, opts) {
  return icons[name] ? icons[name](opts) : "";
}
