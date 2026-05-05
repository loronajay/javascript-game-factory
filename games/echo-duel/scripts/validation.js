export function sanitizePenaltyWord(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 10);
}

export function validatePenaltyWord(value) {
  const word = sanitizePenaltyWord(value);
  if (word.length < 4) return { ok: false, word, error: 'Penalty word must be 4–10 letters.' };
  if (word.length > 10) return { ok: false, word, error: 'Penalty word must be 4–10 letters.' };
  return { ok: true, word, error: '' };
}

export function clampPlayerCount(value, min = 2, max = 6) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
