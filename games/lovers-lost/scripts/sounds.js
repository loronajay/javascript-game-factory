
// ─── Sound system ─────────────────────────────────────────────────────────────
// Loads all game sounds and exposes a play(name) method.
// Each call to play() clones the audio buffer so overlapping instances work.

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

function createSounds() {
  if (typeof Audio === 'undefined') {
    return { play() {}, stop() {}, stopAll() {}, playMusic() {}, stopMusic() {} };
  }

  const buffers = {};
  const active = {};

  for (const name of SOUND_FILES) {
    const audio = new Audio(`sounds/${name}.wav`);
    audio.preload = 'auto';
    buffers[name] = audio;
    active[name] = new Set();
  }

  // ── Looping music tracks ─────────────────────────────────────────────────────
  const musicTracks = {};
  let currentMusicName = null;

  for (const name of MUSIC_FILES) {
    const audio = new Audio(`sounds/${name}.wav`);
    audio.preload = 'auto';
    audio.loop = true;
    musicTracks[name] = audio;
  }

  let pendingMusicName = null;

  function playMusic(name) {
    if (currentMusicName === name) return;
    stopMusic();
    currentMusicName = name;
    pendingMusicName = null;
    const track = musicTracks[name];
    if (!track) return;
    track.play().catch(() => { pendingMusicName = name; });
  }

  function stopMusic() {
    if (!currentMusicName) return;
    const track = musicTracks[currentMusicName];
    if (track) { track.pause(); track.currentTime = 0; }
    currentMusicName = null;
    pendingMusicName = null;
  }

  // Call this inside a user-interaction handler to unblock audio that was
  // silently rejected by the browser's autoplay policy.
  function retryPendingMusic() {
    if (!pendingMusicName || currentMusicName !== pendingMusicName) return;
    const name = pendingMusicName;
    pendingMusicName = null;
    const track = musicTracks[name];
    if (track) track.play().catch(() => { pendingMusicName = name; });
  }

  // ── SFX ─────────────────────────────────────────────────────────────────────
  function forget(name, instance) {
    active[name] && active[name].delete(instance);
  }

  function stop(name) {
    const playing = active[name];
    if (!playing) return;

    for (const instance of playing) {
      if (typeof instance.pause === 'function') {
        instance.pause();
      }
      if ('currentTime' in instance) {
        instance.currentTime = 0;
      }
    }

    playing.clear();
  }

  function play(name) {
    const src = buffers[name];
    if (!src) return;
    // Clone so rapid/overlapping triggers don't cut each other off
    const instance = src.cloneNode();
    active[name].add(instance);
    if (typeof instance.addEventListener === 'function') {
      instance.addEventListener('ended', () => forget(name, instance), { once: true });
    } else if ('onended' in instance) {
      instance.onended = () => forget(name, instance);
    }
    instance.play().catch(() => {});
  }

  function stopAll() {
    for (const name of SOUND_FILES) stop(name);
    stopMusic();
  }

  return { play, stop, stopAll, playMusic, stopMusic, retryPendingMusic };
}

export { createSounds };
