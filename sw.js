/* Eclipse Lyrics service worker — precache app shell, fonts, vendor. */
const CACHE = "eclipse-lyrics-v9";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/app.css",
  "./css/brand.css",
  "./js/main.js",
  "./js/audio.js",
  "./js/sync.js",
  "./js/store.js",
  "./js/history.js",
  "./js/db.js",
  "./js/storage.js",
  "./js/export.js",
  "./js/i18n.js",
  "./js/docs.js",
  "./js/haptics.js",
  "./js/lineList.js",
  "./js/waveform.js",
  "./js/peaks.worker.js",
  "./js/video.js",
  "./js/zip.js",
  "./js/projectFile.js",
  "./js/pwa.js",
  "./js/onboarding.js",
  "./js/demo.js",
  "./js/analytics.js",
  "./js/keyboard.js",
  "./js/ui/toast.js",
  "./js/ui/dialog.js",
  "./js/ui/icons.js",
  "./js/ui/projectsList.js",
  "./js/core/project.js",
  "./js/core/timing.js",
  "./js/core/lyrics.js",
  "./video/layout.js",
  "./video/renderer.js",
  "./video/templates.js",
  "./video/export.js",
  "./video/export-webcodecs.js",
  "./video/export-mediarecorder.js",
  "./video/export-worker.js",
  "./video/export-overlay.js",
  "./video/styles/index.js",
  "./video/styles/fadeUp.js",
  "./video/styles/glowSweep.js",
  "./video/styles/smoke.js",
  "./video/styles/typewriter.js",
  "./video/styles/blurIn.js",
  "./vendor/mediabunny.min.mjs",
  "./vendor/mediabunny.meta.json",
  "./fonts/outfit-400.woff2",
  "./fonts/outfit-500.woff2",
  "./fonts/outfit-600.woff2",
  "./fonts/cormorant-garamond-600.woff2",
  "./fonts/cormorant-garamond-500-italic.woff2",
  "./fonts/jetbrains-mono-400.woff2",
  "./fonts/jetbrains-mono-500.woff2",
  "./fonts/noto-sans-latin-400.woff2",
  "./fonts/noto-sans-latin-600.woff2",
  "./fonts/noto-sans-latin-ext-400.woff2",
  "./fonts/noto-sans-latin-ext-600.woff2",
  "./fonts/noto-sans-tifinagh-400.woff2",
  "./fonts/noto-serif-latin-400.woff2",
  "./fonts/noto-serif-latin-600.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./og/og-1200x630.png",
  "./demo/demo.wav",
  "./demo/demo-project.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Cache what we can; ignore individual failures so install still succeeds
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            /* optional / missing */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

/** Share target: stash audio in Cache Storage for the client to claim. */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method === "POST" &&
    url.searchParams.has("share-target")
  ) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.method !== "GET") return;

  // App shell navigation: network-first with cache fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(event.request);
          const cache = await caches.open(CACHE);
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match("./index.html");
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const fresh = await fetch(event.request);
        if (fresh.ok && url.origin === self.location.origin) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, fresh.clone());
        }
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })()
  );
});

async function handleShareTarget(request) {
  try {
    const form = await request.formData();
    const file = form.get("audio");
    if (file && file instanceof File) {
      const cache = await caches.open("eclipse-share-inbox");
      await cache.put(
        "shared-audio",
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Filename": file.name || "shared-audio",
          },
        })
      );
    }
  } catch {
    /* ignore */
  }
  return Response.redirect("./index.html?share-target=1#audio", 303);
}
