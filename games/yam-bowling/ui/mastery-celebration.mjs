// Compatibility exports for older cabinet imports. New composition should use
// the progression-named module because this dialog now serves both tracks.
import {
  createProgressionCelebrationPresenter,
  progressionCelebrationMarkup,
} from "./progression-celebration.mjs";

export const masteryCelebrationMarkup = progressionCelebrationMarkup;

export function createMasteryCelebrationPresenter({ queue, ...options } = {}) {
  return createProgressionCelebrationPresenter({ ...options, masteryQueue: queue });
}
