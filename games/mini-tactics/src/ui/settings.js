// Settings store — the one place that knows the on-disk shape of the player's
// presentation preferences, their defaults, and how to apply them to the live
// app. Pure data + side-effect application; the modal (settingsModal.js) owns the
// UI and calls in here.
//
// Scope is deliberately PRESENTATION ONLY (audio levels, animation speed, motion,
// colorblind palette, theme). Nothing here touches match rules, RNG, or anything
// an online peer must agree on, so every value is safe to differ per client.
//
// Persistence is a single game-local localStorage key holding one JSON object.
// Defaults reproduce today's out-of-the-box experience exactly.

import { setSpeedScale } from "../render/timing.js";

const STORAGE_KEY = "mini-tactics.settings";

// Animation-speed presets → the timing multiplier (lower = faster). "instant"
// collapses every scripted animation/beat to zero duration.
export const ANIMATION_SPEEDS = Object.freeze({
  slow: 1.6,
  normal: 1,
  fast: 0.5,
  instant: 0,
});

export const DEFAULT_SETTINGS = Object.freeze({
  master: 1, // master volume 0..1
  sfx: 0.8, //   sfx bus 0..1   (AudioManager default)
  music: 0.35, // music bus 0..1 (AudioManager default)
  animSpeed: "normal", // key of ANIMATION_SPEEDS
  reduceMotion: false,
  colorblind: false,
  theme: "dark", // "dark" (current war-table default) | "light"
});

// Read + normalize from storage. Any missing/corrupt field falls back to its
// default, so an old or partial payload can never break boot.
export function loadSettings() {
  let stored = null;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  return normalizeSettings(stored);
}

export function saveSettings(settings) {
  const clean = normalizeSettings(settings);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Best-effort — private mode / quota failures must never break the game.
  }
  return clean;
}

export function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    master: clamp01(source.master, DEFAULT_SETTINGS.master),
    sfx: clamp01(source.sfx, DEFAULT_SETTINGS.sfx),
    music: clamp01(source.music, DEFAULT_SETTINGS.music),
    animSpeed: source.animSpeed in ANIMATION_SPEEDS
      ? source.animSpeed
      : DEFAULT_SETTINGS.animSpeed,
    reduceMotion: Boolean(source.reduceMotion),
    colorblind: Boolean(source.colorblind),
    theme: source.theme === "light" ? "light" : "dark",
  };
}

// Push settings into the live app: audio buses, the animation-speed lever, and
// the three root data-attributes the CSS keys off (theme / reduced-motion /
// colorblind). Safe to call repeatedly — it's how every live change applies.
export function applySettings(settings, { audio, documentRef = document } = {}) {
  const clean = normalizeSettings(settings);

  if (audio) {
    audio.setMasterVolume(clean.master);
    audio.setVolume(clean.sfx);
    audio.setMusicVolume(clean.music);
  }

  setSpeedScale(ANIMATION_SPEEDS[clean.animSpeed] ?? 1);

  const root = documentRef?.documentElement;
  if (root) {
    root.setAttribute("data-theme", clean.theme);
    root.setAttribute("data-reduce-motion", clean.reduceMotion ? "on" : "off");
    root.setAttribute("data-colorblind", clean.colorblind ? "on" : "off");
  }

  return clean;
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, n));
}
