// Board atmosphere: the weather overlay (blizzard/spring/heatwave/thunderstorm
// fields + lightning), the tile-object figures (Build Cover walls, Throw Cigar
// fire), and the stone dais the diamond sits on. Pure scene decoration split out
// of boardRenderer.js so the targeting/highlight renderer stays focused; all
// jitter here is index-seeded (no RNG) so rebuilds are deterministic.

import { svgElement } from "./svgHelpers.js";
import { getBoardDiamond, pointsToString } from "./isometric.js";
import { getActiveWeather } from "../core/unitCatalog.js";
import { WEATHER_LABELS } from "../core/weather.js";
import { shouldUseReducedMotionPresentation } from "./performanceSettings.js";
export function getActiveBoardWeather(state) {
  return getActiveWeather(state)?.id ?? null;
}

function scalePoint(center, point, factor) {
  return {
    x: center.x + (point.x - center.x) * factor,
    y: center.y + (point.y - center.y) * factor
  };
}

function weatherStyle(tokens) {
  return Object.entries(tokens)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

function addSnowField(g, metrics, bounds) {
  const field = svgElement("g", { class: "weather-field weather-field--snow" });

  // Wind-driven gust streaks sweeping across the board — what makes it read as a
  // BLIZZARD rather than gentle flurries. Big, soft, blurred bands drifting sideways.
  const gusts = svgElement("g", { class: "weather-snow-gusts" });
  for (let i = 0; i < 4; i += 1) {
    gusts.append(svgElement("ellipse", {
      class: "weather-snow-gust",
      cx: bounds.w.x.toFixed(1),
      cy: (bounds.n.y + bounds.height * (0.22 + i * 0.19)).toFixed(1),
      rx: (bounds.width * 0.32).toFixed(1),
      ry: Math.max(10, metrics.tileHeight * 0.5).toFixed(1),
      style: weatherStyle({
        "--delay": `${(-i * 1.7).toFixed(2)}s`,
        "--dur": `${(5.4 + i * 0.9).toFixed(1)}s`,
        "--sweep": `${(bounds.width * 1.25).toFixed(0)}px`
      })
    }));
  }
  field.append(gusts);

  // Dense, layered, swaying flakes. Deeper layers are bigger/brighter/slower.
  for (let i = 0; i < 84; i += 1) {
    const depth = i % 4;
    const x = bounds.w.x + bounds.width * (((i * 37) % 101) / 100);
    const y = bounds.n.y + bounds.height * (0.03 + (((i * 53) % 94) / 100));
    const radius = Math.max(1.1, metrics.tileWidth * (0.011 + depth * 0.004));
    field.append(svgElement("circle", {
      class: `weather-flake weather-flake--d${depth}`,
      cx: x.toFixed(2),
      cy: y.toFixed(2),
      r: radius.toFixed(2),
      style: weatherStyle({
        // sway amplitude (side to side) + total fall distance (a couple tiles)
        "--wx": `${(metrics.tileWidth * (0.05 + depth * 0.018)).toFixed(0)}px`,
        "--wy": `${(metrics.tileHeight * (1.5 + depth * 0.7)).toFixed(0)}px`,
        "--delay": `${(-((i * 13) % 31) / 10).toFixed(1)}s`,
        "--dur": `${(5.2 + depth * 1.2 + ((i * 7) % 9) / 10).toFixed(1)}s`
      })
    }));
  }
  g.append(field);
}

function addRainField(g, metrics, bounds, { storm = false } = {}) {
  const count = storm ? 34 : 42;
  const field = svgElement("g", { class: `weather-field ${storm ? "weather-field--storm" : "weather-field--rain"}` });
  for (let i = 0; i < count; i += 1) {
    const depth = i % 3;
    const x = bounds.w.x + bounds.width * (((i * 29 + (storm ? 7 : 0)) % 103) / 102);
    const y = bounds.n.y + bounds.height * (((i * 47 + 11) % 88) / 100);
    const dropHeight = Math.max(16, metrics.tileHeight * (0.55 + depth * 0.1));
    const dropWidth = Math.max(2, metrics.tileWidth * (storm ? 0.034 : 0.026));
    const wrap = svgElement("g", {
      class: `weather-drop-wrap weather-drop-wrap--d${depth}`,
      transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${storm ? -13 : -8})`
    });
    const cycle = svgElement("g", {
      class: "weather-drop-cycle",
      style: weatherStyle({
        "--fall": `${Math.max(38, metrics.tileHeight * (1.7 + depth * 0.4)).toFixed(0)}px`,
        "--delay": `${(-((i * 11) % 24) / 10).toFixed(1)}s`,
        "--dur": `${(storm ? 0.55 : 0.8) + depth * 0.11}s`
      })
    });
    cycle.append(
      svgElement("rect", {
        class: "weather-drop",
        x: (-dropWidth / 2).toFixed(2),
        y: (-dropHeight).toFixed(2),
        width: dropWidth.toFixed(2),
        height: dropHeight.toFixed(2),
        rx: (dropWidth / 2).toFixed(2)
      }),
      svgElement("ellipse", {
        class: "weather-splat",
        cx: "0",
        cy: "0",
        rx: Math.max(2.4, metrics.tileWidth * (storm ? 0.038 : 0.03)).toFixed(2),
        ry: Math.max(1, metrics.tileHeight * 0.028).toFixed(2)
      })
    );
    wrap.append(cycle);
    field.append(wrap);
  }
  g.append(field);
}

// Spring: soft petals drifting down over the rain — reads as a fresh spring shower
// instead of the old random green blobs. Each petal sways side to side and tumbles
// (rotation) as it falls, on its own staggered cycle. cx/cy set the base spot; the
// drift/tumble is a CSS transform layered on top (same pattern as the flakes).
function addSpringPetals(g, metrics, bounds) {
  const petals = svgElement("g", { class: "weather-petals" });
  for (let i = 0; i < 15; i += 1) {
    const x = bounds.w.x + bounds.width * (((i * 31 + 9) % 99) / 100);
    const y = bounds.n.y + bounds.height * (((i * 23) % 82) / 100);
    const size = Math.max(3, metrics.tileWidth * (0.02 + (i % 3) * 0.006));
    petals.append(svgElement("ellipse", {
      class: `weather-petal weather-petal--d${i % 3}`,
      cx: x.toFixed(1),
      cy: y.toFixed(1),
      rx: size.toFixed(1),
      ry: (size * 0.52).toFixed(1),
      style: weatherStyle({
        "--sway": `${(metrics.tileWidth * 0.12).toFixed(0)}px`,
        "--fall": `${(metrics.tileHeight * (1.4 + (i % 3) * 0.5)).toFixed(0)}px`,
        "--delay": `${((-(i * 7) % 44) / 10).toFixed(1)}s`,
        "--dur": `${(4.4 + (i % 4) * 0.9).toFixed(1)}s`
      })
    }));
  }
  g.append(petals);
}

// Heatwave: rising, wobbling shimmer columns (hot-air distortion) plus a scatter of
// drifting embers, instead of the old vague grey blobs. The shimmer rects are filled
// with a vertical transparent→warm→transparent gradient and heavily blurred in CSS so
// they read as air warp, not solid bars; the wobble/rise/breathe lives in the keyframes.
function addHeatField(g, metrics, bounds, size) {
  const field = svgElement("g", { class: "weather-field weather-field--heat" });

  const gradId = `weather-heat-grad-${size}`;
  const defs = svgElement("defs");
  const grad = svgElement("linearGradient", { id: gradId, x1: "0", y1: "1", x2: "0", y2: "0" });
  for (const [offset, color] of [
    ["0%", "rgba(255,150,54,0)"],
    ["30%", "rgba(255,170,74,.55)"],
    ["62%", "rgba(255,206,120,.34)"],
    ["100%", "rgba(255,235,175,0)"]
  ]) {
    grad.append(svgElement("stop", { offset, "stop-color": color }));
  }
  defs.append(grad);
  field.append(defs);

  const cols = 7;
  for (let i = 0; i < cols; i += 1) {
    const cx = bounds.w.x + bounds.width * (0.08 + i * (0.84 / (cols - 1)));
    const w = Math.max(26, metrics.tileWidth * (0.5 + (i % 3) * 0.14));
    const h = bounds.height * (0.66 + (i % 2) * 0.22);
    const yTop = bounds.n.y + bounds.height * 0.14;
    field.append(svgElement("rect", {
      class: `weather-heat-shimmer weather-heat-shimmer--d${i % 3}`,
      x: (cx - w / 2).toFixed(1),
      y: yTop.toFixed(1),
      width: w.toFixed(1),
      height: h.toFixed(1),
      fill: `url(#${gradId})`,
      style: weatherStyle({
        "--delay": `${(-i * 0.5).toFixed(2)}s`,
        "--dur": `${(3.4 + (i % 3) * 0.7).toFixed(1)}s`
      })
    }));
  }

  const embers = svgElement("g", { class: "weather-heat-embers" });
  for (let i = 0; i < 14; i += 1) {
    const x = bounds.w.x + bounds.width * (((i * 37 + 11) % 100) / 100);
    const y = bounds.n.y + bounds.height * (0.4 + ((i * 17) % 55) / 100);
    embers.append(svgElement("circle", {
      class: "weather-heat-ember",
      cx: x.toFixed(1),
      cy: y.toFixed(1),
      r: Math.max(1.3, metrics.tileWidth * 0.012 * (1 + (i % 3) * 0.5)).toFixed(1),
      style: weatherStyle({
        "--delay": `${((-(i * 7) % 40) / 10).toFixed(1)}s`,
        "--dur": `${(3 + (i % 4) * 0.8).toFixed(1)}s`
      })
    }));
  }
  field.append(embers);

  g.append(field);
}

function addStormCells(g, metrics, bounds) {
  const cells = svgElement("g", { class: "weather-storm-cells" });
  for (let i = 0; i < 5; i += 1) {
    cells.append(svgElement("ellipse", {
      class: "weather-storm-cell",
      cx: (bounds.w.x + bounds.width * (0.18 + i * 0.16)).toFixed(2),
      cy: (bounds.n.y + bounds.height * (0.18 + ((i * 3) % 4) * 0.08)).toFixed(2),
      rx: Math.max(18, metrics.tileWidth * 0.38).toFixed(2),
      ry: Math.max(8, metrics.tileHeight * 0.18).toFixed(2),
      style: weatherStyle({ "--delay": `${(-i * 0.35).toFixed(2)}s` })
    }));
  }
  g.append(cells);
}

// A single jagged lightning stroke: a thin zig-zag polyline dropping downward with
// index-seeded horizontal jitter (no RNG — deterministic like the rest of this file)
// plus one short fork branch, so it reads as a real bolt instead of a fat wedge.
function boltPath(startX, startY, totalHeight, seed) {
  const segs = 7;
  const segH = totalHeight / segs;
  let x = startX;
  let y = startY;
  let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
  let forkD = "";
  for (let i = 1; i <= segs; i += 1) {
    const jitter = (((seed * 13 + i * 41) % 23) / 22 - 0.5) * segH * 1.05;
    x += jitter;
    y += segH;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    // one glancing fork partway down
    if (i === 3) {
      const fx = x + segH * (0.9 + (seed % 3) * 0.2) * (seed % 2 ? 1 : -1);
      const fy = y + segH * 1.3;
      forkD = ` M ${x.toFixed(1)} ${y.toFixed(1)} L ${fx.toFixed(1)} ${fy.toFixed(1)}`;
    }
  }
  return d + forkD;
}

// Lightning strikes are appended to the UNCLIPPED overlay root (not the board-clipped
// field group) on purpose — the user wants bolts that can flash down outside the tile
// diamond, not one permanent wedge stapled to the board centre. Each bolt flashes
// briefly on its own staggered cycle so at any instant the sky is mostly dark with the
// odd strike, the way real lightning reads.
function addLightningBolts(g, metrics, bounds) {
  const bolts = svgElement("g", { class: "weather-bolts" });
  const strikes = 4;
  for (let i = 0; i < strikes; i += 1) {
    // spread across a span wider than the board so strikes land off the tiles too
    const startX = bounds.w.x + bounds.width * (-0.12 + i * 0.4 + (i % 2) * 0.06);
    const startY = bounds.n.y - bounds.height * (0.16 + (i % 2) * 0.05);
    const h = bounds.height * (0.85 + (i % 3) * 0.14);
    bolts.append(svgElement("path", {
      class: "weather-bolt",
      d: boltPath(startX, startY, h, i * 7 + 3),
      style: weatherStyle({ "--delay": `${(i * 1.35).toFixed(2)}s` })
    }));
  }
  g.append(bolts);
}

export function createWeatherOverlay(metrics, size, weather) {
  if (!Object.hasOwn(WEATHER_LABELS, weather)) return null;
  const diamond = getBoardDiamond(metrics, size);
  const center = { x: diamond.cx, y: diamond.cy + metrics.tileHeight * 0.55 };
  // Slightly wider than the tile diamond so the wash bleeds onto the stone dais
  // rim instead of hugging the tiles exactly — the board's SVG viewBox only has
  // ~34px of margin around the board, so this stays conservative; the bulk of the
  // "environmental" spread comes from the full-scene weather layer in
  // sceneBackdrop.js (see setSceneWeather), which isn't bound by that viewBox.
  const scale = 1.07;
  const n = scalePoint(center, diamond.n, scale);
  const e = scalePoint(center, diamond.e, scale);
  const s = scalePoint(center, { x: diamond.s.x, y: diamond.s.y + metrics.depth * 0.45 }, scale);
  const w = scalePoint(center, diamond.w, scale);
  const width = e.x - w.x;
  const height = s.y - n.y;
  const g = svgElement("g", {
    class: `weather-overlay weather-overlay--${weather}`,
    "data-weather": weather,
    "aria-label": `${WEATHER_LABELS[weather]} board weather`
  });

  g.append(svgElement("polygon", {
    class: "weather-overlay-wash",
    points: pointsToString([[n.x, n.y], [e.x, e.y], [s.x, s.y], [w.x, w.y]])
  }));

  const clipId = `weather-clip-${weather}-${size}`;
  const defs = svgElement("defs");
  const clip = svgElement("clipPath", { id: clipId });
  clip.append(svgElement("polygon", {
    points: pointsToString([[n.x, n.y], [e.x, e.y], [s.x, s.y], [w.x, w.y]])
  }));
  defs.append(clip);
  const fields = svgElement("g", { class: "weather-fields", "clip-path": `url(#${clipId})` });
  g.append(defs, fields);

  const bounds = { n, e, s, w, center, width, height };
  if (weather === "blizzard") {
    addSnowField(fields, metrics, bounds);
  } else if (weather === "spring") {
    addRainField(fields, metrics, bounds);
    addSpringPetals(fields, metrics, bounds);
  } else if (weather === "heatwave") {
    addHeatField(fields, metrics, bounds, size);
  } else if (weather === "thunderstorm") {
    addStormCells(fields, metrics, bounds);
    addRainField(fields, metrics, bounds, { storm: true });
    // bolts go on the unclipped root so strikes can fall beyond the board edge
    addLightningBolts(g, metrics, bounds);
  }

  return g;
}

// Throw Cigar fire: a cluster of flame tongues licking up off the tile face, with a
// glowing ember base. Pure presentation; the hazard lives in state.tileObjects.
export function createFireFigure(metrics, point, { simplified = shouldUseReducedMotionPresentation() } = {}) {
  const hh = metrics.tileHeight / 2;
  const c = { x: point.x, y: point.y + hh };
  const w = metrics.tileWidth * 0.30;
  const h = Math.max(18, metrics.tileHeight * 1.15);
  const flame = (dx, scale, cls) => {
    const bx = c.x + dx;
    const by = c.y + hh * 0.35;
    return svgElement("path", {
      class: cls,
      d: `M ${bx} ${by} C ${bx - w * scale} ${by - h * scale * 0.55}, ${bx - w * scale * 0.3} ${by - h * scale}, ${bx} ${by - h * scale} C ${bx + w * scale * 0.3} ${by - h * scale}, ${bx + w * scale} ${by - h * scale * 0.55}, ${bx} ${by} Z`
    });
  };
  const g = svgElement("g", { class: "tile-fire" });
  if (simplified) {
    const bx = c.x;
    const by = c.y + hh * 0.35;
    g.append(
      svgElement("ellipse", { class: "tile-fire-base", cx: c.x, cy: c.y + hh * 0.5, rx: w, ry: hh * 0.32 }),
      svgElement("path", {
        class: "tile-fire-flame tile-fire-flame--hi",
        d: `M ${bx} ${by} C ${bx - w * 0.6} ${by - h * 0.48}, ${bx - w * 0.18} ${by - h * 0.86}, ${bx} ${by - h * 0.86} C ${bx + w * 0.18} ${by - h * 0.86}, ${bx + w * 0.6} ${by - h * 0.48}, ${bx} ${by} Z`
      })
    );
    return g;
  }
  g.append(
    svgElement("ellipse", { class: "tile-fire-base", cx: c.x, cy: c.y + hh * 0.5, rx: w * 1.2, ry: hh * 0.4 }),
    flame(-w * 0.7, 0.7, "tile-fire-flame tile-fire-flame--lo"),
    flame(w * 0.7, 0.7, "tile-fire-flame tile-fire-flame--lo"),
    flame(0, 1, "tile-fire-flame tile-fire-flame--hi")
  );
  return g;
}

// A short isometric stone block raised off the tile face — the Sniper's Build Cover
// wall. Drawn in the units layer and depth-sorted alongside figures (see renderBoard)
// so a wall correctly occludes units behind it and is occluded by units in front.
// Pure presentation; gameplay reads state.tileObjects.
export function createWallFigure(metrics, point) {
  const hw = metrics.tileWidth / 2;
  const hh = metrics.tileHeight / 2;
  const inset = 0.58;
  const rise = Math.max(10, metrics.tileHeight * 0.52);
  const c = { x: point.x, y: point.y + hh };           // tile-face centre
  const base = {
    n: { x: c.x, y: c.y - hh * inset }, e: { x: c.x + hw * inset, y: c.y },
    s: { x: c.x, y: c.y + hh * inset }, w: { x: c.x - hw * inset, y: c.y }
  };
  const up = (p) => ({ x: p.x, y: p.y - rise });
  const cap = { n: up(base.n), e: up(base.e), s: up(base.s), w: up(base.w) };

  const g = svgElement("g", { class: "tile-wall tile-wall--low-cover" });
  g.append(
    svgElement("polygon", { class: "tile-wall-side tile-wall-side-l", points: pointsToString([[base.w.x, base.w.y], [base.s.x, base.s.y], [cap.s.x, cap.s.y], [cap.w.x, cap.w.y]]) }),
    svgElement("polygon", { class: "tile-wall-side tile-wall-side-r", points: pointsToString([[base.s.x, base.s.y], [base.e.x, base.e.y], [cap.e.x, cap.e.y], [cap.s.x, cap.s.y]]) }),
    svgElement("polygon", { class: "tile-wall-cap", points: pointsToString([[cap.n.x, cap.n.y], [cap.e.x, cap.e.y], [cap.s.x, cap.s.y], [cap.w.x, cap.w.y]]) })
  );
  return g;
}

// The stone war-table the diamond sits on: a blurred aura, a raised stone rim
// around the tiles, and two side faces giving the platform real thickness so the
// board reads as a physical table instead of tiles floating in a void. Drawn
// behind the tiles (appended first) and rebuilt with the board so it tracks size.
export function createBoardDais(metrics, size) {
  const d = getBoardDiamond(metrics, size);
  const scale = (p, f) => ({ x: d.cx + (p.x - d.cx) * f, y: d.cy + (p.y - d.cy) * f });
  const rim = 1.17;
  const N = scale(d.n, rim);
  const E = scale(d.e, rim);
  const S = scale(d.s, rim);
  const W = scale(d.w, rim);
  const depth = Math.max(22, metrics.tileHeight * 1.05);

  const aura = 1.62;
  const aN = scale(d.n, aura);
  const aE = scale(d.e, aura);
  const aS = scale(d.s, aura);
  const aW = scale(d.w, aura);

  const g = svgElement("g", { class: "board-dais" });
  g.append(
    svgElement("polygon", {
      class: "dais-aura",
      points: pointsToString([[aN.x, aN.y], [aE.x, aE.y], [aS.x, aS.y], [aW.x, aW.y]])
    }),
    svgElement("polygon", {
      class: "dais-side dais-side-l",
      points: pointsToString([[W.x, W.y], [S.x, S.y], [S.x, S.y + depth], [W.x, W.y + depth]])
    }),
    svgElement("polygon", {
      class: "dais-side dais-side-r",
      points: pointsToString([[S.x, S.y], [E.x, E.y], [E.x, E.y + depth], [S.x, S.y + depth]])
    }),
    svgElement("polygon", {
      class: "dais-top",
      points: pointsToString([[N.x, N.y], [E.x, E.y], [S.x, S.y], [W.x, W.y]])
    })
  );
  return g;
}
