const GAME_SLUG = "yam-bowling";

function cleanPlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

async function readJson(response) {
  try {
    return await response?.json?.();
  } catch {
    return null;
  }
}

// Public profile inspection has no garage route by design. It joins the one
// public presentation document with the one public progression document and
// returns nothing unless both authoritative reads succeeded.
export function createPublicProfileClient({
  platformApi,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  async function load(playerId) {
    const normalizedPlayerId = cleanPlayerId(playerId);
    if (!normalizedPlayerId || typeof fetchImpl !== "function") return null;

    const encoded = encodeURIComponent(normalizedPlayerId);
    const [loadoutResponse, progression] = await Promise.all([
      fetchImpl(`${platformApi?.baseUrl || ""}/games/${GAME_SLUG}/loadout/${encoded}`, {
        method: "GET",
        credentials: "include",
      }).catch(() => null),
      platformApi?.getGameProgression?.(GAME_SLUG, normalizedPlayerId)?.catch?.(() => null) ?? null,
    ]);
    if (!loadoutResponse?.ok || !progression) return null;
    const payload = await readJson(loadoutResponse);
    if (!payload?.loadout) return null;
    return {
      playerId: normalizedPlayerId,
      loadout: payload.loadout,
      progression,
    };
  }

  return { load };
}
