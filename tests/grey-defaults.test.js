import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { greyOldDefaults, migrateProject } from "../js/core/project.js";

describe("greyOldDefaults", () => {
  it("swaps the old warm defaults for the grey ones", () => {
    const v = greyOldDefaults({ textColor: "#f4ebe6", translationColor: "#FFB088", glowColor: "rgba(255,107,53,0.55)" });
    assert.equal(v.textColor, "#f2f2f2");
    assert.equal(v.translationColor, "#b8b8bc");
    assert.equal(v.glowColor, "rgba(255,255,255,0.35)");
  });

  it("keeps colours someone picked", () => {
    const v = greyOldDefaults({ textColor: "#ff8fb1", translationColor: "#ffe3ec" });
    assert.equal(v.textColor, "#ff8fb1");
    assert.equal(v.translationColor, "#ffe3ec");
  });

  it("runs when a saved project is opened", () => {
    const p = migrateProject({ version: 2, lines: [], settings: { video: { textColor: "#f4ebe6" } } });
    assert.equal(p.settings.video.textColor, "#f2f2f2");
  });
});
