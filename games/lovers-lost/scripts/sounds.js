
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

function createSounds() {
  if (typeof Audio === 'undefined') {
    return { play() {}, stop() {}, stopAll() {} };
  }

  const buffers = {};
  const active = {};

  for (const name of SOUND_FILES) {
    const audio = new Audio(`sounds/${name}.wav`);
    audio.preload = 'auto';
    buffers[name] = audio;
    active[name] = new Set();
  }

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
  }

  return { play, stop, stopAll };
}

export { createSounds };
