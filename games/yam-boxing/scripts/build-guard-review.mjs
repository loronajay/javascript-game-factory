import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DIRECTIONS = [
  "front",
  "front-right",
  "right",
  "rear-right",
  "rear",
  "rear-left",
  "left",
  "front-left",
];

const ZONES = {
  front: [[18, 65, 252, 185]],
  "front-right": [[50, 70, 225, 180]],
  right: [[118, 70, 160, 180]],
  "rear-right": [[145, 75, 135, 175]],
  rear: [[12, 75, 112, 175], [164, 75, 112, 175]],
  "rear-left": [[8, 75, 135, 175]],
  left: [[10, 70, 160, 180]],
  "front-left": [[12, 70, 225, 180]],
};

const LOCKS = {
  front: [[107, 62, 74, 91], [112, 163, 64, 86]],
  "front-right": [[118, 58, 78, 100], [105, 168, 58, 84]],
  right: [[143, 55, 75, 95], [111, 166, 55, 80]],
  "rear-right": [[80, 45, 120, 150]],
  rear: [[92, 40, 104, 215]],
  "rear-left": [[88, 45, 120, 150]],
  left: [[70, 55, 75, 95], [122, 166, 55, 80]],
  "front-left": [[92, 58, 78, 100], [125, 168, 58, 84]],
};

const WARPS = {
  front: [
    { x: 97, y: 157, radiusX: 66, radiusY: 108, moveX: 6, moveY: -14 },
    { x: 191, y: 157, radiusX: 66, radiusY: 108, moveX: -6, moveY: -14 },
  ],
  "front-right": [
    { x: 143, y: 190, radiusX: 62, radiusY: 98, moveX: 4, moveY: -13 },
    { x: 211, y: 157, radiusX: 62, radiusY: 100, moveX: -5, moveY: -15 },
  ],
  right: [],
  "rear-right": [{ x: 225, y: 171, radiusX: 62, radiusY: 104, moveX: -4, moveY: -14 }],
  rear: [
    { x: 70, y: 180, radiusX: 62, radiusY: 108, moveX: 5, moveY: -14 },
    { x: 218, y: 180, radiusX: 62, radiusY: 108, moveX: -5, moveY: -14 },
  ],
  "rear-left": [{ x: 63, y: 171, radiusX: 62, radiusY: 104, moveX: 4, moveY: -14 }],
  left: [],
  "front-left": [
    { x: 145, y: 190, radiusX: 62, radiusY: 98, moveX: -4, moveY: -13 },
    { x: 77, y: 157, radiusX: 62, radiusY: 100, moveX: 5, moveY: -15 },
  ],
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const diagonalDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= diagonalDistance ? left : aboveDistance <= diagonalDistance ? above : upperLeft;
}

export function decodePng(path) {
  const png = readFileSync(path);
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${path} is not a PNG`);
  let offset = 8;
  let width;
  let height;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`${path} must be an 8-bit, non-interlaced RGBA PNG`);
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  const filtered = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[y * (stride + 1)];
    const rowStart = y * stride;
    const filteredStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[filteredStart + x];
      const left = x >= 4 ? pixels[rowStart + x - 4] : 0;
      const above = y > 0 ? pixels[rowStart - stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[rowStart - stride + x - 4] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : null;
      if (predictor === null) throw new Error(`${path} uses unsupported PNG filter ${filter}`);
      pixels[rowStart + x] = (raw + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

export function encodePng({ width, height, pixels }) {
  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) pixels.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(filtered, { level: 9 })), pngChunk("IEND", Buffer.alloc(0))]);
}

function insideRectangles(x, y, rectangles) {
  return rectangles.some(([left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height);
}

export function isGuardEditAllowed(direction, x, y) {
  return insideRectangles(x, y, ZONES[direction]);
}

function rectangleStrength(x, y, [left, top, width, height], feather) {
  if (x < left || x >= left + width || y < top || y >= top + height) return 0;
  const edgeDistance = Math.min(x - left + 1, left + width - x, y - top + 1, top + height - y);
  return Math.min(1, edgeDistance / feather);
}

function editStrength(direction, x, y) {
  const zoneStrength = Math.max(...ZONES[direction].map((rectangle) => rectangleStrength(x, y, rectangle, 12)));
  const lockStrength = Math.max(...LOCKS[direction].map((rectangle) => rectangleStrength(x, y, rectangle, 14)));
  return zoneStrength * (1 - lockStrength);
}

function warpWeight(x, y, warp) {
  const distance = ((x - warp.x) / warp.radiusX) ** 2 + ((y - warp.y) / warp.radiusY) ** 2;
  return distance >= 1 ? 0 : (1 - distance) ** 2;
}

function sampleRgba(image, x, y) {
  const left = Math.max(0, Math.min(image.width - 1, Math.floor(x)));
  const top = Math.max(0, Math.min(image.height - 1, Math.floor(y)));
  const right = Math.min(image.width - 1, left + 1);
  const bottom = Math.min(image.height - 1, top + 1);
  const horizontal = x - Math.floor(x);
  const vertical = y - Math.floor(y);
  const samples = [
    [left, top, (1 - horizontal) * (1 - vertical)],
    [right, top, horizontal * (1 - vertical)],
    [left, bottom, (1 - horizontal) * vertical],
    [right, bottom, horizontal * vertical],
  ];
  let alpha = 0;
  const premultiplied = [0, 0, 0];
  for (const [sampleX, sampleY, weight] of samples) {
    const index = (sampleY * image.width + sampleX) * 4;
    const sampleAlpha = image.pixels[index + 3] / 255;
    alpha += sampleAlpha * weight;
    for (let channel = 0; channel < 3; channel += 1) premultiplied[channel] += image.pixels[index + channel] * sampleAlpha * weight;
  }
  return [
    alpha ? Math.round(premultiplied[0] / alpha) : 0,
    alpha ? Math.round(premultiplied[1] / alpha) : 0,
    alpha ? Math.round(premultiplied[2] / alpha) : 0,
    Math.round(alpha * 255),
  ];
}

export function composeGuard(direction, idle) {
  if (idle.width !== 288 || idle.height !== 696) throw new Error("Guard sources must use the standardized 288x696 frame");
  const pixels = Buffer.from(idle.pixels);
  // At exact profile, the approved idle already reads as a compact guard. Reuse
  // it verbatim so the glove silhouette is never stretched by a mesh warp.
  if (direction === "right" || direction === "left") {
    return { width: idle.width, height: idle.height, pixels };
  }
  for (let y = 0; y < idle.height; y += 1) {
    for (let x = 0; x < idle.width; x += 1) {
      if (!isGuardEditAllowed(direction, x, y)) continue;
      let sourceOffsetX = 0;
      let sourceOffsetY = 0;
      for (const warp of WARPS[direction]) {
        const weight = warpWeight(x, y, warp);
        sourceOffsetX -= warp.moveX * weight;
        sourceOffsetY -= warp.moveY * weight;
      }
      const strength = editStrength(direction, x, y);
      sourceOffsetX *= strength;
      sourceOffsetY *= strength;
      if (Math.abs(sourceOffsetX) < 0.001 && Math.abs(sourceOffsetY) < 0.001) continue;
      const sample = sampleRgba(idle, x + sourceOffsetX, y + sourceOffsetY);
      const index = (y * idle.width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) pixels[index + channel] = sample[channel];
    }
  }
  return { width: idle.width, height: idle.height, pixels };
}

function main() {
  const scriptRoot = dirname(fileURLToPath(import.meta.url));
  const projectRoot = dirname(scriptRoot);
  const directions = process.argv.slice(2).length ? process.argv.slice(2) : DIRECTIONS;
  const outputRoot = join(projectRoot, "review", "maddie-bloom", "sprites", "guard-v3");
  mkdirSync(outputRoot, { recursive: true });
  for (const direction of directions) {
    const idle = decodePng(join(projectRoot, "assets", "characters", "maddie-bloom", "sprites", "idle", `${direction}.png`));
    const outputPath = join(outputRoot, `${direction}.png`);
    writeFileSync(outputPath, encodePng(composeGuard(direction, idle)));
    console.log(`${direction} -> ${outputPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
