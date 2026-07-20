export { TUTORIAL_PROGRESS_KEY, TUTORIAL_REWARD_SKIN_CHOICES };
// Tutorial progress persistence: completion writes (unit/valor/skin-choice
// grants) and the read side that powers the tutorial-select screen.

import {
  TUTORIAL_JUGGERNAUT_REWARD_UNIT,
  TUTORIAL_PROGRESS_KEY,
  TUTORIAL_REWARD_SKIN_CHOICES,
  TUTORIAL_VALOR_REWARD,
  normalizeUnlockProgress,
  readUnlockProgress,
  writeUnlockProgress
} from "../progression/unlocks.js";
import { enqueueDraftBattleUnlockAnnouncement, enqueueUnitUnlockAnnouncements, enqueueValorGainAnnouncement } from "../progression/announcements.js";
import {
  buildTutorialCompleteClaim,
  buildTutorialUnitRewardClaim,
  buildTutorialValorClaim,
  enqueueGameProgressClaim,
} from "../platform/gameProgressClient.js";

import { TUTORIAL_CATALOG, TUTORIAL_IDS } from "./tutorialContent.js";

export function completeTutorial(storage, tutorialId) {
  const current = readProgress(storage);
  const previouslyComplete = current.allTutorialsComplete;
  const completed = new Set(current.completedTutorials);
  const shouldClaimTutorialComplete = TUTORIAL_IDS.includes(tutorialId) && !completed.has(tutorialId);
  if (TUTORIAL_IDS.includes(tutorialId)) completed.add(tutorialId);

  const completedTutorials = TUTORIAL_IDS.filter((id) => completed.has(id));
  const allTutorialsComplete = TUTORIAL_IDS.every((id) => completed.has(id));
  const shouldGrantTutorialValor = allTutorialsComplete && !current.tutorialValorGranted;
  const next = writeUnlockProgress(storage, {
    ...current,
    completedTutorials,
    allTutorialsComplete,
    valorBalance: current.valorBalance + (shouldGrantTutorialValor ? TUTORIAL_VALOR_REWARD : 0),
    tutorialValorGranted: current.tutorialValorGranted || shouldGrantTutorialValor,
  });
  if (shouldClaimTutorialComplete) {
    enqueueGameProgressClaim(storage, buildTutorialCompleteClaim({ tutorialId }));
  }
  if (!previouslyComplete && next.allTutorialsComplete) {
    enqueueUnitUnlockAnnouncements(storage, [TUTORIAL_JUGGERNAUT_REWARD_UNIT], { ignoreSeen: true });
    enqueueDraftBattleUnlockAnnouncement(storage);
  }
  if (shouldGrantTutorialValor) {
    enqueueGameProgressClaim(storage, buildTutorialValorClaim({
      amount: TUTORIAL_VALOR_REWARD,
      completedTutorials,
    }));
    enqueueGameProgressClaim(storage, buildTutorialUnitRewardClaim({
      type: TUTORIAL_JUGGERNAUT_REWARD_UNIT,
    }));
    enqueueValorGainAnnouncement(storage, {
      id: "tutorials-complete",
      amount: TUTORIAL_VALOR_REWARD,
      title: "Tutorial Valor Earned",
      body: `Completing every tutorial awarded ${TUTORIAL_VALOR_REWARD.toLocaleString("en-US")} Valor.`,
    }, { ignoreSeen: true });
  }
  return next;
}

export function readProgress(storage = globalThis.localStorage) {
  const progress = readUnlockProgress(storage);
  const completedTutorials = progress.completedTutorials.filter((id) => TUTORIAL_IDS.includes(id));
  return normalizeUnlockProgress({
    ...progress,
    completedTutorials,
    allTutorialsComplete: TUTORIAL_IDS.every((id) => completedTutorials.includes(id)),
  });
}

export function getTutorialList(storage = globalThis.localStorage) {
  const progress = readProgress(storage);
  const completed = new Set(progress.completedTutorials);
  let nextUnlocked = true;

  return TUTORIAL_CATALOG.map((tutorial) => {
    const isCompleted = completed.has(tutorial.id);
    const unlocked = isCompleted || nextUnlocked;
    const status = isCompleted ? "completed" : unlocked ? "unlocked" : "locked";
    if (!isCompleted && unlocked) nextUnlocked = false;
    return {
      ...tutorial,
      completed: isCompleted,
      locked: !unlocked,
      status,
    };
  });
}

export function getNextTutorialId(storage = globalThis.localStorage, afterTutorialId = null) {
  const tutorials = getTutorialList(storage);
  const startIndex = Math.max(0, tutorials.findIndex((tutorial) => tutorial.id === afterTutorialId) + 1);
  const next = tutorials
    .slice(startIndex)
    .find((tutorial) => tutorial.available && !tutorial.locked && !tutorial.completed);
  return next?.id ?? null;
}

