import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isEmptyProject } from "../js/ui/projectsList.js";
import { createEmptyProject, createLyricLine } from "../js/core/project.js";

describe("empty projects stay out of the library", () => {
  it("a fresh project with nothing in it is empty", () => {
    assert.equal(isEmptyProject(createEmptyProject()), true);
  });

  it("audio, a title or one lyric makes it a real project", () => {
    const withAudio = createEmptyProject();
    withAudio.audio.fileName = "song.mp3";
    const withTitle = { ...createEmptyProject(), title: "Tafat" };
    const withLyric = { ...createEmptyProject(), lines: [createLyricLine({ kab: "Azul" })] };
    for (const p of [withAudio, withTitle, withLyric]) assert.equal(isEmptyProject(p), false);
  });

  it("blank lyric rows alone don't count", () => {
    assert.equal(isEmptyProject({ ...createEmptyProject(), lines: [createLyricLine({ kab: "" })] }), true);
  });
});
