(function attachHotelMusic(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelMusic = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelMusicApi(root) {
  'use strict';

  const DEFAULT_TRACKS = Object.freeze({
    menu: 'assets/sounds/bg-themes/menu.mp3',
    chill: 'assets/sounds/bg-themes/empty-halls.mp3',
    chase: 'assets/sounds/bg-themes/the-chase.mp3',
  });
  const DEFAULT_EFFECTS = Object.freeze({
    menuClick: 'assets/sounds/sfx/button-click.wav',
    menuCancel: 'assets/sounds/sfx/cancel.wav',
    caught: 'assets/sounds/sfx/caught.wav',
    caughtScream: 'assets/sounds/sfx/caught-scream.wav',
    elevatorRide: 'assets/sounds/sfx/elevator-ride.wav',
    elevatorArriving: 'assets/sounds/sfx/elevator-arriving.mp3',
    elevatorDing: 'assets/sounds/sfx/elevator-ding.wav',
  });

  function createSoundtrack({
    eventTarget = root,
    createAudio = (src) => new root.Audio(src),
    tracks: sources = DEFAULT_TRACKS,
    volume = 0.42,
  } = {}) {
    const tracks = {
      menu: createAudio(sources.menu),
      chill: createAudio(sources.chill),
      chase: createAudio(sources.chase),
    };
    let desiredName = 'menu';
    let gameplayName = 'chill';
    let inMenu = true;
    let activeName = null;
    let started = false;

    for (const track of Object.values(tracks)) {
      track.loop = true;
      track.preload = 'auto';
      track.volume = volume;
    }

    function reset(track) {
      track.pause();
      track.currentTime = 0;
    }

    function playDesired() {
      if (!started) return;
      const next = tracks[desiredName];
      if (activeName === desiredName && !next.paused) return;
      if (activeName && activeName !== desiredName) reset(tracks[activeName]);
      next.currentTime = 0;
      activeName = desiredName;
      const requestedName = desiredName;
      const attempt = next.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => {
          if (activeName === requestedName && next.paused) activeName = null;
        });
      }
    }

    function start() {
      started = true;
      playDesired();
    }

    function setMonsterState(state) {
      gameplayName = state === 'chase' ? 'chase' : 'chill';
      if (!inMenu) {
        desiredName = gameplayName;
        playDesired();
      }
    }

    function stop() {
      for (const track of Object.values(tracks)) reset(track);
      activeName = null;
      started = false;
    }

    eventTarget.addEventListener('hotel:monster-state', (event) => {
      const { state, localChase } = event.detail;
      setMonsterState(typeof localChase === 'boolean' ? (localChase ? 'chase' : 'roam') : state);
    });
    eventTarget.addEventListener('hotel:menu-screen', (event) => {
      inMenu = event.detail.screen !== 'playing';
      desiredName = inMenu ? 'menu' : gameplayName;
      playDesired();
    });
    eventTarget.addEventListener('pointerdown', start);
    eventTarget.addEventListener('keydown', start);

    return { start, stop, setMonsterState, getActiveTrack: () => activeName };
  }

  function createSoundEffects({
    eventTarget = root,
    createAudio = (src) => new root.Audio(src),
    effects: sources = DEFAULT_EFFECTS,
    volume = 0.72,
  } = {}) {
    const effects = Object.fromEntries(
      Object.entries(sources).map(([name, src]) => [name, createAudio(src)]),
    );

    for (const effect of Object.values(effects)) {
      effect.loop = false;
      effect.preload = 'auto';
      effect.volume = volume;
      effect.currentTime = 0;
    }
    effects.elevatorRide.loop = true;

    function play(effect) {
      effect.currentTime = 0;
      const attempt = effect.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    }

    function stop(effect) {
      if (effect.paused && effect.currentTime === 0) return;
      effect.pause();
      effect.currentTime = 0;
    }

    function stopElevatorMovement() {
      stop(effects.elevatorRide);
      stop(effects.elevatorArriving);
    }

    eventTarget.addEventListener('hotel:caught', () => {
      play(effects.caught);
      play(effects.caughtScream);
    });
    eventTarget.addEventListener('hotel:elevator-start', (event) => {
      stopElevatorMovement();
      play(event.detail.passenger ? effects.elevatorRide : effects.elevatorArriving);
    });
    eventTarget.addEventListener('hotel:elevator-arrive', () => {
      stopElevatorMovement();
      play(effects.elevatorDing);
    });
    eventTarget.addEventListener('hotel:menu-action', (event) => {
      play(['back', 'quit'].includes(event.detail.action) ? effects.menuCancel : effects.menuClick);
    });

    return { stop: stopElevatorMovement };
  }

  return { createSoundEffects, createSoundtrack };
});
