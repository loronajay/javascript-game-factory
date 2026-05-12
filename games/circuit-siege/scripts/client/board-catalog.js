import { loadBoardDefinition } from "../shared/circuit-board.js";

export function selectMapEntry(manifest, {
  preferredMapId = null,
  randomFn = Math.random
} = {}) {
  const maps = Array.isArray(manifest?.maps) ? manifest.maps.filter((entry) => entry?.mapId && entry?.path) : [];

  if (maps.length === 0) {
    throw new Error("Map manifest must include at least one map entry.");
  }

  if (preferredMapId) {
    const preferredEntry = maps.find((entry) => entry.mapId === preferredMapId);
    if (preferredEntry) {
      return preferredEntry;
    }
  }

  if (manifest?.selectionMode === "default" && manifest?.defaultMapId) {
    const defaultEntry = maps.find((entry) => entry.mapId === manifest.defaultMapId);
    if (defaultEntry) {
      return defaultEntry;
    }
  }

  const rawIndex = Math.floor(Number(randomFn()) * maps.length);
  const safeIndex = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.min(rawIndex, maps.length - 1) : 0;
  return maps[safeIndex];
}

async function fetchJson(fetchImpl, path) {
  const response = await fetchImpl(path);
  if (!response?.ok) {
    throw new Error(`Failed to load JSON from ${path}`);
  }

  return response.json();
}

export function createBoardCatalogLoader({
  fetchImpl = fetch,
  manifestPath = "./maps/index.json",
  fallbackMapPath = "./maps/canon-v1.json"
} = {}) {
  let manifestPromise = null;
  const boardCache = new Map();

  async function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetchJson(fetchImpl, manifestPath);
    }
    return manifestPromise;
  }

  async function loadBoardFromPath(path) {
    if (!boardCache.has(path)) {
      boardCache.set(path, fetchJson(fetchImpl, path).then((rawBoard) => loadBoardDefinition(rawBoard)));
    }
    return boardCache.get(path);
  }

  async function loadBoardByMapId(mapId) {
    const manifest = await loadManifest();
    const mapEntry = selectMapEntry(manifest, {
      preferredMapId: mapId,
      randomFn: () => 0
    });

    if (!mapEntry || mapEntry.mapId !== mapId) {
      throw new Error(`Unknown map id: ${mapId}`);
    }

    const board = await loadBoardFromPath(mapEntry.path);
    return {
      board,
      mapEntry,
      manifest
    };
  }

  async function loadInitialBoard({
    preferredMapId = null,
    randomFn = Math.random
  } = {}) {
    try {
      const manifest = await loadManifest();
      const mapEntry = selectMapEntry(manifest, {
        preferredMapId,
        randomFn
      });
      const board = await loadBoardFromPath(mapEntry.path);
      return {
        board,
        mapEntry,
        manifest
      };
    } catch (error) {
      const board = await loadBoardFromPath(fallbackMapPath);
      return {
        board,
        mapEntry: {
          mapId: board.mapId || "fallback-map",
          title: board.title || "Fallback Map",
          path: fallbackMapPath
        },
        manifest: null,
        fallbackReason: error.message
      };
    }
  }

  return {
    loadManifest,
    loadBoardByMapId,
    loadInitialBoard
  };
}

export async function loadBoardCatalog({
  fetchImpl = fetch,
  manifestPath = "./maps/index.json",
  fallbackMapPath = "./maps/canon-v1.json",
  preferredMapId = null,
  randomFn = Math.random
} = {}) {
  const loader = createBoardCatalogLoader({
    fetchImpl,
    manifestPath,
    fallbackMapPath
  });
  return loader.loadInitialBoard({
    preferredMapId,
    randomFn
  });
}
