export const SOUND_ASSETS = Object.freeze({
  'arrow-airborne': './sounds/arrow-airborne.wav',
  'arrow-hit': './sounds/arrow-hit.wav',
  'attack-hit': './sounds/attack-hit.wav',
  battle: './sounds/battle.mp3',
  'button-click': './sounds/button-click.wav',
  'critical-hit': './sounds/critical-hit.wav',
  'defended-hit': './sounds/defended-hit.wav',
});

const EFFECT_VOLUMES = Object.freeze({
  'arrow-airborne': 0.3,
  'arrow-hit': 0.38,
  'attack-hit': 0.34,
  'button-click': 0.32,
  'critical-hit': 0.42,
  'defended-hit': 0.34,
});

const EFFECT_COOLDOWNS_MS = Object.freeze({
  'arrow-airborne': 55,
  'arrow-hit': 45,
  'attack-hit': 75,
  'button-click': 40,
  'critical-hit': 100,
  'defended-hit': 100,
});

export class AudioManager {
  constructor({ AudioConstructor = globalThis.Audio, now = () => performance.now() } = {}) {
    this.AudioConstructor = AudioConstructor;
    this.now = now;
    this.lastPlayedAt = new Map();
    this.music = null;
    this.musicActive = false;
  }

  play(soundId) {
    const source = SOUND_ASSETS[soundId];
    if (!source || soundId === 'battle' || !this.AudioConstructor) return false;

    const playedAt = this.lastPlayedAt.get(soundId) ?? -Infinity;
    const cooldown = EFFECT_COOLDOWNS_MS[soundId] ?? 0;
    if (this.now() - playedAt < cooldown) return false;

    const effect = new this.AudioConstructor(source);
    effect.volume = EFFECT_VOLUMES[soundId] ?? 0.35;
    this.lastPlayedAt.set(soundId, this.now());
    this.start(effect);
    return true;
  }

  startBattleMusic() {
    if (!this.AudioConstructor) return false;
    this.musicActive = true;
    if (!this.music) {
      this.music = new this.AudioConstructor(SOUND_ASSETS.battle);
      this.music.loop = true;
      this.music.volume = 0.2;
    }
    this.start(this.music);
    return true;
  }

  pauseMusic() {
    this.music?.pause();
  }

  resumeMusic() {
    if (!this.musicActive || !this.music) return false;
    this.start(this.music);
    return true;
  }

  stopMusic() {
    this.musicActive = false;
    if (!this.music) return;
    this.music.pause();
    this.music.currentTime = 0;
  }

  start(audio) {
    const result = audio.play();
    if (result?.catch) result.catch(() => {});
  }
}
