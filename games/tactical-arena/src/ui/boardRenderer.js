import { svgElement } from "./svgHelpers.js";
import { createUnitFigure } from "./unitRenderer.js";
import { createBoardMetrics, createBoardViewBox, getBoardDiamond, gridToScreen, pointsToString } from "./isometric.js";
import { getActiveWeather, getArt, getAuraSources, getEffectiveStats } from "../core/unitCatalog.js";
import { areEnemies, getTileAffinity, unitAt } from "../core/state.js";
import { canTrample, chebyshevDistance, getLegalMoves, getTrampleMoveOptions, isOnBoard, positionKey } from "../rules/movement.js";
import { isShotBlocked, isStraightRayTarget, isWallBetween, requiresRayBasicAttack } from "../rules/combat.js";
import { artIsBodyBlocked, getArtTargetRange, getConeAimOptions, getConeCells, getFirePlacementTiles, getFlightTiles, getFootworkStepOptions, getLegalFleeTiles, getLineReachTiles, getLineTargets, getProtectLandingTiles, getPyroclasmReachTiles, getPyroclasmTargets, getRevivePlacementTiles, getRushStepOptions, getSelfBlastRadius, getSummonPlacementTiles, getTargetedBlastAimTiles, getTargetedBlastFootprint, getWallPlacementTiles } from "../rules/arts.js";
import { WEATHER_LABELS } from "../core/weather.js";
import { setSceneWeather } from "./sceneBackdrop.js";

export function getActiveBoardWeather(state) {
  return getActiveWeather(state)?.id ?? null;
}

function createTile(metrics, position, { affinity, selected, legal, targetKind, path, range, aura }) {
  const point = gridToScreen(metrics, position.x, position.y);
  const hw = metrics.tileWidth / 2;
  const hh = metrics.tileHeight / 2;
  const top = [[point.x, point.y], [point.x + hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x - hw, point.y + hh]];
  const left = [[point.x - hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x - hw, point.y + hh + metrics.depth]];
  const right = [[point.x + hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x + hw, point.y + hh + metrics.depth]];
  const classes = ["tile", affinity === "light" ? "tile-light" : "tile-dark"];
  if (selected) classes.push("selected");
  if (range) classes.push(`${range}-range`);
  if (legal) classes.push(`legal-${targetKind}`);
  if (path) classes.push("path");
  // Always-on Deathly Aura tint — lowest priority, so it only paints when no
  // brighter action highlight (legal / range / path / selection) claims the tile.
  if (aura) classes.push("aura-zone", `aura-zone--p${aura}`);
  const tile = svgElement("g", { class: classes.join(" ") });
  tile.append(
    svgElement("polygon", { class: "tile-side-a", points: pointsToString(left) }),
    svgElement("polygon", { class: "tile-side-b", points: pointsToString(right) }),
    svgElement("polygon", { class: "tile-face", points: pointsToString(top) })
  );
  return tile;
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

function createWeatherOverlay(metrics, size, weather) {
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
function createFireFigure(metrics, point) {
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
function createWallFigure(metrics, point) {
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
function createBoardDais(metrics, size) {
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

export function isTargetedMode(mode, actor) {
  if (mode === "attack") return true;
  if (!actor || !mode?.startsWith("art:")) return false;
  const art = getArt(actor.type, mode.slice("art:".length));
  return Boolean(
    art &&
    art.targeting?.shape !== "cone" &&
    art.effect?.type !== "healAllies" &&
    art.resolution !== "flee" &&
    art.resolution !== "summon" &&
    art.targeting?.shape !== "nukeAura" &&
    art.targeting?.shape !== "tilePlacement" &&
    // Father Time's ally-or-enemy casts (Age, Time Stretch) and Rewind's revive
    // placement do their own highlighting below, not the enemy-only targeted wash.
    art.targeting?.shape !== "allyOrEnemy" &&
    art.targeting?.shape !== "revive" &&
    // Juggernaut's line abilities (Tether Grab / Rocket Punch) highlight their own
    // first-contact ray targets below, not the Chebyshev box.
    art.targeting?.shape !== "lineAny" &&
    art.targeting?.shape !== "lineEnemy" &&
    // Angel's Anoint is friendly-only — it does its own ally highlighting below.
    art.targeting?.shape !== "ally" &&
    art.targeting?.shape !== "protectAlly" &&
    // Gargoyle's Flight (empty-tile reposition) and Pyroclasm (self-centred line burst)
    // do their own highlighting below, not the enemy-only Chebyshev box.
    art.targeting?.shape !== "flightMove" &&
    art.targeting?.shape !== "lineBurst" &&
    // Clod's Thunderous Charge picks a tile (targetedBlast) — it highlights its own aim
    // tiles + hover footprint below, not the enemy-only Chebyshev box.
    art.targeting?.shape !== "targetedBlast"
  );
}

export function isHealArtConfirmTile(state, actor, art, position) {
  if (!state || !actor || !art || art.effect?.type !== "healAllies" || !position || !isOnBoard(state, position)) return false;

  if (art.effect.global || art.targeting?.shape === "globalAllies") return true;

  if (art.targeting?.shape === "selfAura") {
    const radius = art.targeting.radius ?? art.effect.radius ?? 3;
    return chebyshevDistance(actor.position, position) <= radius;
  }

  const clicked = unitAt(state, position);
  return Boolean(clicked && clicked.hp > 0 && clicked.player === actor.player);
}

// Hovering a Volley direction lights that cone's tiles so the player sees the
// shot before clicking. Pure DOM class toggling — no re-render — so it can't
// loop on mouseenter.
function wireVolleyHover(cones, tileByKey, unitsLayer, state, onAreaHover) {
  for (const cone of cones) {
    const enter = () => {
      for (const k of cone.cells) tileByKey.get(k)?.classList.add("cone-hot");
      for (const occupant of state.units) {
        if (occupant.hp > 0 && cone.cells.includes(positionKey(occupant.position))) {
          unitsLayer.querySelector(`[data-key="${positionKey(occupant.position)}"]`)?.classList.add("volley-hit");
        }
      }
      onAreaHover?.(cone.origin);
    };
    const leave = () => {
      for (const k of cone.cells) tileByKey.get(k)?.classList.remove("cone-hot");
      unitsLayer.querySelectorAll(".volley-hit").forEach((el) => el.classList.remove("volley-hit"));
      onAreaHover?.(null);
    };
    const hoverKeys = new Set([cone.key, ...cone.cells]);
    for (const key of hoverKeys) {
      const tile = tileByKey.get(key);
      if (!tile) continue;
      tile.addEventListener("mouseenter", enter);
      tile.addEventListener("mouseleave", leave);
    }
  }
}

// Hovering a Thunderous Charge aim tile lights its detonation footprint and the enemies
// inside it, so the player sees the blast before committing. Reuses the volley hot-tile /
// hit-glow classes; pure DOM class toggling (no re-render), so it can't loop on mouseenter.
function wireTargetedBlastHover(actor, art, tileByKey, unitsLayer, state, aimKeys, onAreaHover) {
  const radius = art.targeting?.radius ?? 2;
  for (const key of aimKeys) {
    const tile = tileByKey.get(key);
    if (!tile) continue;
    const [cx, cy] = key.split(",").map(Number);
    const footprint = getTargetedBlastFootprint(state, { x: cx, y: cy }, radius).map(positionKey);
    const enter = () => {
      for (const k of footprint) tileByKey.get(k)?.classList.add("cone-hot");
      for (const occupant of state.units) {
        if (occupant.hp > 0 && areEnemies(actor, occupant) && footprint.includes(positionKey(occupant.position))) {
          unitsLayer.querySelector(`[data-key="${positionKey(occupant.position)}"]`)?.classList.add("volley-hit");
        }
      }
      onAreaHover?.({ x: cx, y: cy });
    };
    const leave = () => {
      for (const k of footprint) tileByKey.get(k)?.classList.remove("cone-hot");
      unitsLayer.querySelectorAll(".volley-hit").forEach((el) => el.classList.remove("volley-hit"));
      onAreaHover?.(null);
    };
    tile.addEventListener("mouseenter", enter);
    tile.addEventListener("mouseleave", leave);
  }
}

export function renderBoard({ board, boardLayer, unitsLayer, state, mode, selectedId, footworkPath, onTileClick, onAreaHover = null }) {
  let legal = new Set();
  let range = new Set();
  const actor = selectedId ? state.units.find((u) => u.id === selectedId) : null;
  const targeted = isTargetedMode(mode, actor);

  // RAGE Trample (Fat Knight): targeted exactly like Footwork/Stumble's rushPath —
  // one adjacent tile at a time via footworkPath — instead of the plain
  // click-anywhere-in-range destination set every other unit's move uses.
  if (mode === "move") legal = (actor && canTrample(actor)) ? getTrampleMoveOptions(state, actor, footworkPath) : getLegalMoves(state, actor);

  if (actor && targeted) {
    // Basic attacks are body-blocked unless the attacker has an explicit pierce passive
    // (Sniper). Physical ARTS can opt out with pierceUnits (Curve Shot), and magic
    // strike ARTS reach through bodies, so their range wash and targets stay unculled.
    const art = mode?.startsWith("art:") ? getArt(actor.type, mode.slice("art:".length)) : null;
    const reach = art ? getArtTargetRange(state, actor, art) : getEffectiveStats(actor, state).attackRange;
    const blockable = mode === "attack" || artIsBodyBlocked(art);
    // Big Brother's Super Magnet: basic attacks must land on one of the 8 straight
    // rays out of the actor, so the wash/target set is culled to those rays instead
    // of the full Chebyshev square — mirrors the reducer's requiresRayBasicAttack gate.
    const rayOnly = mode === "attack" && requiresRayBasicAttack(actor);
    for (let x = actor.position.x - reach; x <= actor.position.x + reach; x += 1) {
      for (let y = actor.position.y - reach; y <= actor.position.y + reach; y += 1) {
        const cell = { x, y };
        if (!isOnBoard(state, cell)) continue;
        if (chebyshevDistance(actor.position, cell) === 0) continue;
        if (rayOnly && !isStraightRayTarget(actor.position, cell)) continue;
        if (blockable && isShotBlocked(state, actor.position, cell, actor)) continue;
        // A wall blocks the line for EVERY ranged ability (physical or magic), so it
        // culls the wash unconditionally — only the Sniper's pierce reaches through.
        if (isWallBetween(state, actor.position, cell, actor)) continue;
        range.add(positionKey(cell));
      }
    }
    for (const target of state.units) {
      if (target.hp > 0 && areEnemies(actor, target) && chebyshevDistance(actor.position, target.position) <= reach &&
          !(rayOnly && !isStraightRayTarget(actor.position, target.position)) &&
          !(blockable && isShotBlocked(state, actor.position, target.position, actor)) &&
          !isWallBetween(state, actor.position, target.position, actor)) {
        legal.add(positionKey(target.position));
      }
    }
    // In attack mode, an in-range wall with a clear shot is itself a legal target
    // (you can destroy cover). A body or another wall between still blocks it; the
    // Sniper's pierce reaches a covered wall.
    if (mode === "attack" || art?.id === "blasting-cap") {
      for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
        if (obj.kind !== "wall") continue;
        const [wx, wy] = key.split(",").map(Number);
        const pos = { x: wx, y: wy };
        if (chebyshevDistance(actor.position, pos) <= reach &&
            !(rayOnly && !isStraightRayTarget(actor.position, pos)) &&
            (art?.id === "blasting-cap" || !isShotBlocked(state, actor.position, pos, actor)) &&
            !isWallBetween(state, actor.position, pos, actor)) {
          legal.add(key);
        }
      }
    }
  }

  let volleyCones = null;
  if (actor && mode?.startsWith("art:")) {
    const coneArt = getArt(actor.type, mode.slice("art:".length));
    if (coneArt?.targeting?.shape === "cone") {
      volleyCones = getConeAimOptions(state, actor).map((origin) => ({
      origin,
      key: positionKey(origin),
        cells: (getConeCells(state, actor, origin, coneArt) ?? []).map(positionKey)
      }));
      for (const cone of volleyCones) for (const k of cone.cells) range.add(k);
      legal = new Set(volleyCones.map((cone) => cone.key));
    }
  }

  if (actor && mode === "footwork") legal = getFootworkStepOptions(state, actor, footworkPath);
  if (actor && mode?.startsWith("art:")) {
    const rushArt = getArt(actor.type, mode.slice("art:".length));
    if (rushArt?.targeting?.shape === "rushPath") legal = getRushStepOptions(state, actor, footworkPath, rushArt);
  }
  if (actor && mode?.startsWith("art:")) {
    const fleeArt = getArt(actor.type, mode.slice("art:".length));
    if (fleeArt?.targeting?.shape === "flee" || fleeArt?.resolution === "flee") legal = getLegalFleeTiles(state, actor, fleeArt);
  }
  // Flight: fly onto a highlighted empty tile (Chebyshev, diagonals allowed).
  if (actor && mode === "art:flight") legal = getFlightTiles(state, actor, getArt(actor.type, "flight"));
  if (actor && mode?.startsWith("art:")) {
    const summonArt = getArt(actor.type, mode.slice("art:".length));
    if (summonArt?.targeting?.shape === "placement" && (summonArt.resolution === "summon" || summonArt.resolution === "summonGhost")) {
      legal = getSummonPlacementTiles(state, actor, summonArt);
    }
  }
  if (actor && mode === "art:build-cover") legal = getWallPlacementTiles(state, actor, getArt(actor.type, "build-cover"));
  if (actor && mode === "art:shaft-prop") legal = getWallPlacementTiles(state, actor, getArt(actor.type, "shaft-prop"));
  if (actor && mode === "art:throw-cigar") legal = getFirePlacementTiles(state, actor, getArt(actor.type, "throw-cigar"));
  // Revive arts place a fallen ally on an empty tile within range (same rule as a summon).
  if (actor && mode?.startsWith("art:")) {
    const reviveArt = getArt(actor.type, mode.slice("art:".length));
    if (reviveArt?.targeting?.shape === "revive") legal = getRevivePlacementTiles(state, actor, reviveArt);
  }

  if (actor && mode?.startsWith("art:")) {
    const protectArt = getArt(actor.type, mode.slice("art:".length));
    if (protectArt?.targeting?.shape === "protectAlly") {
      const reach = getArtTargetRange(state, actor, protectArt);
      for (let dx = -reach; dx <= reach; dx += 1) {
        for (let dy = -reach; dy <= reach; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > reach) continue;
          const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
          if (isOnBoard(state, pos)) range.add(positionKey(pos));
        }
      }
      for (const u of state.units) {
        if (u.hp <= 0 || u.player !== actor.player || u.id === actor.id) continue;
        for (const key of getProtectLandingTiles(state, actor, u, protectArt)) legal.add(key);
      }
    }
  }

  // Self-centred AoE blasts (Dark Bomb, Nuke): preview the whole detonation
  // footprint as a range wash and light every enemy caught inside as a legal
  // target, so the player sees who dies before committing the MP.
  let nukeArt = null;
  if (actor && mode?.startsWith("art:")) {
    const candidate = getArt(actor.type, mode.slice("art:".length));
    if (candidate?.targeting?.shape === "nukeAura") {
      nukeArt = candidate;
      const radius = getSelfBlastRadius(state, actor, candidate);
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
          const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
          if (isOnBoard(state, pos)) range.add(positionKey(pos));
        }
      }
      for (const u of state.units) {
        if (u.hp > 0 && u.player !== actor.player && chebyshevDistance(actor.position, u.position) <= radius)
          legal.add(positionKey(u.position));
      }
    }
  }

  let isHealArt = false;
  if (actor && mode?.startsWith("art:")) {
    const healArt = getArt(actor.type, mode.slice("art:".length));
    if (healArt?.effect?.type === "healAllies") {
      isHealArt = true;
      if (healArt.effect.global || healArt.targeting?.shape === "globalAllies") {
        for (let x = 0; x < state.size; x += 1) {
          for (let y = 0; y < state.size; y += 1) {
            legal.add(positionKey({ x, y }));
          }
        }
      } else if (healArt.targeting?.shape === "selfAura") {
        const radius = healArt.targeting.radius ?? healArt.effect.radius ?? 3;
        for (let dx = -radius; dx <= radius; dx += 1) {
          for (let dy = -radius; dy <= radius; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
            const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
            if (isOnBoard(state, pos)) legal.add(positionKey(pos));
          }
        }
      } else {
        for (const u of state.units) {
          if (u.hp > 0 && u.player === actor.player) legal.add(positionKey(u.position));
        }
      }
    }
  }

  // Father Time's ally-OR-enemy casts (Age, Time Stretch): a Chebyshev range wash
  // (walls block, bodies don't — these aren't physical strikes) plus every unit in
  // range (ally AND enemy) as a legal target. Marked so the target reticle lights on
  // in-range units below, since the bright tile hides under the figure.
  let isAllyOrEnemyArt = false;
  if (actor && mode?.startsWith("art:")) {
    const utilArt = getArt(actor.type, mode.slice("art:".length));
    if (utilArt?.targeting?.shape === "allyOrEnemy") {
      isAllyOrEnemyArt = true;
      const reach = getEffectiveStats(actor, state).attackRange;
      for (let x = actor.position.x - reach; x <= actor.position.x + reach; x += 1) {
        for (let y = actor.position.y - reach; y <= actor.position.y + reach; y += 1) {
          const cell = { x, y };
          if (!isOnBoard(state, cell)) continue;
          if (chebyshevDistance(actor.position, cell) === 0) continue;
          if (isWallBetween(state, actor.position, cell, actor)) continue;
          range.add(positionKey(cell));
        }
      }
      for (const u of state.units) {
        if (u.hp <= 0 || u.id === actor.id) continue;
        if (chebyshevDistance(actor.position, u.position) > reach) continue;
        if (isWallBetween(state, actor.position, u.position, actor)) continue;
        legal.add(positionKey(u.position));
      }
    }
  }

  // Angel's Anoint (shape "ally"): a Chebyshev range wash (walls block, bodies don't —
  // it's a friendly cast) plus every ALLY in range EXCEPT self as a legal target.
  let isAllyArt = false;
  if (actor && mode?.startsWith("art:")) {
    const buffArt = getArt(actor.type, mode.slice("art:".length));
    if (buffArt?.targeting?.shape === "ally") {
      isAllyArt = true;
      const reach = buffArt.targeting?.range ?? getEffectiveStats(actor, state).attackRange;
      for (let x = actor.position.x - reach; x <= actor.position.x + reach; x += 1) {
        for (let y = actor.position.y - reach; y <= actor.position.y + reach; y += 1) {
          const cell = { x, y };
          if (!isOnBoard(state, cell)) continue;
          if (chebyshevDistance(actor.position, cell) === 0) continue;
          range.add(positionKey(cell));
        }
      }
      for (const u of state.units) {
        if (u.hp <= 0 || u.id === actor.id || u.player !== actor.player) continue;
        if (chebyshevDistance(actor.position, u.position) > reach) continue;
        legal.add(positionKey(u.position));
      }
    }
  }

  // Juggernaut's line abilities (Tether Grab / Rocket Punch): always wash the FULL reach
  // of all 8 straight rays so the ability's range reads even when nothing is in line (no
  // more "clicked it and nothing happened"), then light the actual first-contact target as
  // a legal (bright) target. lineAny grabs an ally or enemy; lineEnemy only an enemy (an
  // ally on the ray blocks it, so it is never a legal target).
  let isLineArt = false;
  if (actor && mode?.startsWith("art:")) {
    const lineArt = getArt(actor.type, mode.slice("art:".length));
    const shape = lineArt?.targeting?.shape;
    if (shape === "lineAny" || shape === "lineEnemy") {
      isLineArt = true;
      for (const tile of getLineReachTiles(state, actor, lineArt.targeting.range)) {
        range.add(positionKey(tile));
      }
      for (const { unit: target } of getLineTargets(state, actor, lineArt.targeting.range, { includeAllies: shape === "lineAny" })) {
        legal.add(positionKey(target.position));
      }
    }
  }

  // Gargoyle's Pyroclasm (lineBurst): wash the full reach of all 8 rays and light every
  // enemy standing on a ray as a legal (bright) target — the burst burns through bodies,
  // so a screened enemy is still lit.
  let isPyroclasm = false;
  if (actor && mode?.startsWith("art:")) {
    const burstArt = getArt(actor.type, mode.slice("art:".length));
    if (burstArt?.targeting?.shape === "lineBurst") {
      isPyroclasm = true;
      for (const tile of getPyroclasmReachTiles(state, actor, burstArt)) range.add(positionKey(tile));
      for (const target of getPyroclasmTargets(state, actor, burstArt)) legal.add(positionKey(target.position));
    }
  }

  // Clod's Thunderous Charge (targetedBlast): every legal aim tile is a clickable target
  // (like a placement ART); hovering one previews the 2-tile detonation footprint + the
  // enemies it would catch (wired after the tiles are built, below).
  let blastArt = null;
  if (actor && mode?.startsWith("art:")) {
    const candidate = getArt(actor.type, mode.slice("art:".length));
    if (candidate?.targeting?.shape === "targetedBlast") {
      blastArt = candidate;
      for (const key of getTargetedBlastAimTiles(state, actor, candidate)) legal.add(key);
    }
  }

  const path = new Set(footworkPath.map(positionKey));
  const metrics = createBoardMetrics(state.size);
  const view = createBoardViewBox(metrics, state.size);
  const activeWeather = getActiveBoardWeather(state);
  board.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  boardLayer.replaceChildren();
  unitsLayer.replaceChildren();
  board.classList.toggle("board-focused", Boolean(actor));
  board.setAttribute("data-weather", activeWeather ?? "none");
  setSceneWeather(activeWeather);
  boardLayer.append(createBoardDais(metrics, state.size));

  // Deathly Aura zones (Necromancer + the Ghoul that carries it), tile → source
  // player for faction tinting. Computed every render and independent of selection
  // so the aura is always visible — the per-tile suppression below keeps it under
  // any brighter action highlight.
  const auraByKey = new Map();
  for (const src of getAuraSources(state)) {
    for (let dx = -src.radius; dx <= src.radius; dx += 1) {
      for (let dy = -src.radius; dy <= src.radius; dy += 1) {
        const pos = { x: src.position.x + dx, y: src.position.y + dy };
        if (isOnBoard(state, pos)) auraByKey.set(positionKey(pos), src.player);
      }
    }
  }

  const tileByKey = new Map();
  for (let sum = 0; sum <= (state.size - 1) * 2; sum += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const y = sum - x;
      if (y < 0 || y >= state.size) continue;
      const position = { x, y };
      const key = positionKey(position);
      const isLegal = legal.has(key);
      const isSelected = unitAt(state, position)?.id === selectedId;
      const inRange = !isLegal && range.has(key);
      const inPath = path.has(key);
      const tile = createTile(metrics, position, {
        affinity: getTileAffinity(state, position),
        selected: isSelected,
        legal: isLegal,
        targetKind: mode === "attack" ? "attack" : mode === "move" ? "move" : isHealArt ? "heal" : "art",
        path: inPath,
        range: inRange ? (mode === "attack" ? "attack" : isHealArt ? "heal" : "art") : null,
        aura: !isLegal && !inRange && !inPath && !isSelected ? (auraByKey.get(key) ?? null) : null
      });
      tile.setAttribute("data-key", key);
      tile.addEventListener("click", () => onTileClick(position));
      boardLayer.append(tile);
      tileByKey.set(key, tile);
    }
  }

  const weatherOverlay = createWeatherOverlay(metrics, state.size, activeWeather);
  if (weatherOverlay) boardLayer.append(weatherOverlay);

  if (volleyCones) wireVolleyHover(volleyCones, tileByKey, unitsLayer, state, onAreaHover);
  if (blastArt) wireTargetedBlastHover(actor, blastArt, tileByKey, unitsLayer, state, legal, onAreaHover);

  // Units and tile props (Build Cover walls, Throw Cigar fire) share ONE depth-
  // sorted layer so isometric occlusion is correct: a prop closer to the viewer
  // (larger x+y) paints over a unit behind it, and a unit in front paints over a
  // prop behind it. Painting walls/fire inside the board layer (as before) put
  // every unit on top of every wall regardless of depth — the layering bug. Ties
  // on the same anti-diagonal can't visually overlap; only a unit standing in
  // fire shares a tile, and `z` keeps that unit above its own fire.
  const renderables = [];
  for (const u of state.units) {
    if (u.hp <= 0 || u.introHidden) continue;
    renderables.push({
      depth: u.position.x + u.position.y,
      z: 1,
      make: () => {
        const isTarget = actor && legal.has(positionKey(u.position)) && (
          ((targeted || Boolean(nukeArt)) && u.player !== actor.player) ||
          // Age / Time Stretch reticle every in-range unit they can target (ally or enemy).
          (isAllyOrEnemyArt && u.id !== actor.id) ||
          // Anoint reticles an in-range ally (never self).
          (isAllyArt && u.id !== actor.id && u.player === actor.player) ||
          // Line abilities reticle their first-contact target (ally or enemy).
          (isLineArt && u.id !== actor.id) ||
          // Pyroclasm reticles every enemy caught on its rays.
          (isPyroclasm && u.player !== actor.player)
        );
        return createUnitFigure(metrics, u, { isTarget, selectedId, onUnitClick: onTileClick, state });
      }
    });
  }
  for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
    if (obj.kind !== "wall" && obj.kind !== "fire") continue;
    const [x, y] = key.split(",").map(Number);
    const position = { x, y };
    const point = gridToScreen(metrics, x, y);
    renderables.push({
      depth: x + y,
      z: 0,
      make: () => {
        const fig = obj.kind === "wall" ? createWallFigure(metrics, point) : createFireFigure(metrics, point);
        if (obj.kind !== "wall") fig.addEventListener("click", () => onTileClick(position));
        return fig;
      }
    });
  }
  renderables.sort((a, b) => a.depth - b.depth || a.z - b.z);
  for (const r of renderables) unitsLayer.append(r.make());
}
