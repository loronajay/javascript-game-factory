const PUZZLE_PROGRESS_VERSION = 1;

function stageKey(packId, stageId) {
  return `${packId}/${stageId}`;
}

function normalizePuzzleProgress(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = null; }
  }
  const completed = {};
  if (source?.completed && typeof source.completed === 'object') {
    for (const [key, entry] of Object.entries(source.completed)) {
      const bestFrames = Math.max(1, Math.floor(Number(entry?.bestFrames) || 0));
      const clears = Math.max(1, Math.floor(Number(entry?.clears) || 0));
      if (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(key) && bestFrames > 0) completed[key] = { bestFrames, clears };
    }
  }
  return { version: PUZZLE_PROGRESS_VERSION, completed };
}

function completePuzzleStage(progress, stage, elapsedFrames) {
  const normalized = normalizePuzzleProgress(progress);
  const key = stageKey(stage.packId, stage.id);
  const frames = Math.max(1, Math.floor(Number(elapsedFrames) || 1));
  const existing = normalized.completed[key];
  return {
    version: PUZZLE_PROGRESS_VERSION,
    completed: {
      ...normalized.completed,
      [key]: {
        bestFrames: existing ? Math.min(existing.bestFrames, frames) : frames,
        clears: (existing?.clears || 0) + 1,
      },
    },
  };
}

function isPuzzleStageUnlocked(pack, stageIndex, progress) {
  if (!pack || stageIndex <= 0) return stageIndex === 0;
  const previous = pack.stages[stageIndex - 1];
  return !!normalizePuzzleProgress(progress).completed[stageKey(pack.id, previous.id)];
}

export {
  PUZZLE_PROGRESS_VERSION,
  stageKey,
  normalizePuzzleProgress,
  completePuzzleStage,
  isPuzzleStageUnlocked,
};
