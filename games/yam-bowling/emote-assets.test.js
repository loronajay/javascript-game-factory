const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function alphaCounts(file) {
  const png = fs.readFileSync(file);
  assert.equal(png.subarray(1, 4).toString(), "PNG", `${file} must be a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString();
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, `${file} must use 8-bit channels`);
      assert.equal(data[9], 6, `${file} must use RGBA color`);
    }
    if (type === "IDAT") compressed.push(data);
    offset += length + 12;
  }

  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  let previous = Buffer.alloc(stride);
  let sourceOffset = 0;
  let transparent = 0;
  let visible = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset];
    sourceOffset += 1;
    const current = Buffer.allocUnsafe(stride);
    for (let x = 0; x < stride; x += 1) {
      const encoded = raw[sourceOffset + x];
      const left = x >= 4 ? current[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      if (filter === 0) current[x] = encoded;
      else if (filter === 1) current[x] = (encoded + left) & 255;
      else if (filter === 2) current[x] = (encoded + up) & 255;
      else if (filter === 3) current[x] = (encoded + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) current[x] = (encoded + paeth(left, up, upperLeft)) & 255;
      else assert.fail(`${file} has unsupported PNG filter ${filter}`);
    }
    sourceOffset += stride;
    for (let x = 3; x < stride; x += 4) {
      if (current[x] === 0) transparent += 1;
      if (current[x] > 0) visible += 1;
    }
    previous = current;
  }
  return { pixels: width * height, transparent, visible };
}

test("every emote master is a real transparent sticker, never an opaque checkerboard", () => {
  const directory = path.join(__dirname, "assets", "emotes");
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".png"));
  assert.equal(files.length, 30);
  for (const name of files) {
    const counts = alphaCounts(path.join(directory, name));
    assert.ok(counts.transparent / counts.pixels > .2, `${name} needs real transparent background pixels`);
    assert.ok(counts.visible / counts.pixels > .05, `${name} still needs visible sticker artwork`);
  }
});
