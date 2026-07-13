import { gridToScreen } from "./isometric.js";

/** Owns mutable board geometry and unit lookup for the effects composition root. */
export function createEffectEnvironment({ metrics, unitsLayer }) {
  let boardMetrics = metrics;

  function setMetrics(next) {
    boardMetrics = next;
  }

  function getMetrics() {
    return boardMetrics;
  }

  function unitBase(position) {
    const point = gridToScreen(boardMetrics, position.x, position.y);
    return { x: point.x, y: point.y + boardMetrics.tileHeight * 0.45 };
  }

  function unitElement(unitId) {
    return unitsLayer?.querySelector(`[data-id="${unitId}"]`);
  }

  function effectPoint(position, lift = 0) {
    const base = unitBase(position);
    return { x: base.x, y: base.y - lift };
  }

  return { setMetrics, getMetrics, unitBase, unitElement, effectPoint };
}
