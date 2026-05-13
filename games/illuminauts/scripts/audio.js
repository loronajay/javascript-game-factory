import { BASE_LIGHT_RADIUS, POWER_LIGHT_RADIUS } from './config.js';
import { getLaserGatePhase, getTurretPhase } from './hazards.js';

const SOUND_BASE_PATH = './assets/sounds';

const MUSIC_TRACKS = {
  menu: `${SOUND_BASE_PATH}/menu.mp3`,
  game: `${SOUND_BASE_PATH}/game.mp3`
};

const SOUND_CUES = {
  collect: `${SOUND_BASE_PATH}/collect.wav`,
  'door-unlock': `${SOUND_BASE_PATH}/door-unlock.wav`,
  grunt: `${SOUND_BASE_PATH}/grunt.wav`,
  hit: `${SOUND_BASE_PATH}/hit.wav`,
  laser: `${SOUND_BASE_PATH}/laser.wav`,
  'power-up': `${SOUND_BASE_PATH}/power-up.wav`
};

const SOUND_VOLUMES = {
  menu: 0.45,
  game: 0.42,
  collect: 0.66,
  'door-unlock': 0.68,
  grunt: 0.72,
  hit: 0.62,
  laser: 0.54,
  'power-up': 0.72
};

export function createAudioState() {
  return {
    events: [],
    laserPhaseBySourceId: Object.create(null)
  };
}

function ensureAudioState(state) {
  if (!state.audio) state.audio = createAudioState();
  return state.audio;
}

export function enqueueSoundEvent(state, cue, detail = {}) {
  ensureAudioState(state).events.push({ cue, ...detail });
}

export function consumeSoundEvents(state) {
  const audio = ensureAudioState(state);
  const events = audio.events.slice();
  audio.events.length = 0;
  return events;
}

export function getMusicTrackForPhase(phase) {
  return phase === 'playing' ? 'game' : 'menu';
}

function getLightRadiusForPlayer(player, now) {
  return now < (player.powerUntil || 0) ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS;
}

function isSourceVisibleToPlayer(player, tiles, radius) {
  return tiles.some((tile) => (
    Math.hypot(tile.x + 0.5 - player.px, tile.y + 0.5 - player.py) <= radius
  ));
}

export function isTileVisibleToPlayer(state, x, y, now) {
  if (!state?.player) return false;
  const radius = getLightRadiusForPlayer(state.player, now);
  return isSourceVisibleToPlayer(state.player, [{ x, y }], radius);
}

// Laser SFX follow emitter visibility so unseen hazards do not all fire globally at once.
export function captureLaserShotEvents(state, now) {
  const audio = ensureAudioState(state);
  const elapsed = now - (state.gameStartAt || 0);
  const radius = getLightRadiusForPlayer(state.player, now);
  const nextPhaseBySourceId = Object.create(null);
  const events = [];

  for (const gate of state.hazards?.laserGates || []) {
    const sourceId = `gate:${gate.id}`;
    const phase = getLaserGatePhase(gate, elapsed);
    const previousPhase = audio.laserPhaseBySourceId[sourceId];
    nextPhaseBySourceId[sourceId] = phase;
    if (phase === 'active' && previousPhase !== 'active' && isSourceVisibleToPlayer(state.player, gate.tiles, radius)) {
      events.push({ cue: 'laser', sourceId });
    }
  }

  for (const turret of state.hazards?.turrets || []) {
    const sourceId = `turret:${turret.id}`;
    const phase = getTurretPhase(turret, elapsed);
    const previousPhase = audio.laserPhaseBySourceId[sourceId];
    nextPhaseBySourceId[sourceId] = phase;
    if (phase === 'active' && previousPhase !== 'active' && isSourceVisibleToPlayer(state.player, [{ x: turret.x, y: turret.y }], radius)) {
      events.push({ cue: 'laser', sourceId });
    }
  }

  audio.laserPhaseBySourceId = nextPhaseBySourceId;
  return events;
}

function safePlay(audio) {
  if (!audio?.play) return Promise.resolve();
  try {
    const result = audio.play();
    if (result?.catch) result.catch(() => {});
    return result ?? Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

function stopAudio(audio) {
  if (!audio) return;
  if (audio.pause) audio.pause();
  if ('currentTime' in audio) audio.currentTime = 0;
}

// AudioController owns browser Audio elements while the game rules only emit semantic cues.
export function createAudioController({ AudioCtor = globalThis.Audio } = {}) {
  const music = {
    menu: AudioCtor ? new AudioCtor(MUSIC_TRACKS.menu) : null,
    game: AudioCtor ? new AudioCtor(MUSIC_TRACKS.game) : null
  };
  let unlocked = false;
  let currentTrack = null;

  for (const [track, audio] of Object.entries(music)) {
    if (!audio) continue;
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = SOUND_VOLUMES[track];
  }

  function playCue(cue) {
    if (!AudioCtor || !SOUND_CUES[cue]) return;
    const audio = new AudioCtor(SOUND_CUES[cue]);
    audio.preload = 'auto';
    audio.volume = SOUND_VOLUMES[cue] ?? 1;
    void safePlay(audio);
  }

  async function applyMusicTrack(trackName) {
    if (currentTrack === trackName) return;

    if (currentTrack && music[currentTrack]) stopAudio(music[currentTrack]);
    currentTrack = trackName;

    if (!unlocked || !currentTrack || !music[currentTrack]) return;
    await safePlay(music[currentTrack]);
  }

  return {
    unlock() {
      unlocked = true;
      if (currentTrack && music[currentTrack]) void safePlay(music[currentTrack]);
    },

    async sync(state, phase, now) {
      await applyMusicTrack(getMusicTrackForPhase(phase));

      for (const event of consumeSoundEvents(state)) {
        playCue(event.cue);
      }

      if (phase !== 'playing') return;
      for (const event of captureLaserShotEvents(state, now)) {
        playCue(event.cue);
      }
    }
  };
}
