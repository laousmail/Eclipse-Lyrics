import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INTRO_CARDS, SCREEN_TIPS } from "../js/onboarding.js";
import { analyticsEnabled } from "../js/analytics.js";
import { readFileSync } from "node:fs";

describe("Phase 5 i18n + onboarding + analytics stub", () => {
  it("has three intro cards and tips for main screens", () => {
    assert.equal(INTRO_CARDS.length, 3);
    for (const s of ["projects", "audio", "lyrics", "sync", "export", "video", "help"]) {
      assert.ok(SCREEN_TIPS[s], s);
    }
  });

  it("includes Kabyle locale strings in i18n source", () => {
    const src = readFileSync(new URL("../js/i18n.js", import.meta.url), "utf8");
    assert.match(src, /\bkab:\s*\{/);
    assert.match(src, /tryDemo:/);
    assert.match(src, /installApp:/);
    assert.match(src, /privacyNote:/);
    assert.match(src, /saved === "kab"/);
  });

  it("analytics is disabled without a GoatCounter code", () => {
    assert.equal(analyticsEnabled(), false);
  });

  it("manifest and SW exist with PWA essentials", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
    assert.equal(manifest.short_name, "Eclipse");
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.icons.some((i) => i.sizes === "192x192"));
    assert.ok(manifest.icons.some((i) => i.purpose?.includes("maskable")));
    assert.ok(manifest.file_handlers?.length);
    assert.ok(manifest.share_target);

    const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
    assert.match(sw, /PRECACHE/);
    assert.match(sw, /share-target/);
    assert.match(sw, /mediabunny/);
  });

  it("demo project has timed Kabyle lines", () => {
    const demo = JSON.parse(readFileSync(new URL("../demo/demo-project.json", import.meta.url), "utf8"));
    assert.equal(demo.title, "Demo");
    assert.ok(demo.lines.length >= 4);
    assert.ok(demo.lines.every((l) => l.startMs != null));
    assert.match(demo.lines[0].text.kab, /Azul/);
  });

  it("index has SEO title, OG, JSON-LD, intro, help", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    assert.match(html, /Free Lyrics Sync/);
    assert.match(html, /og-1200x630\.png/);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /WebApplication/);
    assert.match(html, /intro-overlay/);
    assert.match(html, /screen-help/);
    assert.match(html, /data-lang="kab"/);
    assert.match(html, /manifest\.webmanifest/);
  });
});
