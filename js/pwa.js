/** PWA install prompt, SW registration, iOS hint, launch/share handlers. */

let deferredPrompt = null;
let onUpdateAvailable = null;
let beforeInstallCb = null;

export function onBeforeInstall(cb) {
  beforeInstallCb = cb || null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    beforeInstallCb?.(e);
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    beforeInstallCb?.(null);
  });
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Rough mobile check — phones/tablets where A2HS / install matters most. */
export function isMobileUa() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "");
}

/**
 * How to offer install in the More sheet:
 * - "chromium" → beforeinstallprompt available
 * - "ios" → show Add to Home Screen how-to
 * - null → hide (already installed / desktop without prompt)
 */
export function installOfferMode() {
  if (typeof window === "undefined" || isStandalone()) return null;
  // iOS (Safari/Chrome) never gets a real BIP — always show A2HS how-to
  if (isIos()) return "ios";
  if (canPromptInstall()) return "chromium";
  return null;
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return choice?.outcome === "accepted";
}

export function canPromptInstall() {
  return Boolean(deferredPrompt);
}

/**
 * Register service worker. Calls onUpdate when a new SW is waiting.
 */
export async function registerServiceWorker({ onUpdate } = {}) {
  onUpdateAvailable = onUpdate || null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    if (reg.waiting) onUpdateAvailable?.(reg);
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          onUpdateAvailable?.(reg);
        }
      });
    });
    // Periodic check
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    return reg;
  } catch (err) {
    console.warn("[eclipse] SW register failed", err);
    return null;
  }
}

export function activateWaitingWorker(reg) {
  reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

/** Claim files opened via OS file_handlers / launchQueue. */
export function consumeLaunchQueue(handler) {
  if (!("launchQueue" in window)) return;
  window.launchQueue.setConsumer(async (launchParams) => {
    const files = launchParams?.files || [];
    for (const handle of files) {
      try {
        const file = await handle.getFile();
        await handler(file);
      } catch (err) {
        console.warn("[eclipse] launch file failed", err);
      }
    }
  });
}

/** Pull audio shared via Web Share Target (cached by SW). */
export async function consumeShareTarget() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("share-target")) return null;
  try {
    const cache = await caches.open("eclipse-share-inbox");
    const res = await cache.match("shared-audio");
    if (!res) return null;
    const blob = await res.blob();
    const name = res.headers.get("X-Filename") || "shared-audio";
    await cache.delete("shared-audio");
    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete("share-target");
    window.history.replaceState({}, "", url.pathname + url.hash);
    return new File([blob], name, { type: blob.type || "audio/mpeg" });
  } catch {
    return null;
  }
}

/** Verify precache presence (airplane-mode proxy check). */
export async function listPrecachedUrls() {
  if (!("caches" in window)) return [];
  const keys = await caches.keys();
  const eclipse = keys.filter((k) => k.startsWith("eclipse-lyrics"));
  const urls = [];
  for (const key of eclipse) {
    const cache = await caches.open(key);
    const reqs = await cache.keys();
    for (const r of reqs) urls.push(r.url);
  }
  return urls;
}
