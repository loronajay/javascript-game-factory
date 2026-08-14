(function exposeAudioCore(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamAudio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAudioCore(root) {
  "use strict";

  const STORAGE_KEY = "yam-bowling-audio";
  const MUSIC_VOLUME = 0.16;
  const DUCKED_MUSIC_VOLUME = 0.055;
  const SFX_MASTER_VOLUME = 0.86;
  const MUSIC_TRACKS = Object.freeze([
    "sounds/theme-1.mp3",
    "sounds/theme-2.mp3",
    "sounds/theme-3.mp3",
  ]);

  const EFFECTS = Object.freeze({
    click: {
      cooldown: 0.025,
      tones: [[240, 0.055, 0.055, "square", 0.82], [520, 0.045, 0.035, "triangle", 1.08, 0.012]],
      noise: [0.045, 1800, 0.035, 3],
    },
    select: {
      cooldown: 0.045,
      tones: [[390, 0.065, 0.05, "triangle", 1.25], [620, 0.09, 0.044, "triangle", 1.12, 0.045]],
      noise: [0.04, 2100, 0.025, 3.2],
    },
    popup: { cooldown: 0.12, tones: [[420, 0.08, 0.04, "triangle", 1.2], [620, 0.11, 0.038, "triangle", 1.15, 0.065]] },
    announce: {
      cooldown: 0.18,
      tones: [[520, 0.1, 0.052, "triangle", 1.08, 0.06], [780, 0.16, 0.058, "triangle", 1.12, 0.14]],
      noise: [0.06, 1500, 0.028, 3],
    },
    charge: { cooldown: 0.12, tones: [[105, 0.18, 0.035, "sawtooth", 2.1]] },
    throw: { cooldown: 0.18, tones: [[135, 0.2, 0.04, "triangle", 0.55]], noise: [0.22, 720, 0.055] },
    pin: {
      cooldown: 0.048,
      tones: [
        [150, 0.11, 0.07, "sine", 1],
        [240, 0.08, 0.05, "sine", 1],
        [760, 0.075, 0.035, "triangle", 0.48],
        [1120, 0.04, 0.022, "square", 0.72, 0.012],
      ],
      noises: [
        [0.17, 1100, 0.14, 2.5],
        [0.1, 1350, 0.09, 2.2],
      ],
    },
    strike: { cooldown: 0.4, tones: [[330, 0.16, 0.04, "triangle", 1.05], [440, 0.2, 0.038, "triangle", 1.08, 0.055], [660, 0.34, 0.042, "triangle", 1.18, 0.11]], noise: [0.18, 1200, 0.08] },
    spare: { cooldown: 0.35, tones: [[370, 0.14, 0.034, "triangle", 1.05], [555, 0.24, 0.04, "triangle", 1.14, 0.08]] },
    gutter: { cooldown: 0.35, tones: [[180, 0.2, 0.035, "sawtooth", 0.48], [105, 0.26, 0.03, "triangle", 0.5, 0.12]] },
    win: { cooldown: 0.8, tones: [[294, 0.14, 0.035, "triangle", 1.04], [392, 0.18, 0.038, "triangle", 1.04, 0.11], [494, 0.2, 0.038, "triangle", 1.04, 0.22], [659, 0.42, 0.045, "triangle", 1.12, 0.34]] },
  });

  function getOutcomeCue(knocked, startedStanding, firstRoll) {
    if (knocked === startedStanding && startedStanding === 10 && firstRoll) return "strike";
    if (knocked === startedStanding && startedStanding < 10) return "spare";
    if (knocked === 0) return "gutter";
    return "popup";
  }

  function safeStorageRead(storage) {
    try { return storage?.getItem(STORAGE_KEY); } catch (_error) { return null; }
  }

  function safeStorageWrite(storage, value) {
    try { storage?.setItem(STORAGE_KEY, value); } catch (_error) { /* Audio still works without persistence. */ }
  }

  function defaultContextFactory() {
    const Context = root.AudioContext || root.webkitAudioContext;
    return Context ? new Context() : null;
  }

  function defaultAudioFactory(src) {
    return new root.Audio(src);
  }

  class AudioDirector {
    constructor({
      audioFactory = defaultAudioFactory,
      contextFactory = defaultContextFactory,
      storage = root.localStorage,
      random = Math.random,
      schedule = (callback, delay) => root.setTimeout(callback, delay),
      cancelSchedule = (handle) => root.clearTimeout(handle),
    } = {}) {
      this.audioFactory = audioFactory;
      this.contextFactory = contextFactory;
      this.storage = storage;
      this.random = random;
      this.schedule = schedule;
      this.cancelSchedule = cancelSchedule;
      this.enabled = safeStorageRead(storage) !== "off";
      this.unlocked = false;
      this.context = null;
      this.master = null;
      this.music = null;
      this.musicIndex = Math.floor(Math.max(0, Math.min(0.999999, random())) * MUSIC_TRACKS.length);
      this.lastPlayed = {};
      this.duckTimer = null;
    }

    ensureContext() {
      if (!this.context) {
        this.context = this.contextFactory?.() || null;
        if (this.context) {
          this.master = this.context.createGain();
          this.master.gain.value = SFX_MASTER_VOLUME;
          this.master.connect(this.context.destination);
        }
      }
      if (this.context?.state === "suspended") this.context.resume().catch?.(() => {});
      return this.context;
    }

    async unlock() {
      if (!this.enabled) return false;
      this.unlocked = true;
      this.ensureContext();
      await this.resumeMusic();
      return true;
    }

    async resumeMusic() {
      if (!this.enabled || !this.unlocked) return false;
      if (!this.music) this.loadTrack(this.musicIndex);
      try {
        await this.music.play();
        return true;
      } catch (_error) {
        return false;
      }
    }

    pauseMusic() {
      this.music?.pause();
    }

    loadTrack(index) {
      this.musicIndex = (index + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
      const music = this.audioFactory(MUSIC_TRACKS[this.musicIndex]);
      music.volume = MUSIC_VOLUME;
      music.preload = "auto";
      music.addEventListener("ended", () => {
        if (!this.enabled || music !== this.music) return;
        this.loadTrack(this.musicIndex + 1);
        this.resumeMusic();
      });
      this.music = music;
      return music;
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      safeStorageWrite(this.storage, this.enabled ? "on" : "off");
      if (this.enabled) this.unlock();
      else this.pauseMusic();
      return this.enabled;
    }

    toggle() {
      return this.setEnabled(!this.enabled);
    }

    duckMusic(duration = 300) {
      const music = this.music;
      if (!music || music.paused) return;
      music.volume = DUCKED_MUSIC_VOLUME;
      if (this.duckTimer !== null) this.cancelSchedule(this.duckTimer);
      this.duckTimer = this.schedule(() => {
        if (this.music === music) music.volume = MUSIC_VOLUME;
        this.duckTimer = null;
      }, duration);
    }

    play(name, { intensity = 1 } = {}) {
      const effect = EFFECTS[name];
      if (!this.enabled || !effect) return false;
      this.unlocked = true;
      const context = this.ensureContext();
      if (!context || !this.master) return false;
      const now = context.currentTime;
      if (now - (this.lastPlayed[name] ?? -Infinity) < effect.cooldown) return false;
      this.lastPlayed[name] = now;
      this.duckMusic(name === "win" ? 650 : name === "pin" ? 220 : 300);
      const strength = Math.max(0.2, Math.min(1.4, intensity));
      for (const tone of effect.tones || []) this.playTone(tone, strength);
      const noiseLayers = effect.noises || (effect.noise ? [effect.noise] : []);
      for (const noise of noiseLayers) this.playNoise(noise, strength);
      return true;
    }

    playTone([frequency, duration, volume, type, slide = 1, delay = 0], intensity) {
      const context = this.context;
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * (0.97 + this.random() * 0.06), start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(32, frequency * slide), start + duration);
      gain.gain.setValueAtTime(volume * intensity, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    }

    playNoise([duration, frequency, volume, decay = 2.2], intensity) {
      const context = this.context;
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (this.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = 0.75;
      gain.gain.value = volume * intensity;
      source.buffer = buffer;
      source.connect(filter).connect(gain).connect(this.master);
      source.start();
    }
  }

  function createAudioDirector(options) {
    return new AudioDirector(options);
  }

  return {
    STORAGE_KEY,
    MUSIC_TRACKS,
    MUSIC_VOLUME,
    DUCKED_MUSIC_VOLUME,
    SFX_MASTER_VOLUME,
    EFFECTS,
    getOutcomeCue,
    AudioDirector,
    createAudioDirector,
  };
});
