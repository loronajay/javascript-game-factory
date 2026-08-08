// A minimal PNG reader, for tests that need to look at the shipped art.
//
// The cabinet has no dependencies and Node has no image decoder, but some facts
// about an asset can only be checked by reading its pixels — the same reason
// `gauge-assets.test.js` parses the gauge SVGs. Nothing at runtime can notice
// that a car sheet came back from a background remover full of chroma residue;
// a test can.
//
// Deliberately narrow: 8-bit RGBA, non-interlaced, which is what
// `tools/cut-car-sheets.py` writes. Anything else throws rather than guessing,
// because a decoder that quietly mis-reads a format would make the tests above
// it lie.

import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = 4;

function chunks(buffer) {
  const found = [];
  let offset = SIGNATURE.length;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    found.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length; // length + type + data + crc
  }
  return found;
}

/** Undoes the per-scanline filter each row carries as its first byte. */
function unfilter(raw, width, height) {
  const stride = width * CHANNELS;
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const target = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= CHANNELS ? out[target + x - CHANNELS] : 0;
      const up = y > 0 ? out[target - stride + x] : 0;
      const upLeft = y > 0 && x >= CHANNELS ? out[target - stride + x - CHANNELS] : 0;

      let value;
      if (filter === 0) value = line[x];
      else if (filter === 1) value = line[x] + left;
      else if (filter === 2) value = line[x] + up;
      else if (filter === 3) value = line[x] + ((left + up) >> 1);
      else if (filter === 4) {
        // Paeth: whichever neighbour the gradient predicts best.
        const p = left + up - upLeft;
        const dl = Math.abs(p - left);
        const du = Math.abs(p - up);
        const dul = Math.abs(p - upLeft);
        value = line[x] + (dl <= du && dl <= dul ? left : du <= dul ? up : upLeft);
      } else throw new Error(`unsupported PNG row filter ${filter}`);

      out[target + x] = value & 0xff;
    }
  }
  return out;
}

/** `{ width, height, pixels }`, pixels being RGBA bytes in row-major order. */
export function readPng(buffer) {
  if (!buffer.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
    throw new Error("not a PNG");
  }

  const parts = chunks(buffer);
  const header = parts.find((chunk) => chunk.type === "IHDR");
  if (!header) throw new Error("PNG has no IHDR");

  const width = header.data.readUInt32BE(0);
  const height = header.data.readUInt32BE(4);
  const depth = header.data[8];
  const colourType = header.data[9];
  const interlace = header.data[12];

  if (depth !== 8 || colourType !== 6 || interlace !== 0) {
    throw new Error(
      `only 8-bit non-interlaced RGBA is supported (got depth ${depth}, ` +
        `colour type ${colourType}, interlace ${interlace})`,
    );
  }

  const data = Buffer.concat(parts.filter((chunk) => chunk.type === "IDAT").map((c) => c.data));
  return { width, height, pixels: unfilter(inflateSync(data), width, height) };
}
