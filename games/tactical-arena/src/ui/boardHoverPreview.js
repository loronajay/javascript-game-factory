import { areEnemies } from "../core/state.js";
import { getTargetedBlastFootprint } from "../rules/arts.js";
import { positionKey } from "../rules/movement.js";
import { isTargetable } from "../rules/statuses.js";

export function wireVolleyHover(cones, tileByKey, unitsLayer, state, onAreaHover) {
  const cleanups = [];
  for (const cone of cones) {
    const enter = () => {
      for (const key of cone.cells) tileByKey.get(key)?.classList.add("cone-hot");
      for (const occupant of state.units) {
        if (occupant.hp > 0 && cone.cells.includes(positionKey(occupant.position))) {
          unitsLayer.querySelector(`[data-key="${positionKey(occupant.position)}"]`)?.classList.add("volley-hit");
        }
      }
      onAreaHover?.(cone.origin);
    };
    const leave = () => {
      for (const key of cone.cells) tileByKey.get(key)?.classList.remove("cone-hot");
      unitsLayer.querySelectorAll(".volley-hit").forEach((element) => element.classList.remove("volley-hit"));
      onAreaHover?.(null);
    };
    for (const key of new Set([cone.key, ...cone.cells])) {
      const tile = tileByKey.get(key);
      if (!tile) continue;
      tile.addEventListener("mouseenter", enter);
      tile.addEventListener("mouseleave", leave);
      cleanups.push(() => {
        tile.removeEventListener?.("mouseenter", enter);
        tile.removeEventListener?.("mouseleave", leave);
      });
    }
  }
  return cleanups;
}

export function wireTargetedBlastHover(actor, art, tileByKey, unitsLayer, state, aimKeys, onAreaHover) {
  const cleanups = [];
  const radius = art.targeting?.radius ?? 2;
  for (const key of aimKeys) {
    const tile = tileByKey.get(key);
    if (!tile) continue;
    const [cx, cy] = key.split(",").map(Number);
    const footprint = getTargetedBlastFootprint(state, { x: cx, y: cy }, radius).map(positionKey);
    const enter = () => {
      for (const footprintKey of footprint) tileByKey.get(footprintKey)?.classList.add("cone-hot");
      for (const occupant of state.units) {
        if (isTargetable(occupant) && areEnemies(actor, occupant) && footprint.includes(positionKey(occupant.position))) {
          unitsLayer.querySelector(`[data-key="${positionKey(occupant.position)}"]`)?.classList.add("volley-hit");
        }
      }
      onAreaHover?.({ x: cx, y: cy });
    };
    const leave = () => {
      for (const footprintKey of footprint) tileByKey.get(footprintKey)?.classList.remove("cone-hot");
      unitsLayer.querySelectorAll(".volley-hit").forEach((element) => element.classList.remove("volley-hit"));
      onAreaHover?.(null);
    };
    tile.addEventListener("mouseenter", enter);
    tile.addEventListener("mouseleave", leave);
    cleanups.push(() => {
      tile.removeEventListener?.("mouseenter", enter);
      tile.removeEventListener?.("mouseleave", leave);
    });
  }
  return cleanups;
}
