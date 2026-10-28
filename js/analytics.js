/**
 * Cookie-free analytics stub (GoatCounter-shaped).
 *
 * Set window.ECLIPSE_GOATCOUNTER_CODE = "YOUR_CODE" (or meta goatcounter-code)
 * to enable. Without a code, track() is a no-op — never invent a live endpoint.
 */

function getCode() {
  if (typeof window !== "undefined" && window.ECLIPSE_GOATCOUNTER_CODE) {
    return String(window.ECLIPSE_GOATCOUNTER_CODE).trim();
  }
  if (typeof document === "undefined") return "";
  const meta = document.querySelector('meta[name="eclipse-goatcounter"]');
  return meta?.content?.trim() || "";
}

export function analyticsEnabled() {
  return Boolean(getCode());
}

/**
 * Count a page view or custom event (export_srt, export_video, …).
 * Uses GoatCounter pixel when configured; otherwise no network call.
 */
export function track(eventPath) {
  const code = getCode();
  if (!code || typeof document === "undefined") return;

  try {
    const fallback =
      typeof window !== "undefined" ? window.location?.pathname || "/" : "/";
    const raw = eventPath == null ? fallback : eventPath;
    const path = String(raw || "/").startsWith("/") ? String(raw) : `/${raw}`;
    const title = document.title || "Eclipse Lyrics";
    const qs = new URLSearchParams({
      p: path,
      t: title,
      r: document.referrer || "",
    });
    // GoatCounter count pixel — only when user supplied a site code
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.src = `https://${encodeURIComponent(code)}.goatcounter.com/count?${qs}`;
  } catch {
    /* ignore */
  }
}

export function trackPageView() {
  if (typeof window === "undefined") return;
  track(window.location.pathname + (window.location.hash || ""));
}

export function trackExport(kind) {
  track(`/event/export/${kind || "unknown"}`);
}
