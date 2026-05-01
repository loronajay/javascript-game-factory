export const LAUNCH_SOUND_ID = 'launch';

export const AUDIO_ASSET_PATHS = Object.freeze({
  launch: 'sounds/launch.wav',
  hit: 'sounds/hit.wav',
  miss: 'sounds/miss.wav',
});

export const BG_MUSIC_PATHS = Object.freeze({
  menu:             'sounds/bg-music/menu.mp3',
  matchmaking:      'sounds/bg-music/menu.mp3',
  'room-create':    'sounds/bg-music/menu.mp3',
  'room-join':      'sounds/bg-music/menu.mp3',
  placement:        'sounds/bg-music/preparation.mp3',
  waiting:          'sounds/bg-music/preparation.mp3',
  battle: Object.freeze([
    'sounds/bg-music/battle-1.mp3',
    'sounds/bg-music/battle-2.mp3',
    'sounds/bg-music/battle-3.mp3',
  ]),
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
  let currentSrc = null;
  let pickedBattleSrc = null;

  function getAudio(src) {
    if (!src || typeof AudioCtor !== 'function') return null;
    if (!cache.has(src)) {
      const audio = new AudioCtor(src);
      audio.preload = 'auto';
      audio.loop = true;
      cache.set(src, audio);
    }
    return cache.get(src);
  }

  function _pauseCurrent() {
    if (!currentSrc) return;
    const audio = cache.get(currentSrc);
    if (audio) { audio.pause(); audio.currentTime = 0; }
    currentSrc = null;
  }

  function stop() {
    _pauseCurrent();
    pickedBattleSrc = null;
  }

  function transition(screenId) {
    const entry = BG_MUSIC_PATHS[screenId] ?? null;
    let newSrc;
    if (Array.isArray(entry)) {
      if (!pickedBattleSrc) {
        pickedBattleSrc = entry[Math.floor(Math.random() * entry.length)];
      }
      newSrc = pickedBattleSrc;
    } else {
      newSrc = entry;
    }
    if (newSrc === currentSrc) return;
    _pauseCurrent();
    if (!newSrc) return;
    const audio = getAudio(newSrc);
    if (!audio) return;
    currentSrc = newSrc;
    const playPromise = audio.play?.();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  return { transition, stop };
}
