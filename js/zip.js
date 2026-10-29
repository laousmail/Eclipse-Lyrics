/** Minimal ZIP (store / no compression) for project bundles. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function u16(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function concat(parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function encodeName(name) {
  return new TextEncoder().encode(name);
}

function toBytes(data) {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

/** Store-method ZIP limits without ZIP64. */
export const ZIP_MAX_ENTRIES = 65535;
export const ZIP_MAX_BYTES = 0xffffffff;

/**
 * Streaming ZIP writer (store / no compression). Each entry becomes its own Blob
 * part, so large archives (e.g. thousands of PNG frames) don't need one huge buffer.
 */
export class ZipWriter {
  constructor() {
    this.parts = [];
    this.centralParts = [];
    this.offset = 0;
    this.count = 0;
  }

  /** Bytes written so far (local headers + data). */
  get size() {
    return this.offset;
  }

  /**
   * @param {string} name
   * @param {Uint8Array|ArrayBuffer|string} input
   */
  add(name, input) {
    const data = toBytes(input);
    const nameBytes = encodeName(name);
    const localLen = 30 + nameBytes.length + data.length;
    if (this.count + 1 > ZIP_MAX_ENTRIES || this.offset + localLen > ZIP_MAX_BYTES) {
      throw new RangeError("ZIP too large");
    }
    const crc = crc32(data);
    const header = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    this.parts.push(new Blob([header, data]));
    this.centralParts.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(this.offset),
        nameBytes,
      ])
    );
    this.offset += localLen;
    this.count += 1;
  }

  /** @returns {Blob} */
  finish(type = "application/zip") {
    const centralDir = concat(this.centralParts);
    const end = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(this.count),
      u16(this.count),
      u32(centralDir.length),
      u32(this.offset),
      u16(0),
    ]);
    return new Blob([...this.parts, centralDir, end], { type });
  }
}

/**
 * @param {Array<{ name: string, data: Uint8Array|ArrayBuffer|string }>} files
 * @returns {Blob}
 */
export function createZip(files) {
  const zip = new ZipWriter();
  for (const file of files) zip.add(file.name, file.data);
  return zip.finish();
}

/** Parse store-method ZIP; returns Map name → Uint8Array. */
export async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Map();
  let i = 0;
  while (i + 30 <= buf.length) {
    const sig = view.getUint32(i, true);
    if (sig !== 0x04034b50) break;
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const comp = view.getUint16(i + 8, true);
    const size = view.getUint32(i + 18, true);
    const nameStart = i + 30;
    const name = new TextDecoder().decode(buf.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    if (comp !== 0) throw new Error(`Unsupported ZIP compression for ${name}`);
    out.set(name, buf.subarray(dataStart, dataStart + size));
    i = dataStart + size;
  }
  return out;
}
