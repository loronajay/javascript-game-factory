// Keeping the scene's decor in step with the layout.
//
// `sync(layout)` is the whole API: it adds models for new rows, removes
// models for rows that are gone, rebuilds a model whose finish changed
// (item, colour, length, scale, words, picture, mount, or whether it gets a light) and repositions
// the rest in place. The editor calls it after every layout change and never
// touches a decor mesh itself.

import { MAX_DECOR_LIGHTS, MAX_LIT_DECOR, decorLightCount, findDecor } from "./arcade-room-catalog/decor.mjs";
import { createDecorModel, disposeDecorModel, placeDecorModel } from "./arcade-room-decor-model.mjs";
import type { RoomDecorItem, RoomLayout } from "./arcade-room-layout.mjs";

type ThreeNamespace = Record<string, any>;

type DecorEntry = { model: any; signature: string };

export type DecorRuntime = Readonly<{
  sync: (layout: RoomLayout) => void;
  /** Every decor root currently in the scene, for raycasting. */
  models: () => any[];
  modelFor: (instanceId: string) => any | undefined;
}>;

function signatureOf(item: RoomDecorItem, lights: number): string {
  return `${item.itemId}|${item.color}|${item.length}|${item.scale}|${item.text}|${item.image}|${item.aspect}|${item.mount}|lights:${lights}`;
}

/**
 * How many light sources each row gets: lit-capable items in layout order, each
 * asking for `decorLightCount` (one per few metres of length), until either the
 * item cap or the room's light budget runs out. An item the budget cannot fully
 * serve gets what is left rather than nothing, so the last strip in still lights
 * up, only more sparsely; rows past the budget keep their glow and get no light.
 */
export function decorLightAllocation(layout: RoomLayout): Map<string, number> {
  const allocation = new Map<string, number>();
  let items = 0;
  let lights = 0;
  for (const item of layout.decor) {
    if (items >= MAX_LIT_DECOR || lights >= MAX_DECOR_LIGHTS) break;
    const definition = findDecor(item.itemId);
    if (!definition?.light) continue;
    const count = Math.min(decorLightCount(definition, item), MAX_DECOR_LIGHTS - lights);
    allocation.set(item.instanceId, count);
    items += 1;
    lights += count;
  }
  return allocation;
}

/** Kept for callers that only ask which rows are lit at all. */
export function litInstanceIds(layout: RoomLayout): Set<string> {
  return new Set(decorLightAllocation(layout).keys());
}

export function createDecorRuntime(THREE: ThreeNamespace, scene: any): DecorRuntime {
  const entries = new Map<string, DecorEntry>();

  function sync(layout: RoomLayout): void {
    const allocation = decorLightAllocation(layout);
    const keep = new Set<string>();
    for (const item of layout.decor) {
      const definition = findDecor(item.itemId);
      if (!definition) continue;
      keep.add(item.instanceId);
      const lights = allocation.get(item.instanceId) ?? 0;
      const signature = signatureOf(item, lights);
      let entry = entries.get(item.instanceId);
      if (entry && entry.signature !== signature) {
        disposeDecorModel(entry.model);
        entry = undefined;
      }
      if (!entry) {
        const model = createDecorModel(THREE, definition, item, lights);
        scene.add(model);
        entry = { model, signature };
        entries.set(item.instanceId, entry);
      }
      placeDecorModel(entry.model, item);
    }
    for (const [instanceId, entry] of entries) {
      if (keep.has(instanceId)) continue;
      disposeDecorModel(entry.model);
      entries.delete(instanceId);
    }
  }

  return Object.freeze({
    sync,
    models: () => [...entries.values()].map((entry) => entry.model),
    modelFor: (instanceId) => entries.get(instanceId)?.model,
  });
}
