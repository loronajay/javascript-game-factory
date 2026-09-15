const SOUND_ROOT = 'assets/sounds';

export const GAMEPLAY_MUSIC = Object.freeze([
  `${SOUND_ROOT}/soundtrack/open-skies.mp3`,
  `${SOUND_ROOT}/soundtrack/my-buddy.mp3`,
  `${SOUND_ROOT}/soundtrack/hurry-and-build.mp3`,
  `${SOUND_ROOT}/soundtrack/between-the-scaffolding.mp3`,
]);

const SFX = Object.freeze({
  button: `${SOUND_ROOT}/sfx/button-click.wav`,
  jump: `${SOUND_ROOT}/sfx/jump.wav`,
  spring: `${SOUND_ROOT}/sfx/spring-bounce.wav`,
  goal: `${SOUND_ROOT}/sfx/goal.wav`,
  error: `${SOUND_ROOT}/sfx/error.wav`,
  toolAction: `${SOUND_ROOT}/sfx/place-tool.mp3`,
});

export function shuffledPlaylist(tracks, random = Math.random) {
  const result = [...tracks];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function springPlaybackRate(bounceVy) {
  const strength = Math.abs(Number(bounceVy) || 1130);
  return Math.max(.78, Math.min(1.3, Number((strength / 1130).toFixed(3))));
}

function safePlay(audio) {
  const promise = audio?.play?.();
  promise?.catch?.(() => {});
}

const RUN_MUSIC_SCREENS = new Set(['gameplay', 'stage_result', 'run_result']);
const MENU_MUSIC_SCREENS = new Set([
  'main_menu',
  'mode_select',
  'local_setup',
  'online_menu',
  'online_lobby',
  'practice_select',
]);

export class AudioDirector {
  constructor({ AudioCtor = globalThis.Audio, random = Math.random } = {}) {
    this.AudioCtor = AudioCtor;
    this.unlocked = false;
    this.screen = '';
    this.playlist = shuffledPlaylist(GAMEPLAY_MUSIC, random);
    this.musicIndex = 0;
    this.menuTrack = this.makeAudio(`${SOUND_ROOT}/soundtrack/menu.mp3`);
    this.menuTrack.loop = true;
    this.menuTrack.volume = .42;
    this.musicTrack = this.makeAudio(this.playlist[0]);
    this.musicTrack.volume = .38;
    this.musicTrack.addEventListener?.('ended', () => this.advanceMusic());
    this.climbingTrack = this.makeAudio(`${SOUND_ROOT}/sfx/climbing.wav`);
    this.climbingTrack.loop = true;
    this.climbingTrack.volume = .48;
    this.sfx = Object.fromEntries(Object.entries(SFX).map(([key, src]) => [key, this.makeAudio(src)]));
  }

  makeAudio(src) {
    return typeof this.AudioCtor === 'function' ? new this.AudioCtor(src) : {
      src, paused: true, currentTime: 0, playbackRate: 1,
      play() {}, pause() {}, cloneNode() { return this; }, addEventListener() {},
    };
  }

  unlock() {
    this.unlocked = true;
    this.applyMusicState();
  }

  setScreen(screen) {
    this.screen = screen;
    this.applyMusicState();
    if (screen !== 'gameplay') this.syncGameplay({ climbing: false });
  }

  applyMusicState() {
    if (!this.unlocked) return;
    if (RUN_MUSIC_SCREENS.has(this.screen)) {
      this.menuTrack.pause?.();
      safePlay(this.musicTrack);
    } else if (MENU_MUSIC_SCREENS.has(this.screen)) {
      this.musicTrack.pause?.();
      safePlay(this.menuTrack);
    } else {
      this.menuTrack.pause?.();
      this.musicTrack.pause?.();
    }
  }

  advanceMusic() {
    this.musicIndex = (this.musicIndex + 1) % this.playlist.length;
    this.musicTrack.src = this.playlist[this.musicIndex];
    this.musicTrack.currentTime = 0;
    if (this.unlocked && RUN_MUSIC_SCREENS.has(this.screen)) safePlay(this.musicTrack);
  }

  playSfx(name, { rate = 1, volume = .72 } = {}) {
    if (!this.unlocked || !this.sfx[name]) return;
    const sound = this.sfx[name].cloneNode?.() ?? this.makeAudio(this.sfx[name].src);
    sound.playbackRate = rate;
    sound.volume = volume;
    safePlay(sound);
  }

  handleGameEvents(events = []) {
    for (const event of events) {
      if (event.type === 'spring') this.playSfx('spring', { rate: springPlaybackRate(event.bounceVy), volume: .82 });
      else if (SFX[event.type]) this.playSfx(event.type);
    }
  }

  syncGameplay({ climbing = false, climbVelocity = 0 } = {}) {
    const movingOnWall = climbing && Math.abs(Number(climbVelocity) || 0) > 1;
    if (movingOnWall && this.unlocked && this.screen === 'gameplay') {
      if (this.climbingTrack.paused !== false) safePlay(this.climbingTrack);
    } else {
      this.climbingTrack.pause?.();
      this.climbingTrack.currentTime = 0;
    }
  }
}
