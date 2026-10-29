/** Native <dialog> helpers with focus trap + Escape. */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {HTMLDialogElement|string} dialogOrId
 * @returns {HTMLDialogElement|null}
 */
function resolve(dialogOrId) {
  if (typeof dialogOrId === "string") return document.getElementById(dialogOrId);
  return dialogOrId || null;
}

function trapFocus(dialog, e) {
  if (e.key !== "Tab") return;
  const nodes = [...dialog.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Open a native dialog (or upgrade a .sheet-overlay to behave like one).
 */
export function openDialog(dialogOrId) {
  const el = resolve(dialogOrId);
  if (!el) return;
  el._prevFocus = document.activeElement;

  if (typeof el.showModal === "function" && el.tagName === "DIALOG") {
    if (!el.open) el.showModal();
  } else {
    el.hidden = false;
    el.setAttribute("aria-modal", "true");
  }

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDialog(el);
      return;
    }
    trapFocus(el, e);
  };
  el._onKey = onKey;
  el.addEventListener("keydown", onKey);

  const focusable = el.querySelector(FOCUSABLE);
  requestAnimationFrame(() => focusable?.focus());
}

export function closeDialog(dialogOrId) {
  const el = resolve(dialogOrId);
  if (!el) return;
  if (el._onKey) {
    el.removeEventListener("keydown", el._onKey);
    el._onKey = null;
  }
  if (typeof el.close === "function" && el.tagName === "DIALOG") {
    if (el.open) el.close();
  } else {
    el.hidden = true;
  }
  const prev = el._prevFocus;
  el._prevFocus = null;
  if (prev && typeof prev.focus === "function") {
    try {
      prev.focus();
    } catch {
      /* ignore */
    }
  }
}

export function isDialogOpen() {
  if (document.querySelector("dialog[open]")) return true;
  // A role="dialog" inside a hidden overlay (e.g. the intro card) is not open
  return [...document.querySelectorAll('.sheet-overlay:not([hidden]), [role="dialog"]:not([hidden])')].some(
    (el) => !el.parentElement?.closest("[hidden]")
  );
}

/**
 * Promise-based confirm using a dialog element with [data-dialog-ok] / [data-dialog-cancel].
 */
export function confirmDialog(dialogOrId) {
  return new Promise((resolve) => {
    const el = resolve(dialogOrId);
    if (!el) {
      resolve(false);
      return;
    }
    openDialog(el);
    const ok = el.querySelector("[data-dialog-ok]");
    const cancel = el.querySelector("[data-dialog-cancel]");
    const finish = (value) => {
      ok?.removeEventListener("click", onOk);
      cancel?.removeEventListener("click", onCancel);
      el.removeEventListener("cancel", onNativeCancel);
      closeDialog(el);
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onNativeCancel = (e) => {
      e.preventDefault();
      finish(false);
    };
    ok?.addEventListener("click", onOk);
    cancel?.addEventListener("click", onCancel);
    el.addEventListener("cancel", onNativeCancel);
  });
}
