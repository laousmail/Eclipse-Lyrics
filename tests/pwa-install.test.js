import { describe, it } from "node:test";
import assert from "assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("PWA install discovery", () => {
  it("exposes installOfferMode helpers in pwa.js", () => {
    const src = readFileSync(join(root, "js/pwa.js"), "utf8");
    assert.match(src, /export function installOfferMode/);
    assert.match(src, /export function isMobileUa/);
    assert.match(src, /appinstalled/);
    assert.match(src, /isIos\(\)\s*\)\s*return "ios"/);
    assert.match(src, /canPromptInstall\(\)\s*\)\s*return "chromium"/);
  });

  it("More sheet has Install first; iOS how-to sheet and soft tip exist", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    assert.match(html, /id="install-soft-tip"/);
    assert.match(html, /id="ios-install-sheet"/);
    assert.match(html, /id="btn-sheet-install"/);
    assert.match(html, /data-i18n="iosInstallStep1"/);
    // Install row appears before Projects in the sheet list
    const installAt = html.indexOf('id="btn-sheet-install"');
    const projectsAt = html.indexOf('id="btn-goto-projects"');
    assert.ok(installAt > 0 && projectsAt > installAt);
  });

  it("main wires BIP, iOS sheet, and soft tip dismiss", () => {
    const src = readFileSync(join(root, "js/main.js"), "utf8");
    assert.match(src, /refreshInstallOffer/);
    assert.match(src, /maybeShowInstallSoftTip/);
    assert.match(src, /ios-install-sheet/);
    assert.match(src, /addToHomeScreen/);
    assert.match(src, /eclipse-install-tip/);
    assert.match(src, /promptInstall/);
  });

  it("i18n has EN/FR/Kabyle install discovery strings", () => {
    const src = readFileSync(join(root, "js/i18n.js"), "utf8");
    for (const key of [
      "addToHomeScreen",
      "installTip",
      "installTipIos",
      "iosInstallTitle",
      "iosInstallStep1",
      "iosInstallStep2",
      "iosInstallStep3",
      "iosInstallNote",
    ]) {
      const matches = src.match(new RegExp(`${key}:`, "g")) || [];
      assert.equal(matches.length, 3, `${key} should appear in en/fr/kab`);
    }
  });

  it("manifest is standalone with 192/512/maskable icons and #prepare shortcut", () => {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.icons.some((i) => i.sizes === "192x192"));
    assert.ok(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"));
    assert.ok(manifest.icons.some((i) => i.purpose?.includes("maskable")));
    assert.ok(manifest.shortcuts?.some((s) => s.url.includes("#prepare")));
    assert.ok(!manifest.shortcuts?.some((s) => s.url.includes("#audio")));

    for (const name of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
      assert.ok(existsSync(join(root, "icons", name)), name);
    }
  });

  it("soft tip CSS sits above tab bar and hides with keyboard", () => {
    const css = readFileSync(join(root, "css/app.css"), "utf8");
    assert.match(css, /\.install-soft-tip[\s\S]*?bottom:\s*calc\(var\(--tabbar-h\)/);
    assert.match(css, /body\.keyboard-open[\s\S]*?\.install-soft-tip/);
    assert.match(css, /\.install-steps/);
  });
});
