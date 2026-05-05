export const GAME_ID = 'echo-duel';

export const INPUTS = Object.freeze(['W', 'A', 'S', 'D']);

export const INPUT_META = Object.freeze({
  W: { key: 'W', label: 'W', toneHz: 659.25, cssClass: 'key-w', colorName: 'Blue' },
  A: { key: 'A', label: 'A', toneHz: 392.00, cssClass: 'key-a', colorName: 'Yellow' },
  S: { key: 'S', label: 'S', toneHz: 261.63, cssClass: 'key-s', colorName: 'Red' },
  D: { key: 'D', label: 'D', toneHz: 523.25, cssClass: 'key-d', colorName: 'Green' },
});

export const DEFAULT_SETTINGS = Object.freeze({
  minPlayers: 2,
  maxPlayers: 6,
  playerCount: 4,
  penaltyWord: 'STATIC',
  startingPatternLength: 4,
  maxPatternLength: 10,
  timerSecondsPerInput: 1.25,
  minTimerSeconds: 6,
  maxTimerSeconds: 13,
});

export const PHASES = Object.freeze({
  MENU: 'menu',
  LOBBY: 'lobby',
  OWNER_CREATE_INITIAL: 'owner_create_initial',
  OWNER_REPLAY: 'owner_replay',
  OWNER_APPEND: 'owner_append',
  CHALLENGER_COPY: 'challenger_copy',
  RESULT_REVEAL: 'result_reveal',
  MATCH_OVER: 'match_over',
});

export function timerSecondsForLength(length, settings = DEFAULT_SETTINGS) {
  const raw = length * settings.timerSecondsPerInput;
  return Math.max(settings.minTimerSeconds, Math.min(settings.maxTimerSeconds, raw));
}
