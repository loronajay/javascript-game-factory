import { svgElement } from "./svgHelpers.js";
import { createUnitFigure } from "./unitRenderer.js";
import { createBoardMetrics, createBoardViewBox, getBoardDiamond, gridToScreen, pointsToString } from "./isometric.js";
import { getArt, getAuraSources, getEffectiveStats } from "../core/unitCatalog.js";
import { getTileAffinity, unitAt } from "../core/state.js";
import { chebyshevDistance, getLegalMoves, isOnBoard, positionKey } from "../rules/movement.js";
import { isShotBlocked, isWallBetween } from "../rules/combat.js";
import { artUsesPhysicalStrike, getFirePlacementTiles, getFootworkStepOptions, getLegalFleeTiles, getRevivePlacementTiles, getSelfBlastRadius, getSummonPlacementTiles, getVolleyShotAimOptions, getVolleyShotCells, getWallPlacementTiles } from "../rules/arts.js";

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
  if (!actor || !mode?.startsWith("art:") || mode === "art:volley-shot") return false;
  const art = getArt(actor.type, mode.slice("art:".length));
  return Boolean(
    art &&
    art.effect?.type !== "healAllies" &&
    art.resolution !== "flee" &&
    art.resolution !== "summon" &&
    art.targeting?.shape !== "nukeAura" &&
    art.targeting?.shape !== "tilePlacement" &&
    // Father Time's ally-or-enemy casts (Age, Time Stretch) and Rewind's revive
    // placement do their own highlighting below, not the enemy-only targeted wash.
    art.targeting?.shape !== "allyOrEnemy" &&
    art.targeting?.shape !== "revive"
  );
}

// Hovering a Volley direction lights that cone's tiles so the player sees the
// shot before clicking. Pure DOM class toggling — no re-render — so it can't
// loop on mouseenter.
function wireVolleyHover(cones, tileByKey, unitsLayer, state) {
  for (const cone of cones) {
    const aimTile = tileByKey.get(cone.key);
    if (!aimTile) continue;
    const enter = () => {
      for (const k of cone.cells) tileByKey.get(k)?.classList.add("cone-hot");
      for (const occupant of state.units) {
        if (occupant.hp > 0 && cone.cells.includes(positionKey(occupant.position))) {
          unitsLayer.querySelector(`[data-key="${positionKey(occupant.position)}"]`)?.classList.add("volley-hit");
        }
      }
    };
    const leave = () => {
      for (const k of cone.cells) tileByKey.get(k)?.classList.remove("cone-hot");
      unitsLayer.querySelectorAll(".volley-hit").forEach((el) => el.classList.remove("volley-hit"));
    };
    aimTile.addEventListener("mouseenter", enter);
    aimTile.addEventListener("mouseleave", leave);
  }
}

export function renderBoard({ board, boardLayer, unitsLayer, state, mode, selectedId, footworkPath, onTileClick }) {
  let legal = new Set();
  let range = new Set();
  const actor = selectedId ? state.units.find((u) => u.id === selectedId) : null;
  const targeted = isTargetedMode(mode, actor);

  if (mode === "move") legal = getLegalMoves(state, actor);

  if (actor && targeted) {
    const reach = getEffectiveStats(actor, state).attackRange;
    // Body-blocking only applies to physical strikes (basic attack + physical ARTS);
    // magic ARTS reach through bodies, so their range wash and targets stay unculled.
    const art = mode?.startsWith("art:") ? getArt(actor.type, mode.slice("art:".length)) : null;
    const blockable = mode === "attack" || artUsesPhysicalStrike(art);
    for (let x = actor.position.x - reach; x <= actor.position.x + reach; x += 1) {
      for (let y = actor.position.y - reach; y <= actor.position.y + reach; y += 1) {
        const cell = { x, y };
        if (!isOnBoard(state, cell)) continue;
        if (chebyshevDistance(actor.position, cell) === 0) continue;
        if (blockable && isShotBlocked(state, actor.position, cell, actor)) continue;
        // A wall blocks the line for EVERY ranged ability (physical or magic), so it
        // culls the wash unconditionally — only the Sniper's pierce reaches through.
        if (isWallBetween(state, actor.position, cell, actor)) continue;
        range.add(positionKey(cell));
      }
    }
    for (const target of state.units) {
      if (target.hp > 0 && target.player !== actor.player && chebyshevDistance(actor.position, target.position) <= reach &&
          !(blockable && isShotBlocked(state, actor.position, target.position, actor)) &&
          !isWallBetween(state, actor.position, target.position, actor)) {
        legal.add(positionKey(target.position));
      }
    }
    // In attack mode, an in-range wall with a clear shot is itself a legal target
    // (you can destroy cover). A body or another wall between still blocks it; the
    // Sniper's pierce reaches a covered wall.
    if (mode === "attack") {
      for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
        if (obj.kind !== "wall") continue;
        const [wx, wy] = key.split(",").map(Number);
        const pos = { x: wx, y: wy };
        if (chebyshevDistance(actor.position, pos) <= reach &&
            !isShotBlocked(state, actor.position, pos, actor) &&
            !isWallBetween(state, actor.position, pos, actor)) {
          legal.add(key);
        }
      }
    }
  }

  let volleyCones = null;
  if (actor && mode === "art:volley-shot") {
    volleyCones = getVolleyShotAimOptions(state, actor).map((origin) => ({
      origin,
      key: positionKey(origin),
      cells: (getVolleyShotCells(state, actor, origin) ?? []).map(positionKey)
    }));
    for (const cone of volleyCones) for (const k of cone.cells) range.add(k);
    legal = new Set(volleyCones.map((cone) => cone.key));
  }

  if (actor && mode === "footwork") legal = getFootworkStepOptions(state, actor, footworkPath);
  if (actor && mode === "art:flee") legal = getLegalFleeTiles(state, actor);
  if (actor && mode === "art:summon-ghoul") legal = getSummonPlacementTiles(state, actor, getArt(actor.type, "summon-ghoul"));
  if (actor && mode === "art:build-cover") legal = getWallPlacementTiles(state, actor, getArt(actor.type, "build-cover"));
  if (actor && mode === "art:throw-cigar") legal = getFirePlacementTiles(state, actor, getArt(actor.type, "throw-cigar"));
  // Rewind places a revived ally on an empty tile within range (same rule as a summon).
  if (actor && mode === "art:rewind") legal = getRevivePlacementTiles(state, actor, getArt(actor.type, "rewind"));

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
      if (healArt.targeting?.shape === "selfAura") {
        const radius = healArt.targeting.radius ?? healArt.effect.radius ?? 3;
        for (let dx = -radius; dx <= radius; dx += 1) {
          for (let dy = -radius; dy <= radius; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
            const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
            if (isOnBoard(state, pos)) range.add(positionKey(pos));
          }
        }
        for (const u of state.units) {
          if (u.hp > 0 && u.player === actor.player && chebyshevDistance(actor.position, u.position) <= radius)
            legal.add(positionKey(u.position));
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

  const path = new Set(footworkPath.map(positionKey));
  const metrics = createBoardMetrics(state.size);
  const view = createBoardViewBox(metrics, state.size);
  board.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  boardLayer.replaceChildren();
  unitsLayer.replaceChildren();
  board.classList.toggle("board-focused", Boolean(actor));
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
      tile.addEventListener("click", () => onTileClick(position));
      boardLayer.append(tile);
      tileByKey.set(key, tile);
    }
  }

  if (volleyCones) wireVolleyHover(volleyCones, tileByKey, unitsLayer, state);

  // Units and tile props (Build Cover walls, Throw Cigar fire) share ONE depth-
  // sorted layer so isometric occlusion is correct: a prop closer to the viewer
  // (larger x+y) paints over a unit behind it, and a unit in front paints over a
  // prop behind it. Painting walls/fire inside the board layer (as before) put
  // every unit on top of every wall regardless of depth — the layering bug. Ties
  // on the same anti-diagonal can't visually overlap; only a unit standing in
  // fire shares a tile, and `z` keeps that unit above its own fire.
  const renderables = [];
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    renderables.push({
      depth: u.position.x + u.position.y,
      z: 1,
      make: () => {
        const isTarget = actor && legal.has(positionKey(u.position)) && (
          ((targeted || Boolean(nukeArt)) && u.player !== actor.player) ||
          // Age / Time Stretch reticle every in-range unit they can target (ally or enemy).
          (isAllyOrEnemyArt && u.id !== actor.id)
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
