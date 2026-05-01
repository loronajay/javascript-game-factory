export const LAUNCH_SOUND_ID = 'launch';

export const AUDIO_ASSET_PATHS = Object.freeze({
  launch: 'sounds/launch.wav',
  hit: 'sounds/hit.wav',
  miss: 'sounds/miss.wav',
});

export const BG_MUSIC_PATHS = Object.freeze({
  menu: 'sounds/bg-music/menu.mp3',
});

export function getResolutionSoundId(hit) {
  return hit ? 'hit' : 'miss';
}

export function createAudioController(AudioCtor = globalThis.Audio) {
  const cache = new Map();

  function getAudio(soundId) {
    const src = AUDIO_ASSET_PATHS[soundId];
    if (!src || typeof AudioCtor !== 'function') return null;
    if (!cache.has(soundId)) {
      const audio = new AudioCtor(src);
      audio.preload = 'auto';
      cache.set(soundId, audio);
    }
    return cache.get(soundId);
  }

  function play(soundId) {
    const audio = getAudio(soundId);
    if (!audio) return;
    audio.currentTime = 0;
    const playPromise = audio.play?.();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  return { play };
}

export function createBgMusicController(AudioCtor = globalThis.Audio) {
  const cache = new Map();
  let currentTrackId = null;

  function getAudio(trackId) {
    const src = BG_MUSIC_PATHS[trackId];
    if (!src || typeof AudioCtor !== 'function') return null;
    if (!cache.has(trackId)) {
      const audio = new AudioCtor(src);
      audio.preload = 'auto';
      audio.loop = true;
      cache.set(trackId, audio);
    }
    return cache.get(trackId);
  }

  function stop() {
    if (!currentTrackId) return;
    const audio = cache.get(currentTrackId);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    currentTrackId = null;
  }

  function transition(screenId) {
    const trackId = BG_MUSIC_PATHS[screenId] ? screenId : null;
    if (trackId === currentTrackId) return;
    stop();
    if (!trackId) return;
    const audio = getAudio(trackId);
    if (!audio) return;
    currentTrackId = trackId;
    const playPromise = audio.play?.();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  return { transition, stop };
}
