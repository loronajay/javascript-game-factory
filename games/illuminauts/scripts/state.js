import { HEARTS_MAX, STAMINA_MAX } from './config.js';
import { createAudioState } from './audio.js';
import { createWorldMap } from './map.js';
import { MAPS } from './maps.js';

// role: 'A' spawns at the S tile, 'B' spawns at the T tile.
// mapEntry overrides MAPS lookup when provided (used by playtest mode).
export function createGameState(mapIndex = 0, role = 'A', mapEntry = null) {
  const mapDef = mapEntry ?? MAPS[mapIndex % MAPS.length];
  const map = createWorldMap(mapDef.raw);
  const hazards = JSON.parse(JSON.stringify(mapDef.hazards));
  // Turrets don't move — precompute beam tiles once so getTurretBeamTiles() never allocates.
  for (const t of hazards.turrets) {
    t.beamTiles = [];
    for (let i = 1; i <= t.range; i++) t.beamTiles.push({ x: t.x + t.dx * i, y: t.y + t.dy * i });
  }

  const localStart  = role === 'B' ? map.start2 : map.start;
  const remoteStart = role === 'B' ? map.start  : map.start2;
  const remoteRole = role === 'B' ? 'A' : 'B';

  return {
    map,
    mapIndex: mapIndex % MAPS.length,
    mapId: mapDef.id,
    gameStartAt: 0, // set to performance.now() when the match begins

    player: {
      role,
      palette: role === 'B' ? 'beta' : 'alpha',
      tx: localStart.x,
      ty: localStart.y,
      prevTx: localStart.x,
      prevTy: localStart.y,
      px: localStart.x + 0.5,
      py: localStart.y + 0.5,
      spawnTx: localStart.x,
      spawnTy: localStart.y,
      moveStartAt: 0,
      stepMs: 0,
      isSprinting: false,
      dir: 'down',
      hearts: HEARTS_MAX,
      chips: 0,
      stamina: STAMINA_MAX,
      invulnerableUntil: 0,
      powerUntil: 0,
      won: false,
    },

    // Remote player — position relayed via room_message.
    remote: {
      role: remoteRole,
      palette: remoteRole === 'B' ? 'beta' : 'alpha',
      tx: remoteStart.x,
      ty: remoteStart.y,
      px: remoteStart.x + 0.5,
      py: remoteStart.y + 0.5,
      dir: 'down',
      displayName: '',
      playerId: '',
      invulnerableUntil: 0, // kept for drawPlayer compat; not updated
      isRemote: true,       // flag so drawPlayer can use a distinct color
      active: false,        // false until first position message received
    },

    // Online state — enabled when a multiplayer match is live.
    online: {
      enabled: false,
      outbox: [],       // game events queued for sending (flushed each tick)
      localPlayerId: '',
    },

    hazards,
    audio: createAudioState(),
    // input is replaced with the stable DOM-bound object by game.js
    input: { held: new Set(), justPressed: new Set() },
    message: 'Find an Access Chip, then reach the Beacon Core.',
    lastTime: 0,
  };
}

export function selectRandomMapIndex(random = Math.random, mapCount = MAPS.length) {
  if (mapCount <= 0) return 0;
  return Math.min(mapCount - 1, Math.floor(random() * mapCount));
}

export function selectMatchMapIndex(matchSeed, mapCount = MAPS.length) {
  if (mapCount <= 0) return 0;
  const seed = Number.isFinite(matchSeed) ? Math.trunc(matchSeed) : Date.now();
  return Math.abs(seed) % mapCount;
}
