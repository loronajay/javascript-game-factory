import { INPUT_META } from './config.js';

let ctx = null;
let menuMusic = null;
let menuMusicWanted = false;

const MENU_MUSIC_SRC = 'assets/sounds/menu.mp3';
const MENU_MUSIC_VOLUME = 0.34;

function getContext() {
  if (!ctx) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    ctx = new AudioContextCtor();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function ensureMenuMusic() {
  if (menuMusic) return menuMusic;
  menuMusic = new Audio(MENU_MUSIC_SRC);
  menuMusic.loop = true;
  menuMusic.preload = 'auto';
  menuMusic.volume = MENU_MUSIC_VOLUME;
  return menuMusic;
}

export async function unlockAudio() {
  const audio = getContext();
  if (audio && audio.state === 'suspended') {
    try { await audio.resume(); } catch { /* browser may still require a gesture */ }
  }
}

export async function startMenuMusic() {
  menuMusicWanted = true;
  const music = ensureMenuMusic();
  try {
    await unlockAudio();
    if (music.paused) await music.play();
  } catch {
    // Autoplay may be blocked until the next user gesture. Keep the desired state
    // so a later button click can start the loop without changing callers.
  }
}

export function stopMenuMusic() {
  menuMusicWanted = false;
  if (!menuMusic) return;
  menuMusic.pause();
  menuMusic.currentTime = 0;
}

export function pauseMenuMusic() {
  menuMusicWanted = false;
  if (!menuMusic) return;
  menuMusic.pause();
}

export function isMenuMusicWanted() {
  return menuMusicWanted;
}

export function playInputTone(input) {
  const meta = INPUT_META[input];
  const audio = getContext();
  if (!meta || !audio) return;

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(meta.toneHz, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

export function playFailureTone() {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.22);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.28);
}
