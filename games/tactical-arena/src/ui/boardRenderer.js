import { svgElement } from "./svgHelpers.js";
import { createUnitFigure } from "./unitRenderer.js";
import { createBoardMetrics, createBoardViewBox, getBoardDiamond, gridToScreen, pointsToString } from "./isometric.js";
import { getArt, getEffectiveStats } from "../core/unitCatalog.js";
import { getTileAffinity, unitAt } from "../core/state.js";
import { chebyshevDistance, getLegalMoves, isOnBoard, positionKey } from "../rules/movement.js";
import { getFootworkStepOptions, getLegalFleeTiles, getVolleyShotAimOptions, getVolleyShotCells } from "../rules/arts.js";

function createTile(metrics, position, { affinity, selected, legal, targetKind, path, range }) {
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
  const tile = svgElement("g", { class: classes.join(" ") });
  tile.append(
    svgElement("polygon", { class: "tile-side-a", points: pointsToString(left) }),
    svgElement("polygon", { class: "tile-side-b", points: pointsToString(right) }),
    svgElement("polygon", { class: "tile-face", points: pointsToString(top) })
  );
  return tile;
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
  return Boolean(art && art.effect?.type !== "healAllies" && art.resolution !== "flee");
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
    for (let x = actor.position.x - reach; x <= actor.position.x + reach; x += 1) {
      for (let y = actor.position.y - reach; y <= actor.position.y + reach; y += 1) {
        const cell = { x, y };
        if (!isOnBoard(state, cell)) continue;
        if (chebyshevDistance(actor.position, cell) === 0) continue;
        range.add(positionKey(cell));
      }
    }
    for (const target of state.units) {
      if (target.hp > 0 && target.player !== actor.player && chebyshevDistance(actor.position, target.position) <= reach) {
        legal.add(positionKey(target.position));
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

  const path = new Set(footworkPath.map(positionKey));
  const metrics = createBoardMetrics(state.size);
  const view = createBoardViewBox(metrics, state.size);
  board.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  boardLayer.replaceChildren();
  unitsLayer.replaceChildren();
  board.classList.toggle("board-focused", Boolean(actor));
  boardLayer.append(createBoardDais(metrics, state.size));

  const tileByKey = new Map();
  for (let sum = 0; sum <= (state.size - 1) * 2; sum += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const y = sum - x;
      if (y < 0 || y >= state.size) continue;
      const position = { x, y };
      const key = positionKey(position);
      const isLegal = legal.has(key);
      const tile = createTile(metrics, position, {
        affinity: getTileAffinity(state, position),
        selected: unitAt(state, position)?.id === selectedId,
        legal: isLegal,
        targetKind: mode === "attack" ? "attack" : mode === "move" ? "move" : isHealArt ? "heal" : "art",
        path: path.has(key),
        range: !isLegal && range.has(key) ? (mode === "attack" ? "attack" : isHealArt ? "heal" : "art") : null
      });
      tile.addEventListener("click", () => onTileClick(position));
      boardLayer.append(tile);
      tileByKey.set(key, tile);
    }
  }

  if (volleyCones) wireVolleyHover(volleyCones, tileByKey, unitsLayer, state);

  [...state.units]
    .filter((u) => u.hp > 0)
    .sort((a, b) => (a.position.x + a.position.y) - (b.position.x + b.position.y))
    .forEach((u) => {
      const isTarget = targeted && actor && u.player !== actor.player && legal.has(positionKey(u.position));
      unitsLayer.append(createUnitFigure(metrics, u, { isTarget, selectedId, onUnitClick: onTileClick, state }));
    });
}
