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

  // Volume is a setting, not a constant. The two numbers below were hard-coded per-track defaults,
  // which meant the only volume control in the game was the operating system's. They are still the
  // defaults; they are now also the starting point for a slider.
  const DEFAULT_SETTINGS = Object.freeze({ music: 0.42, effects: 0.72, muted: false });
  const STORAGE_KEY = 'hotel:audio-settings';

  function normalizeVolume(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.round(Math.max(0, Math.min(1, parsed)) * 100) / 100;
  }

  function normalizeAudioSettings(settings = {}, defaults = DEFAULT_SETTINGS) {
    return {
      music: normalizeVolume(settings.music, defaults.music),
      effects: normalizeVolume(settings.effects, defaults.effects),
      muted: !!settings.muted,
    };
  }

  // Storage is optional and is allowed to throw: a browser with site data blocked must still be able
  // to turn the music down for this session, it simply will not remember next time.
  function readAudioSettings(storage, defaults = DEFAULT_SETTINGS) {
    try {
      const raw = storage && storage.getItem(STORAGE_KEY);
      return normalizeAudioSettings(raw ? JSON.parse(raw) : {}, defaults);
    } catch (error) {
      return normalizeAudioSettings({}, defaults);
    }
  }

  function writeAudioSettings(storage, settings) {
    const normalized = normalizeAudioSettings(settings);
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch (error) { /* session-only */ }
    return normalized;
  }

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

    let level = normalizeVolume(volume, DEFAULT_SETTINGS.music);

    for (const track of Object.values(tracks)) {
      track.loop = true;
      track.preload = 'auto';
      track.volume = level;
    }

    function setVolume(next) {
      level = normalizeVolume(next, level);
      for (const track of Object.values(tracks)) track.volume = level;
      return level;
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

    return { start, stop, setMonsterState, setVolume, getVolume: () => level, getActiveTrack: () => activeName };
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

    let level = normalizeVolume(volume, DEFAULT_SETTINGS.effects);

    for (const effect of Object.values(effects)) {
      effect.loop = false;
      effect.preload = 'auto';
      effect.volume = level;
      effect.currentTime = 0;
    }
    effects.elevatorRide.loop = true;

    function setVolume(next) {
      level = normalizeVolume(next, level);
      for (const effect of Object.values(effects)) effect.volume = level;
      return level;
    }

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

    return { stop: stopElevatorMovement, setVolume, getVolume: () => level };
  }

  // The one place that owns "how loud is the game". It is handed the two mixers rather than reaching
  // for them, so the whole thing runs in node against fakes; the DOM half is two range inputs and a
  // checkbox and is skipped entirely when they are not on the page (the inspection views).
  function createAudioSettings({
    soundtrack = null,
    effects = null,
    document: doc = root && root.document,
    storage = (() => { try { return root && root.localStorage; } catch (error) { return null; } })(),
    onChange = null,
  } = {}) {
    let settings = readAudioSettings(storage);
    const musicInput = doc && doc.getElementById('musicVolume');
    const effectsInput = doc && doc.getElementById('effectsVolume');
    const muteInput = doc && doc.getElementById('audioMuted');
    const musicReadout = doc && doc.getElementById('musicVolumeReadout');
    const effectsReadout = doc && doc.getElementById('effectsVolumeReadout');

    function percent(value) { return `${Math.round(value * 100)}%`; }

    function apply() {
      // Mute is a separate switch rather than "both sliders to zero", so unmuting restores the mix
      // the player had set instead of silence.
      soundtrack?.setVolume(settings.muted ? 0 : settings.music);
      effects?.setVolume(settings.muted ? 0 : settings.effects);
      if (musicInput) musicInput.value = String(Math.round(settings.music * 100));
      if (effectsInput) effectsInput.value = String(Math.round(settings.effects * 100));
      if (muteInput) muteInput.checked = settings.muted;
      if (musicReadout) musicReadout.textContent = settings.muted ? 'MUTED' : percent(settings.music);
      if (effectsReadout) effectsReadout.textContent = settings.muted ? 'MUTED' : percent(settings.effects);
      onChange?.(settings);
      return settings;
    }

    function update(patch, { persist = true } = {}) {
      settings = normalizeAudioSettings({ ...settings, ...patch });
      if (persist) writeAudioSettings(storage, settings);
      return apply();
    }

    musicInput?.addEventListener('input', () => update({ music: Number(musicInput.value) / 100 }));
    effectsInput?.addEventListener('input', () => update({ effects: Number(effectsInput.value) / 100 }));
    muteInput?.addEventListener('change', () => update({ muted: !!muteInput.checked }));

    apply();
    return { update, get: () => ({ ...settings }), setMusic: (value) => update({ music: value }), setEffects: (value) => update({ effects: value }), setMuted: (value) => update({ muted: value }) };
  }

  return { DEFAULT_SETTINGS, createAudioSettings, createSoundEffects, createSoundtrack, normalizeAudioSettings, normalizeVolume, readAudioSettings, writeAudioSettings };
});
