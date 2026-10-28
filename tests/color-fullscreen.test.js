import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

describe("feature color cues + standalone fullscreen", () => {
  it("tokens define eclipse feature accents and success (no purple)", () => {
    const tokens = readFileSync(new URL("css/tokens.css", root), "utf8");
    for (const key of [
      "--feat-projects",
      "--feat-song",
      "--feat-sync",
      "--feat-film",
      "--feat-export",
      "--ok",
      "--grad-sync",
      "--safe-l",
      "--safe-r",
    ]) {
      assert.match(tokens, new RegExp(key.replace(/-/g, "\\-")));
    }
    assert.ok(!/#7c3aed|#8b5cf6|#a78bfa|#6366f1/i.test(tokens));
    assert.match(tokens, /body\[data-screen="sync"\]/);
  });

  it("tabs and eyebrows use per-feature accents", () => {
    const css = readFileSync(new URL("css/app.css", root), "utf8");
    assert.match(css, /\.tab\[data-goto="prepare"\]\.is-active/);
    assert.match(css, /\.tab\[data-goto="sync"\]\.is-active/);
    assert.match(css, /\.tab\[data-goto="video"\]\.is-active/);
    assert.match(css, /\.screen\[data-screen="projects"\] \.eyebrow/);
    assert.match(css, /\.dock-tap[\s\S]*?var\(--grad-sync\)/);
    assert.match(css, /#btn-sheet-export[\s\S]*?feat-export/);
  });

  it("standalone / safe-area fill covers notch and home indicator", () => {
    const css = readFileSync(new URL("css/app.css", root), "utf8");
    const html = readFileSync(new URL("index.html", root), "utf8");
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /apple-mobile-web-app-capable/);
    assert.match(html, /black-translucent/);
    assert.match(html, /theme-color[^>]*#070605/);
    assert.match(css, /display-mode:\s*standalone/);
    assert.match(css, /-webkit-fill-available/);
    assert.match(css, /100svh/);
    assert.match(css, /\.app-topbar[\s\S]*?var\(--safe-t\)/);
    assert.match(css, /\.app-tabbar[\s\S]*?var\(--safe-b\)/);
    assert.match(css, /standalone-ios/);
  });

  it("manifest stays standalone with matching theme/background", () => {
    const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", root), "utf8"));
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.background_color, "#070605");
    assert.equal(manifest.theme_color, "#070605");
    assert.ok(manifest.display_override?.includes("standalone"));
  });

  it("main sets body data-screen and iOS standalone class", () => {
    const src = readFileSync(new URL("js/main.js", root), "utf8");
    assert.match(src, /document\.body\.dataset\.screen\s*=\s*name/);
    assert.match(src, /standalone-ios/);
    assert.match(src, /navigator\.standalone/);
  });
});
