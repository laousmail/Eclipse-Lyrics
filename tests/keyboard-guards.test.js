import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("keyboard / zoom UX guards", () => {
  it("ships keyboard.js with visualViewport inset handling", () => {
    const src = readFileSync(new URL("../js/keyboard.js", import.meta.url), "utf8");
    assert.match(src, /visualViewport/);
    assert.match(src, /--kb-inset/);
    assert.match(src, /ensureFieldVisible/);
    assert.match(src, /keyboard-open/);
  });

  it("forces ≥16px on text inputs to block iOS focus-zoom", () => {
    const css = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");
    assert.match(css, /font-size:\s*16px/);
    assert.match(css, /lyrics-row-fields input[\s\S]*?font-size:\s*16px/);
    assert.match(css, /body\.keyboard-open \.app-tabbar/);
  });

  it("tabbar is 6 columns (Help removed from crush)", () => {
    const css = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    assert.match(css, /grid-template-columns:\s*repeat\(6,/);
    const tabbar = html.slice(html.indexOf('class="app-tabbar"'), html.indexOf("</nav>", html.indexOf('class="app-tabbar"')));
    const tabs = (tabbar.match(/data-goto="/g) || []).length;
    assert.equal(tabs, 6);
    assert.ok(!tabbar.includes('data-goto="help"'));
  });

  it("hides desktop step-seg on mobile (no brand overlap)", () => {
    const css = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");
    assert.match(css, /\.step-seg\.desktop-workspace-only[\s\S]*?display:\s*none/);
    assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*?\.step-seg\.desktop-workspace-only[\s\S]*?display:\s*inline-flex/);
  });

  mainImportsKeyboard();
});

function mainImportsKeyboard() {
  it("main.js boots keyboard guards", () => {
    const src = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
    assert.match(src, /initKeyboardGuards/);
    assert.match(src, /from "\.\/keyboard\.js"/);
  });
}
