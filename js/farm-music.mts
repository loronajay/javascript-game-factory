// The farm owns this soundtrack. It starts only after the Enter gesture, streams
// through one audio element, and keeps one shuffled order for the whole visit.

export interface FarmMusicTrack {
  readonly id: string;
  readonly title: string;
  readonly file: string;
  readonly src: string;
}

export const FARM_MUSIC_TRACKS: readonly FarmMusicTrack[] = Object.freeze([
  Object.freeze({
    id: "farm-life",
    title: "Farm Life",
    file: "farm/assets/sounds/soundtrack/farm-life.mp3",
    src: "./assets/sounds/soundtrack/farm-life.mp3",
  }),
  Object.freeze({
    id: "blue-skies",
    title: "Blue Skies",
    file: "farm/assets/sounds/soundtrack/blue-skies.mp3",
    src: "./assets/sounds/soundtrack/blue-skies.mp3",
  }),
]);

const FARM_MUSIC_VOLUME = 0.24;

interface AudioLike {
  src: string;
  error: unknown;
  volume: number;
  preload: string;
  play(): Promise<unknown> | unknown;
  pause(): void;
  addEventListener(name: "ended" | "error", listener: () => void): void;
}

export interface FarmMusic {
  start(): void;
  setMuted(next: boolean): boolean;
  isMuted(): boolean;
  currentTrack(): FarmMusicTrack | null;
  destroy(): void;
}

export interface FarmMusicOptions {
  tracks?: readonly FarmMusicTrack[];
  random?: () => number;
  createAudio?: () => AudioLike | null;
  muted?: boolean;
  volume?: number;
}

function shuffled<T>(rows: readonly T[], random: () => number): T[] {
  const result = [...rows];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function createFarmMusic(options: FarmMusicOptions = {}): FarmMusic {
  const tracks = shuffled(options.tracks ?? FARM_MUSIC_TRACKS, options.random ?? Math.random);
  const createAudio = options.createAudio ?? (() => typeof globalThis.Audio === "function" ? new globalThis.Audio() : null);
  const volume = options.volume ?? FARM_MUSIC_VOLUME;
  let audio: AudioLike | null = null;
  let trackIndex = 0;
  let started = false;
  let muted = Boolean(options.muted);
  let destroyed = false;

  function ignorePlayRejection(result: unknown): void {
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => undefined);
    }
  }

  function currentTrack(): FarmMusicTrack | null {
    return audio && tracks.length ? tracks[trackIndex] ?? null : null;
  }

  function playCurrent(): void {
    if (!audio || muted || destroyed || tracks.length === 0) return;
    audio.src = tracks[trackIndex].src;
    ignorePlayRejection(audio.play());
  }

  function advance(): void {
    if (tracks.length === 0) return;
    trackIndex = (trackIndex + 1) % tracks.length;
    playCurrent();
  }

  function ensureAudio(): AudioLike | null {
    if (audio || destroyed) return audio;
    audio = createAudio();
    if (!audio) return null;
    audio.volume = volume;
    audio.preload = "metadata";
    audio.addEventListener("ended", advance);
    audio.addEventListener("error", () => {
      // Changing a source can dispatch an empty error; only skip a file the
      // browser actually identified as failed.
      if (audio?.error) advance();
    });
    return audio;
  }

  return Object.freeze({
    start(): void {
      if (destroyed) return;
      started = true;
      if (muted || !ensureAudio()) return;
      // A later gesture is a useful retry when the browser declined an earlier play.
      if (audio && !audio.src) playCurrent();
      else ignorePlayRejection(audio?.play());
    },
    setMuted(next: boolean): boolean {
      muted = Boolean(next);
      if (muted) audio?.pause();
      else if (started && ensureAudio()) {
        if (!audio?.src) playCurrent();
        else ignorePlayRejection(audio.play());
      }
      return muted;
    },
    isMuted: () => muted,
    currentTrack,
    destroy(): void {
      destroyed = true;
      audio?.pause();
      audio = null;
    },
  });
}
