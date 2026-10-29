import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isDialogOpen } from "../js/ui/dialog.js";

/** Minimal element: `hidden` flag and a parent chain, enough for closest("[hidden]"). */
function el(hidden = false, parentElement = null) {
  return {
    hidden,
    parentElement,
    closest(sel) {
      if (sel !== "[hidden]") return null;
      for (let n = this; n; n = n.parentElement) if (n.hidden) return n;
      return null;
    },
  };
}

function fakeDocument(candidates) {
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => candidates,
  };
}

describe("isDialogOpen ignores dialogs inside hidden overlays", () => {
  afterEach(() => delete globalThis.document);

  it("intro card inside the hidden intro overlay does not block shortcuts", () => {
    const overlay = el(true);
    fakeDocument([el(false, overlay)]);
    assert.equal(isDialogOpen(), false);
  });

  it("a visible role=dialog still counts as open", () => {
    fakeDocument([el(false, el(false))]);
    assert.equal(isDialogOpen(), true);
  });
});
