function createAudioController(getSound, options = {}) {
  let ambientAudio = null;
  let isMuted = options.isMuted ?? (() => false);

  function setMutedPredicate(predicate) {
    isMuted = predicate;
  }

  function playSound(name) {
    if (isMuted()) return;
    const audio = getSound(name);
    if (!audio) return;
    const clone = audio.cloneNode();
    clone.volume = 0.4;
    clone.play().catch(() => {});
  }

  function startAmbient() {
    if (ambientAudio) return;
    const audio = getSound('bg_music');
    if (!audio) return;
    audio.loop = true;
    audio.volume = 0.35;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    ambientAudio = audio;
  }

  function stopAmbient() {
    if (!ambientAudio) return;
    ambientAudio.pause();
    ambientAudio.currentTime = 0;
    ambientAudio = null;
  }

  return {
    playSound,
    setMutedPredicate,
    startAmbient,
    stopAmbient,
  };
}

export { createAudioController };
