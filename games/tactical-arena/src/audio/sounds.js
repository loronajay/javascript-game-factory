// AudioManager — wraps HybridAudioEngine for SFX and keeps HTMLAudioElement for
// the looping music tracks. Public API is identical to the old version so
// nothing else needs to change: play(key), startMusic(key), stopMusic(),
// setEnabled(), setMasterVolume(), setVolume(), setMusicVolume().

import { HybridAudioEngine } from "./hybridAudioEngine.js";
import { SOUND_CATALOG, SAMPLE_SOURCES } from "./soundCatalog.js";
import { FINAL_BATTLE_MISSION_ID, HASBEEN_HEROES_MISSION_ID, NOT_MY_KING_MISSION_ID, VOID_CASTLE_MISSION_ID } from "../campaign/campaign.js";

export const MUSIC_FILES = Object.freeze({
  menu: "menu.mp3",
  missionBattle: "mission-battle.mp3",
  vsBattle: "vs-battle.mp3",
  fattyBattle: "fatty-battle.mp3",
  kingBattle: "king-battle.mp3",
  summonerBattle: "summoner-battle.mp3",
  finalBattle: "final-battle.mp3",
});
const MUSIC_BASE = new URL("../../sounds/", import.meta.url);

const CAMPAIGN_MUSIC_BY_MISSION = Object.freeze({
  [NOT_MY_KING_MISSION_ID]: "kingBattle",
  [HASBEEN_HEROES_MISSION_ID]: "fattyBattle",
  [VOID_CASTLE_MISSION_ID]: "summonerBattle",
  [FINAL_BATTLE_MISSION_ID]: "finalBattle",
});

export function musicKeyForMatchMode(mode, campaignMissionId = null) {
  if (mode !== "campaign") return "vsBattle";
  return CAMPAIGN_MUSIC_BY_MISSION[campaignMissionId] ?? "missionBattle";
}

export class AudioManager {
  constructor({ enabled = true, masterVolume = 1, volume = 0.8, musicVolume = 0.35 } = {}) {
    this.enabled = enabled;
    this.masterVolume = masterVolume;
    this.volume = volume;
    this.musicVolume = musicVolume;

    this._engine = new HybridAudioEngine({ sampleSources: { ...SAMPLE_SOURCES } });
    this._engine.setMasterVolume(masterVolume * volume);

    this._patches = new Map(SOUND_CATALOG.map(({ key, patch }) => [key, patch]));

    this._musicTracks = new Map();
    this._currentMusic = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.stopMusic();
  }

  setMasterVolume(value) {
    this.masterVolume = clamp01(value);
    this._engine.setMasterVolume(this.masterVolume * this.volume);
    this._applyMusicVolume();
  }

  setVolume(value) {
    this.volume = clamp01(value);
    this._engine.setMasterVolume(this.masterVolume * this.volume);
  }

  setMusicVolume(value) {
    this.musicVolume = clamp01(value);
    this._applyMusicVolume();
  }

  _applyMusicVolume() {
    if (this._currentMusic) {
      this._currentMusic.volume = this.masterVolume * this.musicVolume;
    }
  }

  // Fire-and-forget. Unknown keys and disabled audio are silent no-ops.
  play(key) {
    if (!this.enabled) return;
    const patch = this._patches.get(key);
    if (!patch) return;
    this._engine.play(patch, { variation: 0.06 }).catch(() => {});
  }

  startMusic(key) {
    if (!this.enabled) return;
    const file = MUSIC_FILES[key];
    if (!file) return;

    let track = this._musicTracks.get(key);
    if (!track) {
      track = new Audio(new URL(file, MUSIC_BASE).href);
      track.loop = true;
      track.preload = "metadata";
      this._musicTracks.set(key, track);
    }

    track.volume = this.masterVolume * this.musicVolume;
    if (this._currentMusic === track) {
      if (track.paused) {
        const resumed = track.play();
        if (resumed?.catch) resumed.catch(() => {});
      }
      return;
    }

    if (this._currentMusic) this.stopMusic();

    track.currentTime = 0;
    this._currentMusic = track;
    const played = track.play();
    if (played?.catch) played.catch(() => {});
  }

  stopMusic() {
    const track = this._currentMusic;
    this._currentMusic = null;
    if (!track) return;
    try { track.pause(); track.currentTime = 0; } catch {}
  }
}

function clamp01(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
