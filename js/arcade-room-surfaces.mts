// Drawing the room's surfaces: a catalog `SurfaceStyle` becomes a canvas
// texture and a THREE material.
//
// This is the only place a pattern name means anything. Every pattern is
// drawn onto one square tile that repeats across the surface; the catalog's
// `repeat` is tiles per 20 m so the same style looks the same on a 20 m wall
// and a 4.8 m tall one. Drawings are deterministic (a seeded generator, no
// `Math.random`) so a room looks the same every visit.

import type { SurfacePattern, SurfaceStyle } from "./arcade-room-catalog/surfaces.mjs";

type ThreeNamespace = Record<string, any>;
type Draw = (context: CanvasRenderingContext2D, size: number, colors: readonly string[]) => void;

const TILE = 512;
const SPAN = 20;

/** Small deterministic generator so speckle patterns do not change between frames or visits. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function color(colors: readonly string[], index: number): string {
  return colors[index] ?? colors[0] ?? "#888888";
}

function fill(context: CanvasRenderingContext2D, size: number, style: string): void {
  context.fillStyle = style;
  context.fillRect(0, 0, size, size);
}

function speckle(context: CanvasRenderingContext2D, size: number, count: number, seed: number, paint: (random: () => number) => string, radius: number): void {
  const random = seeded(seed);
  for (let index = 0; index < count; index += 1) {
    context.fillStyle = paint(random);
    const x = random() * size;
    const y = random() * size;
    context.beginPath();
    context.arc(x, y, radius * (0.5 + random()), 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * Draw a shape at (x, y) and again across whichever tile edges it reaches, so
 * an organic pattern (blades, clods, patches) wraps seamlessly when repeated.
 */
function wrapped(context: CanvasRenderingContext2D, size: number, x: number, y: number, reach: number, draw: (x: number, y: number) => void): void {
  const xs = [x];
  const ys = [y];
  if (x < reach) xs.push(x + size);
  if (x > size - reach) xs.push(x - size);
  if (y < reach) ys.push(y + size);
  if (y > size - reach) ys.push(y - size);
  for (const wx of xs) for (const wy of ys) draw(wx, wy);
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

const PATTERNS: Record<SurfacePattern, Draw> = {
  "solid": (context, size, colors) => {
    fill(context, size, color(colors, 0));
  },
  "checker": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    context.fillStyle = color(colors, 1);
    context.fillRect(0, 0, size / 2, size / 2);
    context.fillRect(size / 2, size / 2, size / 2, size / 2);
    // A hairline grout so the squares read as tiles rather than a flat print.
    context.strokeStyle = "rgba(0,0,0,.18)";
    context.lineWidth = 3;
    context.strokeRect(0, 0, size / 2, size / 2);
    context.strokeRect(size / 2, size / 2, size / 2, size / 2);
    context.strokeRect(size / 2, 0, size / 2, size / 2);
    context.strokeRect(0, size / 2, size / 2, size / 2);
  },
  "planks": (context, size, colors) => {
    const random = seeded(7);
    const rows = 4;
    const rowHeight = size / rows;
    for (let row = 0; row < rows; row += 1) {
      const offset = (row % 2) * size / 2;
      for (const start of [-size / 2 + offset, offset, size / 2 + offset]) {
        const shade = random();
        context.fillStyle = shade < 0.33 ? color(colors, 0) : shade < 0.66 ? color(colors, 1) : color(colors, 2);
        context.fillRect(start, row * rowHeight, size / 2, rowHeight);
        // Grain lines.
        context.strokeStyle = "rgba(0,0,0,.12)";
        context.lineWidth = 1;
        for (let line = 0; line < 5; line += 1) {
          const y = row * rowHeight + rowHeight * (0.15 + line * 0.17) + random() * 4;
          context.beginPath();
          context.moveTo(start + 4, y);
          context.lineTo(start + size / 2 - 4, y + random() * 3);
          context.stroke();
        }
        context.strokeStyle = "rgba(0,0,0,.45)";
        context.lineWidth = 3;
        context.strokeRect(start, row * rowHeight, size / 2, rowHeight);
      }
    }
  },
  "tiles": (context, size, colors) => {
    fill(context, size, color(colors, 1));
    const cell = size / 2;
    const gap = 6;
    const random = seeded(3);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        context.fillStyle = color(colors, 0);
        context.fillRect(x * cell + gap / 2, y * cell + gap / 2, cell - gap, cell - gap);
        context.fillStyle = `rgba(255,255,255,${0.02 + random() * 0.05})`;
        context.fillRect(x * cell + gap / 2, y * cell + gap / 2, cell - gap, cell - gap);
      }
    }
  },
  "hex": (context, size, colors) => {
    fill(context, size, color(colors, 1));
    const radius = size / 6;
    const width = Math.sqrt(3) * radius;
    const height = radius * 1.5;
    context.fillStyle = color(colors, 0);
    context.strokeStyle = color(colors, 1);
    context.lineWidth = 4;
    for (let row = -1; row <= size / height + 1; row += 1) {
      for (let col = -1; col <= size / width + 1; col += 1) {
        const cx = col * width + (row % 2 ? width / 2 : 0);
        const cy = row * height;
        context.beginPath();
        for (let corner = 0; corner < 6; corner += 1) {
          const angle = Math.PI / 6 + corner * Math.PI / 3;
          context.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
        }
        context.closePath();
        context.fill();
        context.stroke();
      }
    }
  },
  "carpet": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    speckle(context, size, 9000, 11, (random) => (random() < 0.5 ? withAlpha(color(colors, 1), 0.9) : "rgba(0,0,0,.18)"), 1.4);
  },
  "galaxy-carpet": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    speckle(context, size, 5000, 13, () => "rgba(255,255,255,.08)", 1.2);
    const random = seeded(29);
    // The classic arcade carpet: neon squiggles, triangles and dots on a navy field.
    for (let index = 0; index < 60; index += 1) {
      const accent = color(colors, 1 + Math.floor(random() * 3));
      context.strokeStyle = accent;
      context.fillStyle = accent;
      context.lineWidth = 5;
      const x = random() * size;
      const y = random() * size;
      const kind = random();
      if (kind < 0.35) {
        context.beginPath();
        context.moveTo(x, y);
        context.bezierCurveTo(x + 30, y - 40, x + 50, y + 40, x + 90, y);
        context.stroke();
      } else if (kind < 0.7) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 34, y + 8);
        context.lineTo(x + 10, y + 36);
        context.closePath();
        context.fill();
      } else {
        context.beginPath();
        context.arc(x, y, 7, 0, Math.PI * 2);
        context.fill();
      }
    }
  },
  "concrete": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    speckle(context, size, 7000, 17, (random) => (random() < 0.5 ? withAlpha(color(colors, 1), 0.5) : "rgba(0,0,0,.14)"), 1.8);
    const random = seeded(19);
    context.strokeStyle = "rgba(0,0,0,.22)";
    context.lineWidth = 1.5;
    for (let index = 0; index < 6; index += 1) {
      context.beginPath();
      context.moveTo(random() * size, random() * size);
      context.lineTo(random() * size, random() * size);
      context.stroke();
    }
  },
  "diamond-plate": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    const step = size / 8;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const cx = x * step + step / 2;
        const cy = y * step + step / 2;
        context.save();
        context.translate(cx, cy);
        context.rotate((x + y) % 2 ? Math.PI / 4 : -Math.PI / 4);
        context.fillStyle = color(colors, 1);
        context.fillRect(-step * 0.32, -step * 0.09, step * 0.64, step * 0.18);
        context.fillStyle = "rgba(0,0,0,.35)";
        context.fillRect(-step * 0.32, step * 0.05, step * 0.64, step * 0.05);
        context.restore();
      }
    }
  },
  "neon-grid": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    const cell = size / 4;
    context.strokeStyle = color(colors, 1);
    context.shadowColor = color(colors, 1);
    context.shadowBlur = 14;
    context.lineWidth = 4;
    for (let index = 0; index <= 4; index += 1) {
      context.beginPath();
      context.moveTo(index * cell, 0);
      context.lineTo(index * cell, size);
      context.moveTo(0, index * cell);
      context.lineTo(size, index * cell);
      context.stroke();
    }
  },
  "terrazzo": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    const random = seeded(23);
    for (let index = 0; index < 220; index += 1) {
      context.fillStyle = color(colors, 1 + Math.floor(random() * 3));
      const x = random() * size;
      const y = random() * size;
      context.beginPath();
      context.moveTo(x, y);
      for (let corner = 0; corner < 5; corner += 1) {
        context.lineTo(x + (random() - 0.5) * 26, y + (random() - 0.5) * 26);
      }
      context.closePath();
      context.fill();
    }
  },
  "stripes": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    context.fillStyle = color(colors, 1);
    const stripe = size / 16;
    for (let index = 0; index < 8; index += 1) context.fillRect(index * stripe * 2, 0, stripe / 3, size);
  },
  "chevron": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    context.fillStyle = color(colors, 1);
    const band = size / 4;
    for (let row = -1; row < 5; row += 1) {
      context.beginPath();
      context.moveTo(0, row * band);
      context.lineTo(size / 2, row * band + band / 2);
      context.lineTo(size, row * band);
      context.lineTo(size, row * band + band / 2.2);
      context.lineTo(size / 2, row * band + band / 2 + band / 2.2);
      context.lineTo(0, row * band + band / 2.2);
      context.closePath();
      context.fill();
    }
  },
  "brick": (context, size, colors) => {
    fill(context, size, color(colors, 2));
    const rows = 8;
    const rowHeight = size / rows;
    const brickWidth = size / 4;
    const random = seeded(31);
    for (let row = 0; row < rows; row += 1) {
      const offset = (row % 2) * brickWidth / 2;
      for (let col = -1; col <= 4; col += 1) {
        context.fillStyle = random() < 0.7 ? color(colors, 0) : color(colors, 1);
        context.fillRect(col * brickWidth + offset + 4, row * rowHeight + 4, brickWidth - 8, rowHeight - 8);
      }
    }
    speckle(context, size, 1500, 37, () => "rgba(0,0,0,.12)", 1.5);
  },
  "cinderblock": (context, size, colors) => {
    fill(context, size, color(colors, 1));
    const rows = 4;
    const rowHeight = size / rows;
    const blockWidth = size / 2;
    for (let row = 0; row < rows; row += 1) {
      const offset = (row % 2) * blockWidth / 2;
      for (let col = -1; col <= 2; col += 1) {
        context.fillStyle = color(colors, 0);
        context.fillRect(col * blockWidth + offset + 5, row * rowHeight + 5, blockWidth - 10, rowHeight - 10);
      }
    }
    speckle(context, size, 4000, 41, () => "rgba(0,0,0,.1)", 1.6);
  },
  "memphis": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    const random = seeded(43);
    for (let index = 0; index < 34; index += 1) {
      const accent = color(colors, 1 + Math.floor(random() * 3));
      context.fillStyle = accent;
      context.strokeStyle = accent;
      context.lineWidth = 6;
      const x = random() * size;
      const y = random() * size;
      const kind = random();
      if (kind < 0.3) {
        context.beginPath();
        context.arc(x, y, 12 + random() * 10, 0, Math.PI * 2);
        context.fill();
      } else if (kind < 0.6) {
        context.save();
        context.translate(x, y);
        context.rotate(random() * Math.PI);
        context.fillRect(-30, -6, 60, 12);
        context.restore();
      } else if (kind < 0.8) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 40, y + 10);
        context.lineTo(x + 12, y + 44);
        context.closePath();
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(x, y);
        context.quadraticCurveTo(x + 25, y - 30, x + 50, y);
        context.quadraticCurveTo(x + 75, y + 30, x + 100, y);
        context.stroke();
      }
    }
    // Confetti dots in the field colour's shadow.
    speckle(context, size, 300, 47, () => "rgba(0,0,0,.25)", 1.8);
  },
  "diamonds": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    context.fillStyle = color(colors, 1);
    const half = size / 2;
    for (const [cx, cy] of [[half, 0], [0, half], [size, half], [half, size]]) {
      context.beginPath();
      context.moveTo(cx, cy - half);
      context.lineTo(cx + half, cy);
      context.lineTo(cx, cy + half);
      context.lineTo(cx - half, cy);
      context.closePath();
      context.fill();
    }
    context.strokeStyle = "rgba(255,255,255,.08)";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, half);
    context.lineTo(half, 0);
    context.lineTo(size, half);
    context.lineTo(half, size);
    context.closePath();
    context.stroke();
  },
  "wainscot": (context, size, colors) => {
    // Upper half painted, lower half panelled timber with a chair rail between.
    fill(context, size, color(colors, 0));
    context.fillStyle = color(colors, 1);
    context.fillRect(0, size * 0.55, size, size * 0.45);
    context.fillStyle = color(colors, 2);
    context.fillRect(0, size * 0.53, size, size * 0.04);
    context.fillRect(0, size * 0.96, size, size * 0.04);
    const panel = size / 3;
    for (let index = 0; index < 3; index += 1) {
      context.strokeStyle = color(colors, 2);
      context.lineWidth = 5;
      context.strokeRect(index * panel + 18, size * 0.62, panel - 36, size * 0.28);
    }
  },
  "acoustic": (context, size, colors) => {
    fill(context, size, color(colors, 1));
    const cell = size / 2;
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        context.fillStyle = color(colors, 0);
        context.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
      }
    }
    speckle(context, size, 2500, 53, () => "rgba(0,0,0,.16)", 1.6);
  },
  "panels": (context, size, colors) => {
    fill(context, size, color(colors, 1));
    const cell = size / 2;
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        context.fillStyle = color(colors, 0);
        context.fillRect(x * cell + 8, y * cell + 8, cell - 16, cell - 16);
        context.fillStyle = "rgba(0,0,0,.4)";
        for (const [dx, dy] of [[18, 18], [cell - 18, 18], [18, cell - 18], [cell - 18, cell - 18]]) {
          context.beginPath();
          context.arc(x * cell + dx, y * cell + dy, 4, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  },
  "starfield": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    speckle(context, size, 260, 59, (random) => (random() < 0.8 ? color(colors, 1) : color(colors, 2)), 1.4);
    speckle(context, size, 14, 61, () => withAlpha(color(colors, 2), 0.35), 4);
  },
  // Parquet: two interleaved runs of blocks at 45deg. The tile is drawn oversized and
  // rotated so the zig-zag wraps seamlessly on a square repeat.
  "herringbone": (context, size, colors) => {
    fill(context, size, color(colors, 1));
    const random = seeded(67);
    const blockLength = size / 4;
    const blockWidth = blockLength / 4;
    context.save();
    context.translate(size / 2, size / 2);
    context.rotate(Math.PI / 4);
    const reach = size;
    for (let row = -8; row <= 8; row += 1) {
      for (let col = -8; col <= 8; col += 1) {
        const shade = random();
        context.fillStyle = shade < 0.33 ? color(colors, 0) : shade < 0.66 ? color(colors, 1) : color(colors, 2);
        const x = col * blockLength - reach / 2;
        const y = row * blockWidth * 2 - reach / 2;
        // Horizontal block, then the vertical one that tucks under its end.
        context.fillRect(x + 2, y + 2, blockLength - 4, blockWidth - 4);
        context.fillStyle = random() < 0.5 ? color(colors, 0) : color(colors, 2);
        context.fillRect(x + blockLength - blockWidth + 2, y + blockWidth + 2, blockWidth - 4, blockLength - 4);
      }
    }
    context.restore();
  },
  // Veined stone: a base, a handful of soft wandering veins in the second colour, and a few
  // sharp hairlines in the third.
  "marble": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    const random = seeded(71);
    const vein = (stroke: string, width: number, alpha: number, count: number) => {
      context.strokeStyle = withAlpha(stroke, alpha);
      context.lineWidth = width;
      context.lineCap = "round";
      for (let index = 0; index < count; index += 1) {
        let x = random() * size;
        let y = random() * size;
        context.beginPath();
        context.moveTo(x, y);
        for (let step = 0; step < 14; step += 1) {
          x += (random() - 0.5) * 90;
          y += (random() - 0.5) * 90;
          context.lineTo(x, y);
        }
        context.stroke();
      }
    };
    context.filter = "blur(6px)";
    vein(color(colors, 1), 18, 0.35, 7);
    context.filter = "blur(2px)";
    vein(color(colors, 1), 5, 0.5, 9);
    context.filter = "none";
    vein(color(colors, 2), 1.2, 0.8, 6);
    speckle(context, size, 900, 73, () => withAlpha(color(colors, 1), 0.08), 1.2);
  },
  // Diagonal warning stripes, wrapped so the tile repeats without a seam.
  "hazard": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    context.fillStyle = color(colors, 1);
    const band = size / 4;
    for (let index = -1; index < 5; index += 1) {
      context.beginPath();
      context.moveTo(index * band, 0);
      context.lineTo(index * band + band / 2, 0);
      context.lineTo(index * band + band / 2 + size, size);
      context.lineTo(index * band + size, size);
      context.closePath();
      context.fill();
    }
    speckle(context, size, 1200, 79, () => "rgba(0,0,0,.14)", 1.6);
  },
  // Running-bond 2:1 tiles with a grout line and a glazed highlight along each top edge.
  "subway": (context, size, colors) => {
    fill(context, size, color(colors, 1));
    const rows = 6;
    const rowHeight = size / rows;
    const tileWidth = size / 3;
    const gap = 5;
    for (let row = 0; row < rows; row += 1) {
      const offset = (row % 2) * tileWidth / 2;
      for (let col = -1; col <= 3; col += 1) {
        const x = col * tileWidth + offset;
        const y = row * rowHeight;
        context.fillStyle = color(colors, 0);
        context.fillRect(x + gap / 2, y + gap / 2, tileWidth - gap, rowHeight - gap);
        context.fillStyle = "rgba(255,255,255,.16)";
        context.fillRect(x + gap / 2, y + gap / 2, tileWidth - gap, 5);
        context.fillStyle = "rgba(0,0,0,.14)";
        context.fillRect(x + gap / 2, y + rowHeight - gap / 2 - 4, tileWidth - gap, 4);
      }
    }
  },
  // Plaid: broad bands both ways in the second colour, fine over-check in the third.
  "tartan": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    const band = size / 4;
    context.fillStyle = withAlpha(color(colors, 1), 0.75);
    for (let index = 0; index < 2; index += 1) {
      context.fillRect(index * band * 2 + band / 2, 0, band, size);
      context.fillRect(0, index * band * 2 + band / 2, size, band);
    }
    context.fillStyle = withAlpha(color(colors, 2), 0.55);
    for (let index = 0; index < 4; index += 1) {
      context.fillRect(index * band + band - 6, 0, 4, size);
      context.fillRect(0, index * band + band - 6, size, 4);
    }
    speckle(context, size, 6000, 83, () => "rgba(0,0,0,.1)", 1.1);
  },
  // Printed circuit: traces that walk in right-angle steps between solder pads, glowing.
  "circuit": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    const random = seeded(89);
    const cell = size / 16;
    context.strokeStyle = color(colors, 2);
    context.lineWidth = 4;
    context.lineCap = "round";
    context.shadowColor = color(colors, 1);
    context.shadowBlur = 8;
    for (let index = 0; index < 26; index += 1) {
      let x = Math.floor(random() * 16) * cell;
      let y = Math.floor(random() * 16) * cell;
      context.beginPath();
      context.moveTo(x, y);
      for (let step = 0; step < 5; step += 1) {
        if (random() < 0.5) x += (Math.floor(random() * 5) - 2) * cell;
        else y += (Math.floor(random() * 5) - 2) * cell;
        context.lineTo(x, y);
      }
      context.stroke();
      context.fillStyle = color(colors, 1);
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
    context.fillStyle = color(colors, 1);
    for (let index = 0; index < 18; index += 1) {
      context.fillRect(Math.floor(random() * 16) * cell - 5, Math.floor(random() * 16) * cell - 5, 10, 10);
    }
  },
  // Colours: base green, shadow green, highlight green, bare-earth brown.
  "grass": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    // Soft patchiness first so the field is not one flat tone.
    const patches = seeded(41);
    for (let index = 0; index < 40; index += 1) {
      context.fillStyle = withAlpha(patches() < 0.6 ? color(colors, 1) : color(colors, 3), 0.16 + patches() * 0.14);
      const rx = 30 + patches() * 90;
      const ry = 20 + patches() * 60;
      const spin = patches() * Math.PI;
      wrapped(context, size, patches() * size, patches() * size, 120, (x, y) => {
        context.beginPath();
        context.ellipse(x, y, rx, ry, spin, 0, Math.PI * 2);
        context.fill();
      });
    }
    // Then blades: short strokes leaning every which way, darker in the shade, lit on top.
    const random = seeded(43);
    context.lineCap = "round";
    for (let index = 0; index < 5200; index += 1) {
      const length = 5 + random() * 11;
      const lean = (random() - 0.5) * 8;
      const tone = random();
      context.strokeStyle = tone < 0.45 ? color(colors, 1) : tone < 0.85 ? color(colors, 0) : color(colors, 2);
      context.lineWidth = 1.2 + random() * 1.3;
      wrapped(context, size, random() * size, random() * size, 18, (x, y) => {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + lean, y - length);
        context.stroke();
      });
    }
  },
  // Colours: base earth, shadow earth, dry highlight, weed green.
  "dirt": (context, size, colors) => {
    fill(context, size, color(colors, 0));
    const patches = seeded(47);
    for (let index = 0; index < 36; index += 1) {
      context.fillStyle = withAlpha(patches() < 0.5 ? color(colors, 1) : color(colors, 2), 0.18 + patches() * 0.18);
      const rx = 24 + patches() * 80;
      const ry = 16 + patches() * 48;
      const spin = patches() * Math.PI;
      wrapped(context, size, patches() * size, patches() * size, 104, (x, y) => {
        context.beginPath();
        context.ellipse(x, y, rx, ry, spin, 0, Math.PI * 2);
        context.fill();
      });
    }
    // Clods and pebbles, then the odd tuft of weed poking through.
    const clods = seeded(53);
    for (let index = 0; index < 2600; index += 1) {
      context.fillStyle = withAlpha(clods() < 0.5 ? color(colors, 1) : color(colors, 2), 0.7);
      const radius = 2.2 * (0.5 + clods());
      wrapped(context, size, clods() * size, clods() * size, 5, (x, y) => {
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      });
    }
    const random = seeded(59);
    context.lineCap = "round";
    context.lineWidth = 1.4;
    context.strokeStyle = color(colors, 3);
    for (let index = 0; index < 220; index += 1) {
      const tuft: Array<readonly [number, number]> = [];
      for (let blade = 0; blade < 3; blade += 1) tuft.push([(random() - 0.5) * 8, -4 - random() * 7]);
      wrapped(context, size, random() * size, random() * size, 12, (x, y) => {
        for (const [dx, dy] of tuft) {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + dx, y + dy);
          context.stroke();
        }
      });
    }
  },
};

export function createSurfaceTexture(THREE: ThreeNamespace, style: SurfaceStyle): any {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is required to draw room surfaces");
  PATTERNS[style.pattern](context, TILE, style.colors);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * A material for one surface spanning `spanU` by `spanV` metres. Solid styles
 * skip the texture entirely: a flat colour needs no canvas.
 */
export function createSurfaceMaterial(THREE: ThreeNamespace, style: SurfaceStyle, span: Readonly<{ u: number; v: number }>): any {
  const material = new THREE.MeshStandardMaterial({
    color: style.pattern === "solid" ? style.colors[0] : "#ffffff",
    roughness: style.roughness,
    metalness: style.metalness,
  });
  if (style.pattern !== "solid") {
    const texture = createSurfaceTexture(THREE, style);
    texture.repeat.set(style.repeat * span.u / SPAN, style.repeat * span.v / SPAN);
    material.map = texture;
  }
  if (style.emissive) {
    material.emissive = new THREE.Color(style.emissive);
    material.emissiveIntensity = style.emissiveIntensity ?? 1;
  }
  return material;
}

/** Swap a mesh's material for a new surface, releasing the old texture. */
export function applySurfaceMaterial(THREE: ThreeNamespace, mesh: any, style: SurfaceStyle, span: Readonly<{ u: number; v: number }>): void {
  const previous = mesh.material;
  mesh.material = createSurfaceMaterial(THREE, style, span);
  previous?.map?.dispose?.();
  previous?.dispose?.();
}
