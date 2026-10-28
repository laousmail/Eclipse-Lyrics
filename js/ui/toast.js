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

export function showToast(message, { duration = 2800 } = {}) {
  const el = ensureRoot();
  if (!message) return;
  el.hidden = false;
  el.textContent = message;
  el.classList.add("is-on");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.classList.remove("is-on");
    setTimeout(() => {
      el.hidden = true;
    }, 180);
  }, duration);
}

export function hideToast() {
  const el = ensureRoot();
  clearTimeout(hideTimer);
  el.classList.remove("is-on");
  el.hidden = true;
}
