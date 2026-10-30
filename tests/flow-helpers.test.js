import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isGenericSongName,
  titleFromFileName,
  analyzeLyrics,
  translationMatch,
  outputVideoSettings,
  needsVideo,
  colorClashes,
} from "../js/flow/helpers.js";

describe("generic song names", () => {
  for (const name of [
    "New Recording 12",
    "AUD-20240611-WA0003",
    "track 01",
    "final mix v3",
    "20241030 1012",
    "Voice Memo",
    "untitled",
    "WhatsApp Audio 2024 06 11 at 10.12.33",
    "Nouvel enregistrement 4",
    "song (master)",
    "",
  ]) {
    it(`"${name}" is generic`, () => assert.equal(isGenericSongName(name), true));
  }
  for (const name of ["Tafat", "Azul fellawen", "Ma vie en couleur", "Song for Lila", "Asiwel", "Ṭṭaq"]) {
    it(`"${name}" is a real title`, () => assert.equal(isGenericSongName(name), false));
  }
});

describe("title from file name", () => {
  it("drops the extension and separators", () => {
    assert.equal(titleFromFileName("ma_vie-en_couleur.mp3"), "ma vie en couleur");
  });
});

describe("lyric checks", () => {
  it("counts lyric lines and sections, flags long lines", () => {
    const r = analyzeLyrics("[Verse]\nAzul fellawen\n\nAnsuf yis-wen\n" + "x".repeat(60));
    assert.equal(r.lyricCount, 3);
    assert.equal(r.sectionCount, 1);
    assert.deepEqual(r.longLines.map((l) => l.n), [4]);
  });

  it("spots verses pasted as paragraphs", () => {
    const para = "I walked along the river and I thought of you, the night was long and cold and all the lights were low";
    assert.equal(analyzeLyrics(`${para}\n${para}`).looksLikeParagraphs, true);
    assert.equal(analyzeLyrics("Short line\nAnother line\nThird").looksLikeParagraphs, false);
  });

  it("translation must have one line per lyric line", () => {
    assert.deepEqual(translationMatch(2, "Bonjour\n\nBienvenue"), { count: 2, matches: true, diff: 0 });
    assert.equal(translationMatch(3, "[Refrain]\nBonjour").diff, -2);
  });
});

describe("outputs", () => {
  it("maps each output to video settings", () => {
    assert.deepEqual(outputVideoSettings("green", { font: "Anton" }), { font: "Anton", output: "overlay", overlayFormat: "green" });
    assert.equal(outputVideoSettings("transparent", {}, { transparentWebm: false }).overlayFormat, "png");
    assert.equal(outputVideoSettings("full", { output: "overlay" }).output, "full");
  });

  it("subtitles alone need no video", () => {
    assert.equal(needsVideo(["srt"]), false);
    assert.equal(needsVideo(["srt", "black"]), true);
  });

  it("black text clashes with a black background", () => {
    assert.equal(colorClashes("black", ["black"]), true);
    assert.equal(colorClashes("black", ["green", "transparent"]), false);
    assert.equal(colorClashes("white", ["black"]), false);
  });
});
