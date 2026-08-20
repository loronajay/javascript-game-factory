import { buildPublicProfileModel } from "./public-profile-model.mjs";

function cleanPlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function createPublicProfileRepository({ client, animation, roomCore }) {
  const entries = new Map();

  async function load(playerId, profileName = "") {
    const normalizedPlayerId = cleanPlayerId(playerId);
    if (!normalizedPlayerId) return null;
    if (entries.has(normalizedPlayerId)) return entries.get(normalizedPlayerId);

    const pending = Promise.resolve(client?.load?.(normalizedPlayerId))
      .then((documents) => documents ? buildPublicProfileModel({
        playerId: normalizedPlayerId,
        profileName,
        loadout: documents.loadout,
        progression: documents.progression,
        rating: documents.rating,
        animation,
        roomCore,
      }) : null)
      .catch(() => null);
    entries.set(normalizedPlayerId, pending);
    const model = await pending;
    entries.set(normalizedPlayerId, model);
    return model;
  }

  function peek(playerId) {
    const entry = entries.get(cleanPlayerId(playerId));
    return entry && typeof entry.then !== "function" ? entry : null;
  }

  return {
    has: (playerId) => entries.has(cleanPlayerId(playerId)),
    load,
    peek,
  };
}
