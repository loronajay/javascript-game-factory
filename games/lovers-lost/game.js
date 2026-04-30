// Barrel re-exports — all public symbols stay importable from game.js for test compatibility.
export * from './scripts/game-constants.js';
export * from './scripts/debug-flags.js';
export * from './scripts/online-identity.js';
export * from './scripts/lane-snapshot.js';
export * from './scripts/lobby-ui.js';
export * from './scripts/collision.js';
export * from './scripts/game-tick.js';
export { initGame } from './scripts/init-game.js';
