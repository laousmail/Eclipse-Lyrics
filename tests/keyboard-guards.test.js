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

  it("Help is More-sheet only — no always-visible header ?", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const topbar = html.slice(html.indexOf('class="app-topbar"'), html.indexOf("</header>", html.indexOf('class="app-topbar"')));
    assert.ok(!topbar.includes('id="btn-help"'));
    assert.ok(!topbar.includes('data-goto="help"'));
    assert.ok(!topbar.includes("lang-pill"));
    assert.ok(topbar.includes('id="btn-more"'));
    assert.match(html, /id="more-sheet"[\s\S]*?data-goto="help"[\s\S]*?data-i18n="help"/);
    assert.match(html, /id="more-sheet"[\s\S]*?lang-pill/);
  });

  it("keeps secondary chrome behind progressive disclosure", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const css = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");
    assert.match(html, /data-i18n="syncMore"/);
    assert.match(html, /data-i18n="exportMore"/);
    assert.match(html, /data-i18n="lyricsMore"/);
    assert.match(html, /data-i18n="filmCustomize"/);
    assert.match(css, /details\.simple-more:not\(\[open\]\)/);
    // Primary actions still present
    assert.match(html, /id="btn-export-srt"/);
    assert.match(html, /id="btn-tap"/);
    assert.match(html, /id="btn-new-project"/);
  });

  it("hides desktop step-seg on mobile (no brand overlap)", () => {
    const css = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");
    assert.match(css, /\.step-seg\.desktop-workspace-only[\s\S]*?display:\s*none/);
    assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*?\.step-seg\.desktop-workspace-only[\s\S]*?display:\s*inline-flex/);
  });

  it("phone topbar is a non-sticky flex sibling (no wrap over content)", () => {
    const css = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");
    const topbarBlock = css.slice(css.indexOf(".app-topbar {"), css.indexOf(".brand {"));
    assert.match(topbarBlock, /flex:\s*0\s+0\s+auto/);
    assert.match(topbarBlock, /position:\s*relative/);
    assert.ok(!/position:\s*sticky/.test(topbarBlock));
    assert.match(css, /\.ios-install-hint[\s\S]*?top:\s*calc\(var\(--safe-t\)\s*\+\s*var\(--topbar-h\)/);
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
