// The farm's materials: wood, stone, metal, tile, straw and leaf, drawn onto
// canvas tiles and handed out as lit THREE materials.
//
// A flat colour on a box reads as a placeholder no matter how carefully the
// box is placed. This is what turns the farm's primitives into things: every
// material here is a COLOUR tile plus a matching HEIGHT tile (a bump map), so
// planks have grain and gaps, shingles step, stone has mortar and metal has
// ribs, under the same sun and shadows as everything else. No art assets —
// every tile is drawn deterministically (seeded, never `Math.random`) so a
// farm looks the same every visit and under every thumbnail.
//
// TILES ARE IN METRES. A material carries `metresPerTile`, and the mesh
// helpers here (`tbox`, `tcylinder`, `metricUvs`) rewrite a geometry's UVs
// so one tile covers that many metres of surface whatever the mesh's size —
// a 7 m barn wall and a 0.3 m plank get boards of the same width, and the
// pattern never stretches. `box()` from the room's primitives keeps its 0..1
// UVs, which is why the farm draws with these wrappers instead.
//
// Materials are cached by kind and colours, so a farm of ten buildings pays
// for each texture once. Under node (no canvas) `farmMaterial` degrades to a
// plain coloured material, which is what lets the builders run in the
// fixture tests unchanged.

export type ThreeNamespace = Record<string, any>;

export type FarmTextureKind =
  | "planks"        // horizontal lapped siding: boards, gaps, grain, the odd knot
  | "battens"       // vertical board-and-batten: wide boards under raised battens
  | "shingles"      // staggered wooden shingles (grey colours make slate)
  | "clay-tiles"    // rows of half-round terracotta tiles
  | "corrugated"    // ribbed sheet metal with panel seams and rust runs
  | "fieldstone"    // irregular stones in mortar
  | "plaster"       // stucco with a little grit and a hairline crack or two
  | "brick"         // running-bond brick
  | "galvanised"    // spangled sheet steel with horizontal seams
  | "wood"          // plain grain along the surface: beams, rails, barrels
  | "straw"         // hay and straw strands
  | "bark"          // a trunk's fissured bark
  | "foliage"       // leaf clusters for canopies and hedges
  | "soil";         // turned earth

export type FarmMaterialOptions = Readonly<{
  /** The pattern's palette, in the order the drawer documents; missing entries fall back to the kind's defaults. */
  colors?: readonly string[];
  /** Metres one tile covers; the kind's default keeps boards and bricks at a real size. */
  metresPerTile?: number;
  roughness?: number;
  metalness?: number;
  /** How strongly the height tile shows; the kind's default suits its relief. */
  bumpScale?: number;
  /** Render both faces (a thin roof slab seen from under the eaves). */
  doubleSided?: boolean;
}>;

type Drawer = (colour: CanvasRenderingContext2D, height: CanvasRenderingContext2D, size: number, colors: readonly string[], random: () => number) => void;

type KindSpec = Readonly<{
  colors: readonly string[];
  metresPerTile: number;
  roughness: number;
  metalness: number;
  bumpScale: number;
  draw: Drawer;
}>;

const TILE = 512;

function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function parse(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `hex` moved toward white (positive) or black (negative) by `amount` in 0..1. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  const mix = (channel: number): string => Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount)).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function grey(value: number): string {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  return `rgb(${v}, ${v}, ${v})`;
}

function fill(context: CanvasRenderingContext2D, size: number, style: string): void {
  context.fillStyle = style;
  context.fillRect(0, 0, size, size);
}

/** Draw at (x, y) and again across whichever tile edges lie within `reach`, so the tile wraps. */
function wrapped(size: number, x: number, y: number, reach: number, draw: (x: number, y: number) => void): void {
  const xs = [x];
  const ys = [y];
  if (x < reach) xs.push(x + size);
  if (x > size - reach) xs.push(x - size);
  if (y < reach) ys.push(y + size);
  if (y > size - reach) ys.push(y - size);
  for (const wx of xs) for (const wy of ys) draw(wx, wy);
}

/** Fine grain along `along` ("x" or "y") over a rectangle: many faint streaks in the two grain colours. */
function grain(colour: CanvasRenderingContext2D, height: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, along: "x" | "y", dark: string, light: string, random: () => number, density = 1): void {
  const count = Math.round((along === "x" ? h : w) / 3 * density);
  colour.lineCap = "round";
  for (let index = 0; index < count; index += 1) {
    const tone = random();
    colour.strokeStyle = rgba(tone < 0.6 ? dark : light, 0.12 + random() * 0.18);
    colour.lineWidth = 0.6 + random() * 1.4;
    const offset = random();
    const wobble = (random() - 0.5) * 6;
    colour.beginPath();
    if (along === "x") {
      const yy = y + offset * h;
      colour.moveTo(x, yy);
      colour.bezierCurveTo(x + w * 0.3, yy + wobble, x + w * 0.7, yy - wobble, x + w, yy);
    } else {
      const xx = x + offset * w;
      colour.moveTo(xx, y);
      colour.bezierCurveTo(xx + wobble, y + h * 0.3, xx - wobble, y + h * 0.7, xx, y + h);
    }
    colour.stroke();
    if (random() < 0.3) {
      height.strokeStyle = grey(tone < 0.6 ? 118 : 138);
      height.lineWidth = colour.lineWidth;
      height.beginPath();
      if (along === "x") {
        const yy = y + offset * h;
        height.moveTo(x, yy);
        height.lineTo(x + w, yy);
      } else {
        const xx = x + offset * w;
        height.moveTo(xx, y);
        height.lineTo(xx, y + h);
      }
      height.stroke();
    }
  }
}

function knot(colour: CanvasRenderingContext2D, height: CanvasRenderingContext2D, x: number, y: number, r: number, dark: string): void {
  colour.fillStyle = rgba(dark, 0.55);
  colour.beginPath();
  colour.ellipse(x, y, r, r * 0.7, 0.2, 0, Math.PI * 2);
  colour.fill();
  colour.strokeStyle = rgba(dark, 0.35);
  colour.lineWidth = 1.5;
  colour.beginPath();
  colour.ellipse(x, y, r * 1.8, r * 1.3, 0.2, 0, Math.PI * 2);
  colour.stroke();
  height.fillStyle = grey(100);
  height.beginPath();
  height.ellipse(x, y, r, r * 0.7, 0.2, 0, Math.PI * 2);
  height.fill();
}

/** Colours: board, grain dark, grain light, gap shadow. */
const planks: Drawer = (colour, height, size, colors, random) => {
  const [board, dark, light, gap] = colors;
  fill(colour, size, gap!);
  fill(height, size, grey(70));
  const rows = 5;
  const rowH = size / rows;
  for (let row = 0; row < rows; row += 1) {
    const y = row * rowH;
    const tint = (random() - 0.5) * 0.16;
    colour.fillStyle = shade(board!, tint);
    colour.fillRect(0, y, size, rowH - 3);
    height.fillStyle = grey(150 + tint * 40);
    height.fillRect(0, y, size, rowH - 3);
    // The lower edge of a lapped board throws a shadow onto the one below.
    const shadow = colour.createLinearGradient(0, y + rowH - 16, 0, y + rowH - 3);
    shadow.addColorStop(0, "rgba(0,0,0,0)");
    shadow.addColorStop(1, "rgba(0,0,0,0.35)");
    colour.fillStyle = shadow;
    colour.fillRect(0, y + rowH - 16, size, 13);
    const lit = colour.createLinearGradient(0, y, 0, y + 6);
    lit.addColorStop(0, "rgba(255,255,255,0.18)");
    lit.addColorStop(1, "rgba(255,255,255,0)");
    colour.fillStyle = lit;
    colour.fillRect(0, y, size, 6);
    grain(colour, height, 0, y, size, rowH - 3, "x", dark!, light!, random, 0.9);
    // A joint somewhere along the board, staggered row to row.
    const joint = ((row * 0.37 + 0.2) % 1) * size;
    colour.fillStyle = rgba(gap!, 0.8);
    colour.fillRect(joint, y, 2, rowH - 3);
    height.fillStyle = grey(90);
    height.fillRect(joint, y, 2, rowH - 3);
    if (random() < 0.6) knot(colour, height, random() * size, y + rowH * (0.3 + random() * 0.4), 3 + random() * 4, dark!);
    // Nail heads at the joints.
    for (const nx of [joint - 8, joint + 10]) {
      colour.fillStyle = rgba(dark!, 0.7);
      colour.beginPath();
      colour.arc(((nx % size) + size) % size, y + rowH * 0.5, 1.6, 0, Math.PI * 2);
      colour.fill();
    }
  }
};

/** Colours: board, grain dark, grain light, batten. */
const battens: Drawer = (colour, height, size, colors, random) => {
  const [board, dark, light, batten] = colors;
  fill(colour, size, board!);
  fill(height, size, grey(128));
  const columns = 4;
  const colW = size / columns;
  for (let column = 0; column < columns; column += 1) {
    const x = column * colW;
    colour.fillStyle = shade(board!, (random() - 0.5) * 0.14);
    colour.fillRect(x, 0, colW, size);
    grain(colour, height, x, 0, colW, size, "y", dark!, light!, random, 0.8);
    if (random() < 0.5) knot(colour, height, x + colW * (0.3 + random() * 0.4), random() * size, 3 + random() * 3, dark!);
    // The batten over the seam, raised, with a shadow down one side.
    const bw = colW * 0.2;
    colour.fillStyle = shade(batten!, (random() - 0.5) * 0.1);
    colour.fillRect(x - bw / 2, 0, bw, size);
    if (column === 0) colour.fillRect(size - bw / 2, 0, bw, size);
    colour.fillStyle = "rgba(0,0,0,0.3)";
    colour.fillRect(x + bw / 2, 0, 5, size);
    colour.fillStyle = "rgba(255,255,255,0.14)";
    colour.fillRect(x - bw / 2, 0, 3, size);
    height.fillStyle = grey(200);
    height.fillRect(x - bw / 2, 0, bw, size);
    if (column === 0) height.fillRect(size - bw / 2, 0, bw, size);
    grain(colour, height, x - bw / 2, 0, bw, size, "y", dark!, light!, random, 0.5);
  }
};

/** Colours: shingle, shingle dark, shingle light, shadow. Grey colours make a slate roof. */
const shingles: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light, shadow] = colors;
  fill(colour, size, shadow!);
  fill(height, size, grey(60));
  const rows = 6;
  const rowH = size / rows;
  const perRow = 8;
  const w = size / perRow;
  // Draw from the top row down so each row overlaps the one below it; the top row is redrawn last at the bottom so the tile wraps.
  for (let row = -1; row < rows; row += 1) {
    const y = row * rowH;
    const offset = (row % 2 === 0 ? 0 : w / 2);
    for (let index = -1; index <= perRow; index += 1) {
      const x = index * w + offset;
      const tone = random();
      colour.fillStyle = shade(tone < 0.33 ? dark! : tone < 0.8 ? base! : light!, (random() - 0.5) * 0.12);
      const bottom = rowH * 1.25 + (random() - 0.5) * 6;
      colour.fillRect(x + 1.5, y, w - 3, bottom);
      height.fillStyle = grey(140 + tone * 30);
      height.fillRect(x + 1.5, y, w - 3, bottom);
      // Shade the exposed lower edge and the gap either side.
      const lower = colour.createLinearGradient(0, y + bottom - 14, 0, y + bottom);
      lower.addColorStop(0, "rgba(0,0,0,0)");
      lower.addColorStop(1, "rgba(0,0,0,0.42)");
      colour.fillStyle = lower;
      colour.fillRect(x + 1.5, y + bottom - 14, w - 3, 14);
      grain(colour, height, x + 1.5, y, w - 3, bottom, "y", dark!, light!, random, 0.35);
    }
  }
};

/** Colours: tile, tile dark, tile light, shadow. */
const clayTiles: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light, shadow] = colors;
  fill(colour, size, shadow!);
  fill(height, size, grey(60));
  const rows = 4;
  const rowH = size / rows;
  const columns = 6;
  const w = size / columns;
  for (let row = -1; row < rows; row += 1) {
    const y = row * rowH;
    for (let index = 0; index < columns; index += 1) {
      const x = index * w;
      const tone = shade(base!, (random() - 0.5) * 0.18);
      // A half-round tile: dark at the edges, lit along the crown.
      const curve = colour.createLinearGradient(x, 0, x + w, 0);
      curve.addColorStop(0, shade(dark!, -0.1));
      curve.addColorStop(0.35, tone);
      curve.addColorStop(0.5, shade(light!, 0.05));
      curve.addColorStop(0.7, tone);
      curve.addColorStop(1, shade(dark!, -0.2));
      colour.fillStyle = curve;
      colour.fillRect(x, y, w, rowH * 1.2);
      const relief = height.createLinearGradient(x, 0, x + w, 0);
      relief.addColorStop(0, grey(70));
      relief.addColorStop(0.5, grey(200));
      relief.addColorStop(1, grey(70));
      height.fillStyle = relief;
      height.fillRect(x, y, w, rowH * 1.2);
      // The lower lip throws a shadow on the row below.
      const lip = colour.createLinearGradient(0, y + rowH * 1.2 - 18, 0, y + rowH * 1.2);
      lip.addColorStop(0, "rgba(0,0,0,0)");
      lip.addColorStop(1, "rgba(0,0,0,0.5)");
      colour.fillStyle = lip;
      colour.fillRect(x, y + rowH * 1.2 - 18, w, 18);
      colour.fillStyle = "rgba(0,0,0,0.25)";
      colour.fillRect(x, y + rowH * 1.2 - 2, w, 2);
      // Weathering: a mossy or dusty patch now and then.
      if (random() < 0.25) {
        colour.fillStyle = rgba(random() < 0.5 ? "#6f7a4a" : "#c9b89a", 0.25);
        colour.beginPath();
        colour.ellipse(x + w / 2, y + rowH * (0.3 + random() * 0.6), w * 0.3, rowH * 0.15, 0, 0, Math.PI * 2);
        colour.fill();
      }
    }
  }
};

/** Colours: sheet, sheet dark, seam, rust. */
const corrugated: Drawer = (colour, height, size, colors, random) => {
  const [sheet, dark, seam, rust] = colors;
  fill(colour, size, sheet!);
  fill(height, size, grey(128));
  const ribs = 12;
  const w = size / ribs;
  for (let index = 0; index < ribs; index += 1) {
    const x = index * w;
    const curve = colour.createLinearGradient(x, 0, x + w, 0);
    curve.addColorStop(0, shade(dark!, -0.15));
    curve.addColorStop(0.3, shade(sheet!, 0.12));
    curve.addColorStop(0.5, shade(sheet!, 0.2));
    curve.addColorStop(0.75, sheet!);
    curve.addColorStop(1, shade(dark!, -0.15));
    colour.fillStyle = curve;
    colour.fillRect(x, 0, w, size);
    const relief = height.createLinearGradient(x, 0, x + w, 0);
    relief.addColorStop(0, grey(60));
    relief.addColorStop(0.5, grey(200));
    relief.addColorStop(1, grey(60));
    height.fillStyle = relief;
    height.fillRect(x, 0, w, size);
  }
  // Panel seams across, with a lap shadow under each and rust weeping from the fixings.
  for (const y of [size * 0.5, size]) {
    colour.fillStyle = rgba(seam!, 0.85);
    colour.fillRect(0, y - 3, size, 4);
    const lap = colour.createLinearGradient(0, y - 18, 0, y - 3);
    lap.addColorStop(0, "rgba(0,0,0,0)");
    lap.addColorStop(1, "rgba(0,0,0,0.3)");
    colour.fillStyle = lap;
    colour.fillRect(0, y - 18, size, 15);
    height.fillStyle = grey(40);
    height.fillRect(0, y - 3, size, 4);
    for (let index = 0; index < ribs; index += 2) {
      const x = index * w + w * 0.5;
      colour.fillStyle = rgba(seam!, 0.9);
      colour.beginPath();
      colour.arc(x, y - 10, 2.2, 0, Math.PI * 2);
      colour.fill();
      if (random() < 0.5) {
        const run = colour.createLinearGradient(0, y - 8, 0, y + 60 + random() * 80);
        run.addColorStop(0, rgba(rust!, 0.55));
        run.addColorStop(1, rgba(rust!, 0));
        colour.fillStyle = run;
        wrapped(size, x, y, 0, (wx, wy) => colour.fillRect(wx - 3, wy - 8, 6, 150));
      }
    }
  }
  // Streaks of grime down the ribs.
  for (let index = 0; index < 30; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const run = colour.createLinearGradient(0, y, 0, y + 80);
    run.addColorStop(0, rgba(dark!, 0.2));
    run.addColorStop(1, rgba(dark!, 0));
    colour.fillStyle = run;
    wrapped(size, x, y, 80, (wx, wy) => colour.fillRect(wx, wy, 2 + random() * 3, 80));
  }
};

/** Colours: stone, stone dark, stone light, mortar. */
const fieldstone: Drawer = (colour, height, size, colors, random) => {
  const [stone, dark, light, mortar] = colors;
  fill(colour, size, mortar!);
  fill(height, size, grey(50));
  const columns = 5;
  const rows = 4;
  const cw = size / columns;
  const rh = size / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cx = column * cw + cw / 2 + (row % 2 ? cw * 0.5 : 0) + (random() - 0.5) * cw * 0.1;
      const cy = row * rh + rh / 2 + (random() - 0.5) * rh * 0.1;
      const rx = cw * (0.52 + random() * 0.1);
      const ry = rh * (0.5 + random() * 0.08);
      const tone = random();
      const base = shade(tone < 0.3 ? dark! : tone < 0.75 ? stone! : light!, (random() - 0.5) * 0.12);
      const points: Array<readonly [number, number]> = [];
      const sides = 7 + Math.floor(random() * 4);
      for (let index = 0; index < sides; index += 1) {
        const angle = (index / sides) * Math.PI * 2;
        const wobble = 0.78 + random() * 0.2;
        points.push([Math.cos(angle) * rx * wobble, Math.sin(angle) * ry * wobble]);
      }
      const drawStone = (context: CanvasRenderingContext2D, x: number, y: number, style: string | CanvasGradient, inset: number): void => {
        context.fillStyle = style;
        context.beginPath();
        points.forEach(([px, py], index) => {
          const sx = x + px * inset;
          const sy = y + py * inset;
          if (index === 0) context.moveTo(sx, sy);
          else context.lineTo(sx, sy);
        });
        context.closePath();
        context.fill();
      };
      wrapped(size, cx, cy, Math.max(rx, ry) + 4, (x, y) => {
        const light2 = colour.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 2, x, y, Math.max(rx, ry) * 1.2);
        light2.addColorStop(0, shade(base, 0.22));
        light2.addColorStop(0.7, base);
        light2.addColorStop(1, shade(base, -0.3));
        drawStone(colour, x, y, light2, 1);
        const relief = height.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry) * 1.1);
        relief.addColorStop(0, grey(210));
        relief.addColorStop(0.75, grey(170));
        relief.addColorStop(1, grey(90));
        drawStone(height, x, y, relief, 1);
        // Speckle.
        for (let index = 0; index < 14; index += 1) {
          colour.fillStyle = rgba(random() < 0.5 ? dark! : light!, 0.3);
          colour.beginPath();
          colour.arc(x + (random() - 0.5) * rx * 1.2, y + (random() - 0.5) * ry * 1.2, 1 + random() * 1.5, 0, Math.PI * 2);
          colour.fill();
        }
      });
    }
  }
  // Grit in the mortar.
  for (let index = 0; index < 500; index += 1) {
    colour.fillStyle = rgba(random() < 0.5 ? dark! : light!, 0.25);
    colour.fillRect(random() * size, random() * size, 1.5, 1.5);
  }
};

/** Colours: plaster, grit dark, grit light. */
const plaster: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light] = colors;
  fill(colour, size, base!);
  fill(height, size, grey(128));
  for (let index = 0; index < 2600; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 1 + random() * 3;
    const isDark = random() < 0.5;
    colour.fillStyle = rgba(isDark ? dark! : light!, 0.08 + random() * 0.12);
    colour.beginPath();
    colour.arc(x, y, r, 0, Math.PI * 2);
    colour.fill();
    height.fillStyle = grey(isDark ? 112 : 146);
    height.beginPath();
    height.arc(x, y, r, 0, Math.PI * 2);
    height.fill();
  }
  // Trowel sweeps: broad, very faint arcs.
  colour.lineWidth = 18;
  for (let index = 0; index < 12; index += 1) {
    colour.strokeStyle = rgba(random() < 0.5 ? dark! : light!, 0.05);
    colour.beginPath();
    colour.arc(random() * size, random() * size, 60 + random() * 120, random() * Math.PI * 2, random() * Math.PI * 2);
    colour.stroke();
  }
  // A hairline crack or two, low on the wall.
  colour.strokeStyle = rgba(dark!, 0.5);
  colour.lineWidth = 1.2;
  for (let index = 0; index < 2; index += 1) {
    let x = random() * size;
    let y = size * (0.5 + random() * 0.4);
    colour.beginPath();
    colour.moveTo(x, y);
    for (let step = 0; step < 8; step += 1) {
      x += (random() - 0.5) * 24;
      y += 10 + random() * 14;
      colour.lineTo(x, y);
    }
    colour.stroke();
  }
};

/** Colours: brick, brick dark, brick light, mortar. */
const brick: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light, mortar] = colors;
  fill(colour, size, mortar!);
  fill(height, size, grey(60));
  const rows = 14;
  const columns = 4;
  const rh = size / rows;
  const bw = size / columns;
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let column = -1; column <= columns; column += 1) {
      const x = column * bw + offset;
      const y = row * rh;
      const tone = random();
      colour.fillStyle = shade(tone < 0.25 ? dark! : tone < 0.8 ? base! : light!, (random() - 0.5) * 0.14);
      colour.fillRect(x + 2, y + 2, bw - 4, rh - 4);
      height.fillStyle = grey(150 + tone * 25);
      height.fillRect(x + 2, y + 2, bw - 4, rh - 4);
      colour.fillStyle = "rgba(0,0,0,0.18)";
      colour.fillRect(x + 2, y + rh - 6, bw - 4, 4);
      for (let index = 0; index < 6; index += 1) {
        colour.fillStyle = rgba(random() < 0.5 ? dark! : light!, 0.25);
        colour.fillRect(x + 4 + random() * (bw - 8), y + 4 + random() * (rh - 8), 2, 1.5);
      }
    }
  }
};

/** Colours: steel, steel dark, seam. */
const galvanised: Drawer = (colour, height, size, colors, random) => {
  const [steel, dark, seam] = colors;
  fill(colour, size, steel!);
  fill(height, size, grey(128));
  // Spangle: big faint crystals.
  for (let index = 0; index < 70; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 14 + random() * 34;
    const sides = 5 + Math.floor(random() * 3);
    colour.fillStyle = rgba(random() < 0.5 ? dark! : "#ffffff", 0.05 + random() * 0.07);
    wrapped(size, x, y, r, (wx, wy) => {
      colour.beginPath();
      for (let s = 0; s < sides; s += 1) {
        const angle = (s / sides) * Math.PI * 2 + index;
        const px = wx + Math.cos(angle) * r * (0.8 + random() * 0.3);
        const py = wy + Math.sin(angle) * r * (0.8 + random() * 0.3);
        if (s === 0) colour.moveTo(px, py);
        else colour.lineTo(px, py);
      }
      colour.closePath();
      colour.fill();
    });
  }
  // Horizontal seams with a rivet line.
  for (const y of [size * 0.5, size]) {
    colour.fillStyle = rgba(seam!, 0.9);
    colour.fillRect(0, y - 4, size, 5);
    colour.fillStyle = "rgba(255,255,255,0.2)";
    colour.fillRect(0, y - 6, size, 2);
    height.fillStyle = grey(190);
    height.fillRect(0, y - 8, size, 8);
    height.fillStyle = grey(70);
    height.fillRect(0, y - 2, size, 3);
    for (let x = 12; x < size; x += 32) {
      colour.fillStyle = rgba(dark!, 0.8);
      colour.beginPath();
      colour.arc(x, y - 14, 2.4, 0, Math.PI * 2);
      colour.fill();
      colour.fillStyle = "rgba(255,255,255,0.35)";
      colour.beginPath();
      colour.arc(x - 0.7, y - 14.7, 1, 0, Math.PI * 2);
      colour.fill();
    }
  }
  // Grime streaks down from the seams.
  for (let index = 0; index < 24; index += 1) {
    const x = random() * size;
    const y = random() < 0.5 ? size * 0.5 : 0;
    const run = colour.createLinearGradient(0, y, 0, y + 60 + random() * 90);
    run.addColorStop(0, rgba(dark!, 0.22));
    run.addColorStop(1, rgba(dark!, 0));
    colour.fillStyle = run;
    colour.fillRect(x, y, 2 + random() * 4, 150);
  }
};

/** Colours: wood, grain dark, grain light. Grain runs along u. */
const wood: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light] = colors;
  fill(colour, size, base!);
  fill(height, size, grey(128));
  // Broad tone bands, then fine grain over them.
  for (let index = 0; index < 9; index += 1) {
    const y = random() * size;
    const h = 20 + random() * 60;
    colour.fillStyle = rgba(random() < 0.5 ? dark! : light!, 0.1);
    wrapped(size, 0, y, h, (_x, wy) => colour.fillRect(0, wy, size, h));
  }
  grain(colour, height, 0, 0, size, size, "x", dark!, light!, random, 1.6);
  for (let index = 0; index < 3; index += 1) if (random() < 0.7) knot(colour, height, random() * size, random() * size, 4 + random() * 6, dark!);
};

/** Colours: straw, straw dark, straw light. */
const straw: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light] = colors;
  fill(colour, size, shade(base!, -0.15));
  fill(height, size, grey(110));
  colour.lineCap = "round";
  for (let index = 0; index < 2200; index += 1) {
    const length = 18 + random() * 50;
    const angle = (random() - 0.5) * 1.1 + (random() < 0.5 ? 0 : Math.PI / 2) * (random() < 0.3 ? 1 : 0);
    const tone = random();
    const style = tone < 0.35 ? dark! : tone < 0.8 ? base! : light!;
    colour.strokeStyle = rgba(style, 0.75);
    colour.lineWidth = 1.2 + random() * 1.8;
    const x = random() * size;
    const y = random() * size;
    wrapped(size, x, y, length, (wx, wy) => {
      colour.beginPath();
      colour.moveTo(wx, wy);
      colour.lineTo(wx + Math.cos(angle) * length, wy + Math.sin(angle) * length);
      colour.stroke();
      if (tone > 0.6) {
        height.strokeStyle = grey(150 + tone * 60);
        height.lineWidth = colour.lineWidth;
        height.beginPath();
        height.moveTo(wx, wy);
        height.lineTo(wx + Math.cos(angle) * length, wy + Math.sin(angle) * length);
        height.stroke();
      }
    });
  }
};

/** Colours: bark, bark dark, bark light. Ridges run along v (up the trunk). */
const bark: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light] = colors;
  fill(colour, size, base!);
  fill(height, size, grey(128));
  colour.lineCap = "round";
  for (let index = 0; index < 90; index += 1) {
    const x = random() * size;
    const w = 3 + random() * 9;
    const isRidge = random() < 0.5;
    colour.strokeStyle = rgba(isRidge ? light! : dark!, 0.55);
    colour.lineWidth = w;
    height.strokeStyle = grey(isRidge ? 185 : 70);
    height.lineWidth = w;
    for (const context of [colour, height]) {
      context.beginPath();
      context.moveTo(x, -20);
      let px = x;
      for (let y = 0; y <= size + 20; y += 40) {
        px += (random() - 0.5) * 10;
        context.lineTo(px, y);
      }
      context.stroke();
    }
  }
  // Horizontal lenticels and a little moss on one side.
  for (let index = 0; index < 60; index += 1) {
    colour.fillStyle = rgba(dark!, 0.45);
    colour.fillRect(random() * size, random() * size, 4 + random() * 8, 1.5);
  }
  for (let index = 0; index < 40; index += 1) {
    colour.fillStyle = rgba("#5f8a3a", 0.18);
    colour.beginPath();
    colour.arc(random() * size * 0.4, random() * size, 4 + random() * 8, 0, Math.PI * 2);
    colour.fill();
  }
};

/** Colours: leaf, leaf dark, leaf light. */
const foliage: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light] = colors;
  fill(colour, size, shade(dark!, -0.25));
  fill(height, size, grey(90));
  for (let index = 0; index < 1700; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 5 + random() * 11;
    const tone = random();
    const style = tone < 0.3 ? dark! : tone < 0.75 ? base! : light!;
    const spin = random() * Math.PI * 2;
    wrapped(size, x, y, r * 2, (wx, wy) => {
      colour.fillStyle = shade(style, (random() - 0.5) * 0.1);
      colour.beginPath();
      colour.ellipse(wx, wy, r, r * 0.55, spin, 0, Math.PI * 2);
      colour.fill();
      colour.strokeStyle = rgba(dark!, 0.35);
      colour.lineWidth = 1;
      colour.beginPath();
      colour.moveTo(wx - Math.cos(spin) * r, wy - Math.sin(spin) * r);
      colour.lineTo(wx + Math.cos(spin) * r, wy + Math.sin(spin) * r);
      colour.stroke();
      height.fillStyle = grey(100 + tone * 120);
      height.beginPath();
      height.ellipse(wx, wy, r, r * 0.55, spin, 0, Math.PI * 2);
      height.fill();
    });
  }
};

/** Colours: earth, earth dark, earth light. */
const soil: Drawer = (colour, height, size, colors, random) => {
  const [base, dark, light] = colors;
  fill(colour, size, base!);
  fill(height, size, grey(128));
  for (let index = 0; index < 2400; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 1.5 + random() * 5;
    const isDark = random() < 0.5;
    colour.fillStyle = rgba(isDark ? dark! : light!, 0.35);
    colour.beginPath();
    colour.arc(x, y, r, 0, Math.PI * 2);
    colour.fill();
    height.fillStyle = grey(isDark ? 95 : 165);
    height.beginPath();
    height.arc(x, y, r, 0, Math.PI * 2);
    height.fill();
  }
};

const KINDS: Readonly<Record<FarmTextureKind, KindSpec>> = Object.freeze({
  "planks": { colors: ["#a8312b", "#5a1a16", "#c9524a", "#3a1410"], metresPerTile: 1, roughness: 0.85, metalness: 0, bumpScale: 0.02, draw: planks },
  "battens": { colors: ["#a8312b", "#5a1a16", "#c9524a", "#8f2a24"], metresPerTile: 1, roughness: 0.85, metalness: 0, bumpScale: 0.025, draw: battens },
  "shingles": { colors: ["#5a4636", "#3a2b20", "#7a614a", "#22180f"], metresPerTile: 1.2, roughness: 0.9, metalness: 0, bumpScale: 0.03, draw: shingles },
  "clay-tiles": { colors: ["#b8563a", "#7a3322", "#d8785a", "#4a2015"], metresPerTile: 1.2, roughness: 0.8, metalness: 0, bumpScale: 0.03, draw: clayTiles },
  "corrugated": { colors: ["#7c8a93", "#4c565d", "#2f373c", "#8a4a22"], metresPerTile: 1, roughness: 0.55, metalness: 0.45, bumpScale: 0.02, draw: corrugated },
  "fieldstone": { colors: ["#8e8b82", "#5f5c55", "#b3b0a6", "#4a463f"], metresPerTile: 1.2, roughness: 0.95, metalness: 0, bumpScale: 0.04, draw: fieldstone },
  "plaster": { colors: ["#f1e6d2", "#c9b99c", "#fffaf0"], metresPerTile: 1.5, roughness: 0.95, metalness: 0, bumpScale: 0.01, draw: plaster },
  "brick": { colors: ["#a86a4a", "#7a4a32", "#c9885f", "#c9bfae"], metresPerTile: 1, roughness: 0.9, metalness: 0, bumpScale: 0.02, draw: brick },
  "galvanised": { colors: ["#b9bec4", "#7e8790", "#5a6068"], metresPerTile: 1.5, roughness: 0.4, metalness: 0.65, bumpScale: 0.015, draw: galvanised },
  "wood": { colors: ["#8a5a34", "#4a2e18", "#b07a4a"], metresPerTile: 0.8, roughness: 0.85, metalness: 0, bumpScale: 0.01, draw: wood },
  "straw": { colors: ["#d8b24a", "#a07a28", "#f0d478"], metresPerTile: 0.6, roughness: 1, metalness: 0, bumpScale: 0.02, draw: straw },
  "bark": { colors: ["#5d3a1f", "#2f1c0c", "#8a6240"], metresPerTile: 0.9, roughness: 1, metalness: 0, bumpScale: 0.04, draw: bark },
  "foliage": { colors: ["#3f7f34", "#245420", "#6fb24c"], metresPerTile: 1, roughness: 0.9, metalness: 0, bumpScale: 0.03, draw: foliage },
  "soil": { colors: ["#5a3d24", "#3a2414", "#8a6a44"], metresPerTile: 1, roughness: 1, metalness: 0, bumpScale: 0.03, draw: soil },
});

export const FARM_TEXTURE_KINDS = Object.freeze(Object.keys(KINDS) as FarmTextureKind[]);

/** The palette a kind draws with when the caller gives none (or gives only the first few). */
export function farmTextureColors(kind: FarmTextureKind, colors: readonly string[] = []): readonly string[] {
  const defaults = KINDS[kind].colors;
  return defaults.map((entry, index) => colors[index] ?? entry);
}

/** The colour and height tiles for a kind and palette, or null where there is no canvas to draw on (node). */
export function drawFarmTexture(kind: FarmTextureKind, colors: readonly string[]): Readonly<{ colour: HTMLCanvasElement; height: HTMLCanvasElement }> | null {
  if (typeof document === "undefined") return null;
  const colour = document.createElement("canvas");
  const height = document.createElement("canvas");
  colour.width = colour.height = TILE;
  height.width = height.height = TILE;
  const colourContext = colour.getContext("2d");
  const heightContext = height.getContext("2d");
  if (!colourContext || !heightContext) return null;
  let seed = 7;
  for (const char of kind + colors.join("")) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  KINDS[kind].draw(colourContext, heightContext, TILE, colors, seeded(seed));
  return { colour, height };
}

const cache = new Map<string, any>();

/**
 * A lit material in `kind`, cached by kind and palette. The material's
 * `userData.metresPerTile` is what the mesh helpers read to scale UVs.
 */
export function farmMaterial(THREE: ThreeNamespace, kind: FarmTextureKind, options: FarmMaterialOptions = {}): any {
  const spec = KINDS[kind];
  const colors = farmTextureColors(kind, options.colors);
  const metresPerTile = options.metresPerTile ?? spec.metresPerTile;
  const key = JSON.stringify([kind, colors, metresPerTile, options.roughness, options.metalness, options.bumpScale, options.doubleSided]);
  const cached = cache.get(key);
  if (cached) return cached;
  const tiles = drawFarmTexture(kind, colors);
  const material = new THREE.MeshStandardMaterial({
    color: tiles ? "#ffffff" : colors[0],
    roughness: options.roughness ?? spec.roughness,
    metalness: options.metalness ?? spec.metalness,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (tiles) {
    const map = new THREE.CanvasTexture(tiles.colour);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    const bump = new THREE.CanvasTexture(tiles.height);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.anisotropy = 4;
    material.map = map;
    material.bumpMap = bump;
    material.bumpScale = options.bumpScale ?? spec.bumpScale;
  }
  material.userData.metresPerTile = metresPerTile;
  cache.set(key, material);
  return material;
}

/** Forget every cached material (a test, or a page tearing the farm down). */
export function disposeFarmMaterials(): void {
  for (const material of cache.values()) {
    material.map?.dispose?.();
    material.bumpMap?.dispose?.();
    material.dispose?.();
  }
  cache.clear();
}

function tileOf(material: any): number {
  return Number(material?.userData?.metresPerTile) || 1;
}

/**
 * Rewrite a geometry's UVs so one tile spans `metresPerTile` metres of every
 * face, projected along whichever axis the face mostly faces (a box's six
 * faces, an extruded gable's ends and slopes). A geometry with no UVs or
 * normals (a test's stub) is left alone.
 */
export function metricUvs(geometry: any, metresPerTile: number, offset: Readonly<{ u: number; v: number }> = { u: 0, v: 0 }): any {
  const position = geometry?.attributes?.position;
  const normal = geometry?.attributes?.normal;
  const uv = geometry?.attributes?.uv;
  if (!position || !normal || !uv || typeof uv.setXY !== "function") return geometry;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) { u = z; v = y; }
    else if (ny >= nz) { u = x; v = z; }
    else { u = x; v = y; }
    uv.setXY(index, u / metresPerTile + offset.u, v / metresPerTile + offset.v);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Scale a geometry's own 0..1 UVs (a cylinder's, a plane's) to `uMetres` by `vMetres` at the material's tile size. */
export function scaleUvs(geometry: any, metresPerTile: number, uMetres: number, vMetres: number): any {
  const uv = geometry?.attributes?.uv;
  if (!uv || typeof uv.setXY !== "function") return geometry;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, uv.getX(index) * uMetres / metresPerTile, uv.getY(index) * vMetres / metresPerTile);
  uv.needsUpdate = true;
  return geometry;
}

/** A box in a farm material: the room's `box`, with its UVs in metres so the pattern never stretches. */
export function tbox(THREE: ThreeNamespace, group: any, size: readonly [number, number, number], position: readonly [number, number, number], material: any, shadow = true): any {
  const mesh = new THREE.Mesh(metricUvs(new THREE.BoxGeometry(...size), tileOf(material)), material);
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}

/** A cylinder in a farm material: the pattern goes round it at its true circumference and up it at its true height. */
export function tcylinder(THREE: ThreeNamespace, group: any, radiusTop: number, radiusBottom: number, height: number, position: readonly [number, number, number], material: any, segments = 16, shadow = true): any {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  scaleUvs(geometry, tileOf(material), Math.PI * (radiusTop + radiusBottom), height);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}

/** A sphere in a farm material (a canopy, a bush): the pattern wraps at the sphere's own circumference. */
export function tsphere(THREE: ThreeNamespace, group: any, radius: number, position: readonly [number, number, number], material: any, widthSegments = 18, heightSegments = 14): any {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  scaleUvs(geometry, tileOf(material), Math.PI * 2 * radius, Math.PI * radius);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** A mesh from any geometry in a farm material, with metric UVs projected onto it (an extruded gable, a lathe). */
export function tmesh(THREE: ThreeNamespace, group: any, geometry: any, material: any, position: readonly [number, number, number] = [0, 0, 0], shadow = true): any {
  const mesh = new THREE.Mesh(metricUvs(geometry, tileOf(material)), material);
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}
