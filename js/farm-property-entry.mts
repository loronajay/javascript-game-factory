import type { LayoutStore, LoadResult } from "./arcade-room-store.mjs";
import type { FarmLayout } from "./farm-layout.mjs";

/** Only a fresh platform entry selects the preferred home. Trip returns retain their current farm. */
export async function loadFarmEntry(store: LayoutStore<FarmLayout>, api: Readonly<{
  saveGameGarage: (slug: string, command: unknown) => Promise<any>;
}>, search: URLSearchParams): Promise<LoadResult<FarmLayout>> {
  const loaded = await store.load();
  if (store.mode !== "owner" || !store.accountBacked || loaded.source !== "account"
    || search.has("from") || search.has("id") || search.has("property") || search.has("horse")) return loaded;
  const preferred = loaded.layout.defaultProperty;
  if (!preferred || preferred === (loaded.layout.lot ?? "meadow")) return loaded;
  const result = await api.saveGameGarage("farm", { selectProperty: preferred, propertyRevision: loaded.layout.propertyRevision ?? 0 }).catch(() => null);
  // The API has kept the original farm safe if selection fails (for example during a trade).
  return result?.ok ? store.load() : loaded;
}
