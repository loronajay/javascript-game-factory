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
// public presentation document with public progression and rating documents.
// Presentation and progression are required to draw the room; rating is an
// optional public enhancement and stays explicitly unavailable if its read fails.
export function createPublicProfileClient({
  platformApi,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  async function load(playerId) {
    const normalizedPlayerId = cleanPlayerId(playerId);
    if (!normalizedPlayerId || typeof fetchImpl !== "function") return null;

    const encoded = encodeURIComponent(normalizedPlayerId);
    const [loadoutResponse, progression, rating] = await Promise.all([
      fetchImpl(`${platformApi?.baseUrl || ""}/games/${GAME_SLUG}/loadout/${encoded}`, {
        method: "GET",
        credentials: "include",
      }).catch(() => null),
      platformApi?.getGameProgression?.(GAME_SLUG, normalizedPlayerId)?.catch?.(() => null) ?? null,
      platformApi?.getGameRating?.(GAME_SLUG, normalizedPlayerId)?.catch?.(() => null) ?? null,
    ]);
    if (!loadoutResponse?.ok || !progression) return null;
    const payload = await readJson(loadoutResponse);
    if (!payload?.loadout) return null;
    return {
      playerId: normalizedPlayerId,
      loadout: payload.loadout,
      progression,
      rating,
    };
  }

  return { load };
}
