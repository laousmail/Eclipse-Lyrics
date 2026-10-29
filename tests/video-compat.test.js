import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isWidelyCompatible, sniffMp4Codecs } from "../video/export.js";

const bytes = (str) => new Uint8Array([...str].map((c) => c.charCodeAt(0)));
const mp4 = (str) => new Blob([bytes(str)], { type: "video/mp4" });

describe("MP4 compatibility check reads the file, not the browser's claim", () => {
  it("finds codec tags in the header or the tail", () => {
    assert.deepEqual(sniffMp4Codecs(bytes("..stsd..avc1....mp4a..")), { h264: true, aac: true });
    assert.deepEqual(sniffMp4Codecs(bytes("mdat"), bytes("moov..avc1..Opus")), { h264: true, aac: false });
    assert.deepEqual(sniffMp4Codecs(bytes("moov..vp09..Opus")), { h264: false, aac: false });
  });

  it("WebCodecs export is always H.264 + AAC", async () => {
    assert.equal(await isWidelyCompatible("webcodecs", mp4("vp09")), true);
  });

  it("MediaRecorder MP4 passes only with H.264 and AAC inside", async () => {
    assert.equal(await isWidelyCompatible("mediarecorder", mp4("moov avc1 mp4a")), true);
    assert.equal(await isWidelyCompatible("mediarecorder", mp4("moov vp09 Opus")), false);
    assert.equal(await isWidelyCompatible("mediarecorder", mp4("moov avc1 Opus")), false);
  });

  it("WebM always warns", async () => {
    const webm = new Blob([bytes("avc1 mp4a")], { type: "video/webm" });
    assert.equal(await isWidelyCompatible("mediarecorder", webm), false);
  });
});
