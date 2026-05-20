export const SOUND_PATHS = Object.freeze({
  buttonClick: "assets/scratch/sounds/button-click.wav",
  gameMusic: "assets/scratch/sounds/game-music.mp3",
  poopRelease: "assets/scratch/sounds/poop-release.mp3",
  splat: "assets/scratch/sounds/splat.mp3",
  alan: "assets/scratch/sounds/alan.mp3",
  anna: "assets/scratch/sounds/anna.mp3",
  bryan: "assets/scratch/sounds/bryan.mp3",
  john: "assets/scratch/sounds/john.mp3",
  sanjeet: "assets/scratch/sounds/sanjeet.mp3",
  sanjeetFast: "assets/scratch/sounds/sanjeet-fast.wav",
});

export function createSoundController(root = globalThis, paths = SOUND_PATHS) {
  const AudioCtor = root.Audio;
  const sounds = {};

  if (typeof AudioCtor === "function") {
    for (const [name, src] of Object.entries(paths)) {
      const audio = new AudioCtor(src);
      audio.preload = "auto";
      sounds[name] = audio;
    }
  }

  function play(name) {
    const sound = sounds[name];
    if (!sound) return false;

    const instance = typeof sound.cloneNode === "function" ? sound.cloneNode() : sound;
    instance.currentTime = 0;
    const result = instance.play?.();
    if (result?.catch) result.catch(() => {});
    return true;
  }

  function startLoop(name) {
    const sound = sounds[name];
    if (!sound) return false;

    sound.loop = true;
    const result = sound.play?.();
    if (result?.catch) result.catch(() => {});
    return true;
  }

  function stop(name) {
    const sound = sounds[name];
    if (!sound) return false;

    sound.pause?.();
    sound.currentTime = 0;
    return true;
  }

  return {
    play,
    startLoop,
    stop,
    playButtonClick() {
      return play("buttonClick");
    },
    playPoopRelease() {
      return play("poopRelease");
    },
    playSplat() {
      return play("splat");
    },
    playNpcHit(type) {
      return play(type);
    },
    startGameMusic() {
      return startLoop("gameMusic");
    },
    stopGameMusic() {
      return stop("gameMusic");
    },
  };
}
