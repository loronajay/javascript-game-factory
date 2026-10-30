// Supplied music/effects; generated countdown and finish cues fill the remaining events.
const asset = path => new URL(path, import.meta.url).href;
export const PET_GAME_AUDIO = Object.freeze({
  menu: asset('../../../farm/assets/sounds/menus/pet-minigame-menu.mp3'),
  'barnyard-dash': Object.freeze({
    music: asset('../../barnyard-dash/assets/audio/barnyard-dash.mp3'),
    effects: Object.freeze({ jump: asset('../../barnyard-dash/assets/audio/jump.mp3') }),
  }),
  'pondside-push': Object.freeze({
    music: asset('../../pondside-push/assets/audio/pondside-push.mp3'),
    effects: Object.freeze({ bump: asset('../../pondside-push/assets/audio/bump.mp3'), impact: asset('../../pondside-push/assets/audio/push.mp3'), splash: asset('../../pondside-push/assets/audio/splash.mp3') }),
  }),
});

/** Held actions produce one cue at the transition, rather than once per frame. */
export function petGameSoundCues(previous, next) {
  const cues = [];
  if (next.countdown > 0 && next.countdown !== previous.countdown) cues.push('countdown');
  if (previous.countdown > 0 && next.countdown === 0) cues.push('go');
  if (next.jumping && !previous.jumping) cues.push('jump');
  if (next.bumping && !previous.bumping) cues.push('bump');
  if (next.impact > .5 && !(previous.impact > .5)) cues.push('impact');
  if (next.out > (previous.out ?? 0)) cues.push('splash');
  return cues;
}

export function createPetGameAudio({ game = '' } = {}) {
  let context = null, muted = false, unlocked = false, destroyed = false;
  let previous = {};
  let menuActive = true;
  const config = PET_GAME_AUDIO[game];
  const makeAudio = (src, loop, volume) => {
    const audio = new Audio(src);
    audio.loop = loop;
    audio.volume = volume;
    audio.preload = 'none';
    return audio;
  };
  const menuMusic = makeAudio(PET_GAME_AUDIO.menu, true, .2);
  const gameMusic = config ? makeAudio(config.music, true, .2) : null;
  const effects = new Map(Object.entries(config?.effects ?? {}).map(([kind, src]) => [kind, makeAudio(src, false, .55)]));
  const allAudio = [menuMusic, ...(gameMusic ? [gameMusic] : []), ...effects.values()];
  try { muted = localStorage.getItem('jgf.pet-games.muted') === 'true'; } catch {}
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  const paint = () => {
    button.textContent = muted ? 'Sound: off' : 'Sound: on';
    button.setAttribute('aria-pressed', String(!muted));
    button.setAttribute('aria-label', muted ? 'Turn game sounds on' : 'Mute game sounds');
  };
  paint();
  const toolbar = document.querySelector('.topbar');
  if (toolbar) toolbar.append(button);
  else {
    Object.assign(button.style, { position: 'absolute', top: '16px', right: '16px', zIndex: '10' });
    document.querySelector('.world-menu')?.append(button);
  }
  function syncMusic() {
    const selected = menuActive ? menuMusic : gameMusic;
    for (const audio of [menuMusic, gameMusic]) if (audio && (audio !== selected || muted || document.hidden || destroyed)) audio.pause();
    if (unlocked && !muted && !document.hidden && !destroyed && selected) void selected.play().catch(() => {});
  }
  function unlock() {
    if (muted || destroyed) return;
    unlocked = true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      context ??= new AudioContext();
      void context.resume().catch(() => {});
    }
    syncMusic();
  }
  button.addEventListener('click', () => {
    muted = !muted;
    paint();
    try { localStorage.setItem('jgf.pet-games.muted', String(muted)); } catch {}
    if (!muted) unlock();
    else { for (const audio of allAudio) audio.pause(); syncMusic(); }
  });
  const visibility = () => {
    if (document.hidden) for (const audio of effects.values()) audio.pause();
    syncMusic();
  };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  const cues = { countdown: [440,440,.08], go: [660,990,.18], jump: [350,750,.12], bump: [240,90,.1], impact: [160,65,.12], splash: [420,55,.28], finish: [520,1040,.35] };
  function play(kind) {
    if (muted || !unlocked || destroyed || document.hidden) return;
    const file = effects.get(kind);
    if (file) {
      file.currentTime = 0;
      void file.play().catch(() => {});
      return;
    }
    if (!context || context.state !== 'running' || !cues[kind]) return;
    const [from,to,duration] = cues[kind];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = context.currentTime;
    oscillator.type = kind === 'impact' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(.1, at + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  const destroy = () => {
    destroyed = true;
    for (const audio of allAudio) audio.pause();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    document.removeEventListener('visibilitychange', visibility);
    void context?.close().catch(() => {});
  };
  window.addEventListener('pagehide', event => {
    if (event.persisted) { for (const audio of allAudio) audio.pause(); }
    else destroy();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) syncMusic(); });
  return {
    play,
    setMenuActive(active) {
      if (menuActive && !active && gameMusic) gameMusic.currentTime = 0;
      menuActive = active;
      syncMusic();
    },
    reset() { previous = {}; },
    observe(next) {
      for (const cue of petGameSoundCues(previous, next)) play(cue);
      previous = { ...next };
    },
  };
}
