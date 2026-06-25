import { svgElement } from "./svgHelpers.js";
import { createUnitFigure } from "./unitRenderer.js";
import { createBoardMetrics, createBoardViewBox, gridToScreen, pointsToString } from "./isometric.js";
import { getArt, getEffectiveStats } from "../core/unitCatalog.js";
import { unitAt } from "../core/state.js";
import { chebyshevDistance, getLegalMoves, isOnBoard, positionKey } from "../rules/movement.js";
import { getFootworkStepOptions, getVolleyShotAimOptions, getVolleyShotCells } from "../rules/arts.js";

function createTile(metrics, position, { selected, legal, targetKind, path, range }) {
  const point = gridToScreen(metrics, position.x, position.y);
  const hw = metrics.tileWidth / 2;
  const hh = metrics.tileHeight / 2;
  const top = [[point.x, point.y], [point.x + hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x - hw, point.y + hh]];
  const left = [[point.x - hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x - hw, point.y + hh + metrics.depth]];
  const right = [[point.x + hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x + hw, point.y + hh + metrics.depth]];
  const classes = ["tile", (position.x + position.y) % 2 === 0 ? "tile-light" : "tile-dark"];
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

export function isTargetedMode(mode, actor) {
  if (mode === "attack") return true;
  if (!actor || !mode?.startsWith("art:") || mode === "art:volley-shot") return false;
  const art = getArt(actor.type, mode.slice("art:".length));
  return Boolean(art && art.effect?.type !== "healAllies");
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

  const path = new Set(footworkPath.map(positionKey));
  const metrics = createBoardMetrics(state.size);
  const view = createBoardViewBox(metrics, state.size);
  board.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  boardLayer.replaceChildren();
  unitsLayer.replaceChildren();
  board.classList.toggle("board-focused", Boolean(actor));

  const tileByKey = new Map();
  for (let sum = 0; sum <= (state.size - 1) * 2; sum += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const y = sum - x;
      if (y < 0 || y >= state.size) continue;
      const position = { x, y };
      const key = positionKey(position);
      const isLegal = legal.has(key);
      const tile = createTile(metrics, position, {
        selected: unitAt(state, position)?.id === selectedId,
        legal: isLegal,
        targetKind: mode === "attack" ? "attack" : mode === "move" ? "move" : "art",
        path: path.has(key),
        range: !isLegal && range.has(key) ? (mode === "attack" ? "attack" : "art") : null
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
