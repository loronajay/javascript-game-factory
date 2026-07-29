import { getTileAffinity } from "../core/state.js";
import { positionFromKey, positionKey } from "../rules/movement.js";
import { createBoardDais, createWeatherOverlay } from "./boardAtmosphere.js";

const boardLayerCache = new WeakMap();
const wiredBoardLayers = new WeakSet();
const weatherLayerCache = new WeakMap();
const unitsLayerCache = new WeakMap();

export function tileClassName({ affinity, selected, legal, targetKind, path, range, aura }) {
  const classes = ["tile", affinity === "light" ? "tile-light" : "tile-dark"];
  if (selected) classes.push("selected");
  if (range) classes.push(`${range}-range`);
  if (legal) classes.push(`legal-${targetKind}`);
  if (path) classes.push("path");
  if (aura) classes.push("aura-zone", `aura-zone--p${aura}`);
  return classes.join(" ");
}

function keyedAncestor(start, root, attribute) {
  let node = start;
  while (node) {
    if (node.getAttribute?.(attribute)) return node;
    if (node === root) break;
    node = node.parentNode;
  }
  return null;
}

export function ensureBoardGeometry(boardLayer, metrics, state, createTile) {
  let cache = boardLayerCache.get(boardLayer);
  if (cache?.size === state.size) return cache;

  cache?.hoverCleanups?.forEach((cleanup) => cleanup());
  const tileByKey = new Map();
  const children = [createBoardDais(metrics, state.size)];
  for (let sum = 0; sum <= (state.size - 1) * 2; sum += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const y = sum - x;
      if (y < 0 || y >= state.size) continue;
      const position = { x, y };
      const key = positionKey(position);
      const tile = createTile(metrics, position, {
        affinity: getTileAffinity(state, position),
        selected: false,
        legal: false,
        targetKind: "art",
        path: false,
        range: null,
        aura: null
      });
      tile.setAttribute("data-key", key);
      children.push(tile);
      tileByKey.set(key, tile);
    }
  }

  boardLayer.replaceChildren(...children);
  cache = { size: state.size, tileByKey, onTileClick: null, hoverCleanups: [] };
  boardLayerCache.set(boardLayer, cache);
  if (!wiredBoardLayers.has(boardLayer)) {
    wiredBoardLayers.add(boardLayer);
    boardLayer.addEventListener("click", (event) => {
      const current = boardLayerCache.get(boardLayer);
      const tile = keyedAncestor(event.target, boardLayer, "data-key");
      const key = tile?.getAttribute?.("data-key");
      if (!current || !key || !current.tileByKey.has(key)) return;
      current.onTileClick?.(positionFromKey(key));
    });
  }
  return cache;
}

export function updateWeatherLayer(host, boardLayer, metrics, size, weather) {
  const signature = `${size}:${weather ?? "none"}`;
  const previous = weatherLayerCache.get(host);
  if (previous?.signature === signature) return previous.overlay;

  const overlay = createWeatherOverlay(metrics, size, weather);
  if (host === boardLayer) {
    previous?.overlay?.remove();
    if (overlay) host.append(overlay);
  } else {
    host.replaceChildren(...(overlay ? [overlay] : []));
  }
  weatherLayerCache.set(host, { signature, overlay });
  return overlay;
}

function syncChildren(parent, desired) {
  const current = [...parent.children];
  if (current.length === desired.length && desired.every((child, index) => current[index] === child)) return;
  if (typeof parent.insertBefore !== "function") {
    parent.replaceChildren(...desired);
    return;
  }
  for (let index = 0; index < desired.length; index += 1) {
    if (parent.children[index] !== desired[index]) {
      parent.insertBefore(desired[index], parent.children[index] ?? null);
    }
  }
  const keep = new Set(desired);
  for (const child of [...parent.children]) {
    if (!keep.has(child)) child.remove();
  }
}

export function reconcileUnitLayer(unitsLayer, { size, renderables, onTileClick, onUnitHover, units }) {
  let cache = unitsLayerCache.get(unitsLayer);
  if (!cache || cache.size !== size) {
    cache = { size, entries: new Map(), onTileClick, onUnitHover, unitsById: new Map() };
    unitsLayerCache.set(unitsLayer, cache);
  }
  cache.onTileClick = onTileClick;
  cache.onUnitHover = onUnitHover;
  cache.unitsById = new Map(units.map((unit) => [unit.id, unit]));

  const nextEntries = new Map();
  const desired = [];
  for (const renderable of renderables) {
    const previous = cache.entries.get(renderable.key);
    const element = previous?.signature === renderable.signature ? previous.element : renderable.make(cache);
    nextEntries.set(renderable.key, { signature: renderable.signature, element });
    desired.push(element);
  }
  cache.entries = nextEntries;
  syncChildren(unitsLayer, desired);
}
