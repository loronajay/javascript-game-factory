import {
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from '../../../js/platform/storage/storage.mjs';

const PB_KEYS = {
  boy:  getPlatformStorageKey('loversLostPbBoy'),
  girl: getPlatformStorageKey('loversLostPbGirl'),
};

function _load(storage, side) {
  const raw = readStorageText(storage, PB_KEYS[side]);
  if (!raw) return { highScore: null, bestTime: null };
  try {
    const p = JSON.parse(raw);
    return {
      highScore: typeof p.highScore === 'number' ? p.highScore : null,
      bestTime:  typeof p.bestTime  === 'number' ? p.bestTime  : null,
    };
  } catch {
    return { highScore: null, bestTime: null };
  }
}

function _save(storage, side, pb) {
  writeStorageText(storage, PB_KEYS[side], JSON.stringify(pb));
}

// runSummary: { boyScore, girlScore, boyFinished, girlFinished, elapsedFrames }
// Returns { isNewHighScore, isNewBestTime, pb, prevPb }
function updatePersonalBest(storage, side, runSummary) {
  const prevPb   = _load(storage, side);
  const pb       = { ...prevPb };
  const score    = side === 'boy' ? runSummary.boyScore    : runSummary.girlScore;
  const finished = side === 'boy' ? runSummary.boyFinished : runSummary.girlFinished;

  let isNewHighScore = false;
  let isNewBestTime  = false;

  if (pb.highScore === null || score > pb.highScore) {
    pb.highScore   = score;
    isNewHighScore = true;
  }

  if (finished && (pb.bestTime === null || runSummary.elapsedFrames < pb.bestTime)) {
    pb.bestTime   = runSummary.elapsedFrames;
    isNewBestTime = true;
  }

  _save(storage, side, pb);
  return { isNewHighScore, isNewBestTime, pb, prevPb };
}

function loadPersonalBest(storage, side) {
  return _load(storage, side);
}

export { loadPersonalBest, updatePersonalBest };
