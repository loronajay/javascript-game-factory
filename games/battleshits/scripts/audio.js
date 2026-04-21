export const LAUNCH_SOUND_ID = 'launch';

export const AUDIO_ASSET_PATHS = Object.freeze({
  launch: 'sounds/launch.wav',
  hit: 'sounds/hit.wav',
  miss: 'sounds/miss.wav',
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
