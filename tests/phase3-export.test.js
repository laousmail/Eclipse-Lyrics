import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  prepareExportLines,
  toSRT,
  toLaousmailReleaseJson,
  previewCues,
  resolveExportLang,
} from "../js/export.js";
import { createEmptyProject, createLyricLine } from "../js/sync.js";
import { createZip, readZip } from "../js/zip.js";
import { toEclipseJson, peaksToThumb } from "../js/projectFile.js";

describe("Phase 3 export options", () => {
  it("applies global offset and min duration", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 20000;
    project.lines = [
      createLyricLine({ kab: "a", startMs: 1000, endMs: 1200 }),
      createLyricLine({ kab: "b", startMs: 5000, endMs: 6000 }),
    ];
    const lines = prepareExportLines(project, {
      globalOffsetMs: 100,
      minLineMs: 700,
      maxGapMs: 8000,
    });
    assert.equal(lines[0].startMs, 1100);
    assert.ok(lines[0].endMs - lines[0].startMs >= 700);
  });

  it("clears long gaps with maxGapMs", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 60000;
    project.lines = [
      createLyricLine({ kab: "a", startMs: 1000, endMs: 30000, endManual: true }),
    ];
    const lines = prepareExportLines(project, {
      globalOffsetMs: 0,
      minLineMs: 700,
      maxGapMs: 2000,
    });
    assert.equal(lines[0].endMs, 3000);
  });

  it("resolves language modes", () => {
    assert.equal(resolveExportLang({ languages: "main+fr" }).includeTr, true);
    assert.equal(resolveExportLang({ languages: "main+en" }).trLang, "en");
    assert.equal(resolveExportLang({ languages: "separate" }).mode, "separate");
  });

  it("builds laousmail release-shaped JSON with lyrics", () => {
    const project = createEmptyProject();
    project.title = "Asiwel";
    project.artist = "laousmail";
    project.lines = [createLyricLine({ kab: "Awal", fr: "Mot", startMs: 1000, endMs: 2000 })];
    const rel = toLaousmailReleaseJson(project);
    assert.equal(rel.title, "Asiwel");
    assert.ok(rel.lang.en);
    assert.ok(rel.description);
    assert.equal(rel.lyrics[0].text.kab, "Awal");
    assert.equal(rel.lyrics[0].startMs, 1000);
  });

  it("previews first cues", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 30000;
    project.lines = Array.from({ length: 12 }, (_, i) =>
      createLyricLine({ kab: `L${i}`, startMs: i * 1000, endMs: i * 1000 + 800 })
    );
    const preview = previewCues(project, { languages: "main" }, 10);
    assert.ok(preview.includes("L0"));
    assert.ok(preview.includes("…"));
  });

  it("SRT includes FR as second line in main+fr mode", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 10000;
    project.lines = [createLyricLine({ kab: "Awal", fr: "Mot", startMs: 0, endMs: 1000 })];
    const srt = toSRT(project, { languages: "main+fr" });
    assert.ok(srt.includes("Awal\nMot"));
  });
});

describe("Phase 3 zip + project file", () => {
  it("round-trips zip store entries", async () => {
    const zip = createZip([
      { name: "project.eclipse.json", data: '{"version":2}' },
      { name: "audio.mp3", data: new Uint8Array([1, 2, 3, 4]) },
    ]);
    const map = await readZip(zip);
    assert.equal(new TextDecoder().decode(map.get("project.eclipse.json")), '{"version":2}');
    assert.deepEqual([...map.get("audio.mp3")], [1, 2, 3, 4]);
  });

  it("serializes eclipse.json with version 2", () => {
    const project = createEmptyProject();
    project.title = "T";
    const raw = JSON.parse(toEclipseJson(project));
    assert.equal(raw.version, 2);
    assert.equal(raw.title, "T");
  });

  it("builds waveform thumb", () => {
    const peaks = new Float32Array(30);
    for (let i = 0; i < 10; i++) {
      peaks[i * 3 + 2] = 0.5;
    }
    const thumb = peaksToThumb(peaks, 8);
    assert.equal(thumb.length, 8);
  });
});

describe("export caps apply even when settings are not passed", () => {
  it("defaults to 8 s max and 0.7 s min instead of NaN (no cap)", () => {
    const project = {
      audio: { durationMs: 120000 },
      lines: [
        { id: "a", type: "lyric", startMs: 1000, endMs: null, text: { kab: "A" } },
        { id: "b", type: "lyric", startMs: 1200, endMs: null, text: { kab: "B" } },
      ],
    };
    const out = prepareExportLines(project, {});
    assert.equal(out[1].endMs, 9200);
    assert.ok(out[0].endMs - out[0].startMs >= 200);
  });
});
