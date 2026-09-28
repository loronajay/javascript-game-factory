// Making 20 snapshots a second look like 60 frames. Pure: callers pass the time.
//
// OTHER pets are drawn a little in the past, between the two snapshots either
// side of that moment (`createSnapshotBuffer`): smooth, and never a guess.
// YOUR pet is drawn where prediction says it is now; when a snapshot corrects
// that prediction the jump is not shown — it becomes an offset that melts away
// over a few frames (`createErrorSmoother`), unless it is too big to hide.

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function lerpAngle(from, to, amount) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}

export function createSnapshotBuffer({ delayMs = 100, keep = 12 } = {}) {
  let entries = [];
  return {
    push(snapshot, receivedAt) {
      entries.push({ snapshot, at: receivedAt });
      if (entries.length > keep) entries = entries.slice(-keep);
    },
    /**
     * The pair of snapshots around `now - delayMs` and how far between them,
     * or the newest alone when the buffer has not caught up (or has run dry).
     */
    sample(now) {
      if (!entries.length) return null;
      const target = now - delayMs;
      for (let index = entries.length - 1; index > 0; index -= 1) {
        const later = entries[index];
        const earlier = entries[index - 1];
        if (earlier.at <= target && target <= later.at) {
          const span = later.at - earlier.at || 1;
          return { from: earlier.snapshot, to: later.snapshot, amount: (target - earlier.at) / span };
        }
      }
      const newest = entries[entries.length - 1];
      return { from: newest.snapshot, to: newest.snapshot, amount: 1 };
    },
    reset() { entries = []; },
    get size() { return entries.length; },
  };
}

/** Hides a prediction's correction: `correct(before, after)` then add `offset(now)` when drawing. */
export function createErrorSmoother({ halfLifeMs = 70, snapDistance = 60 } = {}) {
  let offset = { x: 0, y: 0 };
  let since = 0;
  return {
    correct(before, after, now) {
      const current = this.offset(now);
      const x = current.x + (before.x - after.x);
      const y = current.y + (before.y - after.y);
      offset = Math.hypot(x, y) > snapDistance ? { x: 0, y: 0 } : { x, y };
      since = now;
    },
    offset(now) {
      const decay = Math.pow(0.5, Math.max(0, now - since) / halfLifeMs);
      return { x: offset.x * decay, y: offset.y * decay };
    },
    reset() { offset = { x: 0, y: 0 }; },
  };
}
