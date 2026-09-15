import { getCurrentRoles } from './session.js';
import { normalizeCharacterId } from './character-roster.js';
export { CHARACTERS, CHARACTER_ART, characterById, normalizeCharacterId } from './character-roster.js';
export { CHARACTER_COLOR_OPTIONS, DEFAULT_CHARACTER_COSMETICS, normalizeCharacterCosmetic, normalizeCharacterCosmetics } from './character-cosmetics.js';
import { normalizeCharacterCosmetics } from './character-cosmetics.js';

const STORAGE_KEY = 'build-buddy.characters.v1';
export function loadCharacters(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    return [normalizeCharacterId(saved?.[0]?.characterId ?? saved?.[0]), normalizeCharacterId(saved?.[1]?.characterId ?? saved?.[1] ?? 'rabbit')];
  } catch { return ['fox', 'rabbit']; }
}
export function loadCharacterCosmetics(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    return [normalizeCharacterCosmetics(saved?.[0]?.cosmetics), normalizeCharacterCosmetics(saved?.[1]?.cosmetics)];
  } catch { return [normalizeCharacterCosmetics(), normalizeCharacterCosmetics()]; }
}
export function saveCharacters(storage, players) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(players.map(p => ({
    characterId: normalizeCharacterId(p.characterId),
    cosmetics: normalizeCharacterCosmetics(p.cosmetics),
  })))); }
  catch { /* Browser storage is optional; the current session still keeps the choice. */ }
}

// Network ids own role assignment; Factory account ids still own player identity.
export function runnerCharacterId(state) {
  return runnerAppearance(state).characterId;
}

export function runnerAppearance(state) {
  const session = state.session ?? state.onlineGameplay?.session;
  const runnerId = state.online?.serverMatchState?.stage?.roles?.runnerPlayerId
    ?? (session ? getCurrentRoles(session).runnerPlayerId : state.players?.[0]?.id);
  const profiles = state.online?.profiles ?? {};
  const profile = profiles[runnerId] ?? Object.values(profiles).find(p => p.playerId === runnerId);
  const player = session?.players?.find(p => p.id === runnerId);
  const fallback = state.players?.[0];
  return {
    characterId: normalizeCharacterId(profile?.characterId ?? player?.characterId ?? fallback?.characterId),
    cosmetics: normalizeCharacterCosmetics(profile?.cosmetics ?? player?.cosmetics ?? fallback?.cosmetics),
  };
}

