export const BIRD_DUTY_PERSONAL_BEST_KEY = "bird-duty.personal-best";

function getStorage(root = globalThis) {
  try {
    return root?.localStorage || null;
  } catch {
    return null;
  }
}

export function getPersonalBest(root = globalThis) {
  const storage = getStorage(root);
  if (!storage) return 0;

  const value = Number(storage.getItem(BIRD_DUTY_PERSONAL_BEST_KEY));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function updatePersonalBest(score, root = globalThis) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const previous = getPersonalBest(root);
  const value = Math.max(previous, safeScore);
  const storage = getStorage(root);

  if (storage && value > previous) {
    storage.setItem(BIRD_DUTY_PERSONAL_BEST_KEY, String(value));
  }

  return {
    previous,
    value,
    isNewBest: value > previous,
  };
}

export function clearPersonalBest(root = globalThis) {
  const storage = getStorage(root);
  if (!storage) return false;
  storage.removeItem(BIRD_DUTY_PERSONAL_BEST_KEY);
  return true;
}
