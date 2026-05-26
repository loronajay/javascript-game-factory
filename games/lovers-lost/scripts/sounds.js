// Sound system. Audio elements are created on first use so mobile startup does
// not eagerly touch every audio asset.

const SOUND_FILES = [
  'jump',
  'crouch',
  'sword',
  'sword-success',
  'shield',
  'shield-success',
  'bird',
  'goblin-death',
  'run-success',
  'run-failed',
  'player-hit',
];

const MUSIC_FILES = ['bg-music-menu', 'bg-music-game'];
const DEFAULT_SFX_POOL_SIZE = 4;

function createSounds(options = {}) {
  if (typeof Audio === 'undefined') {
    return { play() {}, stop() {}, stopAll() {}, playMusic() {}, stopMusic() {}, retryPendingMusic() {} };
  }

  const buffers = {};
  const pools = {};
  const poolCursor = {};
  const active = {};
  const musicTracks = {};
  const sfxPoolSize = Math.max(1, Math.floor(options.sfxPoolSize || DEFAULT_SFX_POOL_SIZE));
  let currentMusicName = null;
  let pendingMusicName = null;

  function createSourceAudio(name) {
    const audio = new Audio(`sounds/${name}.mp3`);
    audio.preload = 'auto';
    return audio;
  }

  function getSourceAudio(name) {
    if (!SOUND_FILES.includes(name)) return null;
    if (!buffers[name]) {
      buffers[name] = createSourceAudio(name);
      pools[name] = [];
      poolCursor[name] = 0;
      active[name] = new Set();
    }
    return buffers[name];
  }

  function getMusicTrack(name) {
    if (!MUSIC_FILES.includes(name)) return null;
    if (musicTracks[name]) return musicTracks[name];
    const audio = new Audio(`sounds/${name}.mp3`);
    audio.preload = 'auto';
    audio.loop = true;
    musicTracks[name] = audio;
    return audio;
  }

  function playMusic(name) {
    if (currentMusicName === name) return;
    stopMusic();
    currentMusicName = name;
    pendingMusicName = null;
    const track = getMusicTrack(name);
    if (!track) return;
    track.play().catch(() => { pendingMusicName = name; });
  }

  function stopMusic() {
    if (!currentMusicName) return;
    const track = musicTracks[currentMusicName];
    if (track) {
      track.pause();
      track.currentTime = 0;
    }
    currentMusicName = null;
    pendingMusicName = null;
  }

  // Call this inside a user-interaction handler to unblock audio that was
  // silently rejected by the browser's autoplay policy.
  function retryPendingMusic() {
    if (!pendingMusicName || currentMusicName !== pendingMusicName) return;
    const name = pendingMusicName;
    pendingMusicName = null;
    const track = getMusicTrack(name);
    if (track) track.play().catch(() => { pendingMusicName = name; });
  }

  function forget(name, entry) {
    entry.active = false;
    active[name] && active[name].delete(entry);
  }

  function createPoolEntry(name, source) {
    const audio = source.cloneNode();
    const entry = { audio, active: false, used: false };
    if (typeof audio.addEventListener === 'function') {
      audio.addEventListener('ended', () => forget(name, entry));
    } else if ('onended' in audio) {
      audio.onended = () => forget(name, entry);
    }
    return entry;
  }

  function getPoolEntry(name, source) {
    const pool = pools[name];
    const inactive = pool.find(entry => !entry.active);
    if (inactive) return inactive;

    if (pool.length < sfxPoolSize) {
      const entry = createPoolEntry(name, source);
      pool.push(entry);
      return entry;
    }

    const index = poolCursor[name] % pool.length;
    poolCursor[name] = (index + 1) % pool.length;
    const entry = pool[index];
    if (typeof entry.audio.pause === 'function') entry.audio.pause();
    if ('currentTime' in entry.audio) entry.audio.currentTime = 0;
    return entry;
  }

  function stop(name) {
    const playing = active[name];
    if (!playing) return;

    for (const entry of playing) {
      entry.active = false;
      if (typeof entry.audio.pause === 'function') {
        entry.audio.pause();
      }
      if ('currentTime' in entry.audio) {
        entry.audio.currentTime = 0;
      }
    }

    playing.clear();
  }

  function play(name) {
    const src = getSourceAudio(name);
    if (!src) return;
    const entry = getPoolEntry(name, src);
    if (entry.used && 'currentTime' in entry.audio) entry.audio.currentTime = 0;
    entry.used = true;
    entry.active = true;
    active[name].add(entry);
    entry.audio.play().catch(() => { forget(name, entry); });
  }

  function stopAll() {
    for (const name of SOUND_FILES) stop(name);
    stopMusic();
  }

  return { play, stop, stopAll, playMusic, stopMusic, retryPendingMusic };
}

export { createSounds };
