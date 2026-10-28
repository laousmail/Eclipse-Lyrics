import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure helper mirroring main.js keyboard gating (B2).
 * Kept here so the rule is unit-tested without a DOM.
 */
export function shouldHandleSyncShortcut({ screen, dialogOpen, key }) {
  const playKeys = new Set(["p", "P", "k", "K"]);
  if (dialogOpen) return false;
  if (playKeys.has(key)) return "play";
  if (screen !== "sync") return false;
  return "sync";
}

describe("B2 keyboard scope", () => {
  it("keeps P/K global when not on sync", () => {
    assert.equal(shouldHandleSyncShortcut({ screen: "export", dialogOpen: false, key: "p" }), "play");
    assert.equal(shouldHandleSyncShortcut({ screen: "video", dialogOpen: false, key: "K" }), "play");
  });

  it("blocks sync shortcuts off Sync and when a dialog is open", () => {
    assert.equal(shouldHandleSyncShortcut({ screen: "export", dialogOpen: false, key: " " }), false);
    assert.equal(shouldHandleSyncShortcut({ screen: "sync", dialogOpen: true, key: " " }), false);
    assert.equal(shouldHandleSyncShortcut({ screen: "sync", dialogOpen: true, key: "p" }), false);
  });

  it("allows sync shortcuts on Sync with no dialog", () => {
    assert.equal(shouldHandleSyncShortcut({ screen: "sync", dialogOpen: false, key: " " }), "sync");
    assert.equal(shouldHandleSyncShortcut({ screen: "sync", dialogOpen: false, key: "Backspace" }), "sync");
  });
});
