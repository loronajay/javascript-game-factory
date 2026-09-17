// Keeping the scene's decor in step with the layout.
//
// `sync(layout)` is the whole API: it adds models for new rows, removes
// models for rows that are gone, rebuilds a model whose finish changed
// (item, colour, length, mount, or whether it gets a light) and repositions
// the rest in place. The editor calls it after every layout change and never
// touches a decor mesh itself.

import { MAX_LIT_DECOR, findDecor } from "./arcade-room-catalog/decor.mjs";
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

function signatureOf(item: RoomDecorItem, lit: boolean): string {
  return `${item.itemId}|${item.color}|${item.length}|${item.mount}|${lit ? "lit" : "dark"}`;
}

/** Which rows get a real light: the first `MAX_LIT_DECOR` lit-capable items in layout order. */
export function litInstanceIds(layout: RoomLayout): Set<string> {
  const lit = new Set<string>();
  for (const item of layout.decor) {
    if (lit.size >= MAX_LIT_DECOR) break;
    if (findDecor(item.itemId)?.light) lit.add(item.instanceId);
  }
  return lit;
}

export function createDecorRuntime(THREE: ThreeNamespace, scene: any): DecorRuntime {
  const entries = new Map<string, DecorEntry>();

  function sync(layout: RoomLayout): void {
    const lit = litInstanceIds(layout);
    const keep = new Set<string>();
    for (const item of layout.decor) {
      const definition = findDecor(item.itemId);
      if (!definition) continue;
      keep.add(item.instanceId);
      const signature = signatureOf(item, lit.has(item.instanceId));
      let entry = entries.get(item.instanceId);
      if (entry && entry.signature !== signature) {
        disposeDecorModel(entry.model);
        entry = undefined;
      }
      if (!entry) {
        const model = createDecorModel(THREE, definition, item, lit.has(item.instanceId));
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
