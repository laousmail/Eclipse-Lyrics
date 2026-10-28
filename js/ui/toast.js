/** In-app toast notifications (no alert). */

let root = null;
let hideTimer = 0;

function ensureRoot() {
  if (root) return root;
  root = document.getElementById("toast");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast";
    root.className = "toast";
    root.hidden = true;
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
  }
  return root;
}

/**
 * @param {string} message
 * @param {{ duration?: number, actionLabel?: string, onAction?: Function }} [opts]
 */
export function showToast(message, { duration = 2800, actionLabel = "", onAction = null } = {}) {
  const el = ensureRoot();
  if (!message) return;
  el.hidden = false;
  el.classList.add("is-on");
  el.replaceChildren();
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  el.appendChild(text);
  if (actionLabel && typeof onAction === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      onAction();
      hideToast();
    });
    el.appendChild(btn);
  }
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.classList.remove("is-on");
    setTimeout(() => {
      el.hidden = true;
      el.replaceChildren();
    }, 180);
  }, duration);
}

export function hideToast() {
  const el = ensureRoot();
  clearTimeout(hideTimer);
  el.classList.remove("is-on");
  el.hidden = true;
}
