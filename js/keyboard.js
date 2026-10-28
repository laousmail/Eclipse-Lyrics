/**
 * Mobile keyboard + focus helpers.
 * - Tracks visualViewport keyboard inset as --kb-inset
 * - Keeps focused fields above the keyboard inside .app-screens
 * - Hides dock/tabbar while typing to avoid overlaps
 */

const FOCUSABLE =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), textarea, select';

let attached = false;
let focusedEl = null;

function setKbInset(px) {
  const v = Math.max(0, Math.round(px));
  document.documentElement.style.setProperty("--kb-inset", `${v}px`);
  document.body.classList.toggle("keyboard-open", v > 48);
}

function measureKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  // Layout height minus visible bottom edge (keyboard / browser chrome)
  const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
  const visibleBottom = vv.offsetTop + vv.height;
  return Math.max(0, layoutH - visibleBottom);
}

function updateInset() {
  setKbInset(measureKeyboardInset());
  if (focusedEl && document.activeElement === focusedEl) {
    ensureFieldVisible(focusedEl);
  }
}

/**
 * Scroll the focused control into the visible area of .app-screens,
 * leaving room above the keyboard / chrome.
 */
export function ensureFieldVisible(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return;
  const scroller = document.getElementById("main") || document.querySelector(".app-screens");
  const vv = window.visualViewport;
  const kb = measureKeyboardInset();
  const rect = el.getBoundingClientRect();
  const pad = 12;
  const visibleTop = (vv?.offsetTop || 0) + pad;
  // Leave space above keyboard; also clear sticky chrome when keyboard open
  const visibleBottom =
    (vv ? vv.offsetTop + vv.height : window.innerHeight) - Math.max(kb > 48 ? 8 : 0, 0) - pad;

  if (rect.top < visibleTop) {
    if (scroller) {
      scroller.scrollTop -= visibleTop - rect.top;
    } else {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return;
  }
  if (rect.bottom > visibleBottom) {
    if (scroller) {
      scroller.scrollTop += rect.bottom - visibleBottom;
    } else {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

function onFocusIn(e) {
  const t = e.target;
  if (!(t instanceof Element) || !t.matches(FOCUSABLE)) return;
  focusedEl = t;
  document.body.classList.add("field-focused");
  // Double rAF: wait for keyboard animation / visualViewport settle
  requestAnimationFrame(() => {
    updateInset();
    requestAnimationFrame(() => ensureFieldVisible(t));
  });
  // iOS sometimes settles later
  setTimeout(() => {
    updateInset();
    ensureFieldVisible(t);
  }, 320);
}

function onFocusOut() {
  // Defer — focus may move to another field
  setTimeout(() => {
    const active = document.activeElement;
    if (active instanceof Element && active.matches(FOCUSABLE)) {
      focusedEl = active;
      return;
    }
    focusedEl = null;
    document.body.classList.remove("field-focused");
    // Keyboard may still be closing
    setTimeout(updateInset, 180);
  }, 0);
}

export function initKeyboardGuards() {
  if (attached || typeof window === "undefined") return;
  attached = true;

  document.documentElement.style.setProperty("--kb-inset", "0px");
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", updateInset);
    vv.addEventListener("scroll", updateInset);
  }
  window.addEventListener("resize", updateInset);
  updateInset();
}

export function getKeyboardInset() {
  return measureKeyboardInset();
}
