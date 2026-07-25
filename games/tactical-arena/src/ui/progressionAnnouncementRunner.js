// The unlock/achievement popup scheduler, with all I/O injected so the ordering rules
// can be tested headlessly. `progressionAnnouncements.js` wires the real queue + modal.
//
// Rules this enforces, each one a bug we hit by not having a single owner:
//  - A request while a batch is on screen COALESCES into that batch instead of being
//    dropped (dropped requests were resurfacing a session later).
//  - A request made where a popup doesn't belong is HELD and flushed on the next
//    allowed screen — never dropped, never shown over the board.
//  - `run()` returns the in-flight run, so callers that need the queue empty before
//    opening their own modal can await it instead of racing it.
//  - The queue is drained one item at a time, so an interrupted batch keeps the rest.

export function createProgressionAnnouncementRunner({
  shift,
  present,
  setTimeout: schedule = globalThis.setTimeout.bind(globalThis),
  clearTimeout: unschedule = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  let activeRun = null;
  let allowed = true;
  let requested = false;
  // Tracked as a flag rather than "is timerId set", because a timer id may legitimately
  // be 0/falsy and a stale id would silently block every later request.
  let scheduled = false;
  let timerId = null;

  function setAllowed(value, { delay = 0 } = {}) {
    const next = Boolean(value);
    if (allowed === next) return;
    allowed = next;
    // Always sweep on the way back in, not just when a request was pending: a batch cut
    // short by leaving for a match has no outstanding request but does have leftovers.
    // A sweep with nothing queued is a no-op. The delay is the arriving screen's (the
    // results screen waits out its confetti).
    if (allowed) request({ delay });
  }

  function request({ delay = 0 } = {}) {
    requested = true;
    if (activeRun || !allowed || scheduled) return;
    scheduled = true;
    timerId = schedule(() => {
      scheduled = false;
      timerId = null;
      void run();
    }, delay);
  }

  function run() {
    if (activeRun) return activeRun;
    if (!allowed) return Promise.resolve([]);
    activeRun = drain();
    return activeRun;
  }

  async function drain() {
    const shown = [];
    requested = false;
    // Yield once so `activeRun` is assigned above before anything below can clear it —
    // otherwise an empty queue would return synchronously and wedge `activeRun` set.
    await Promise.resolve();
    try {
      for (;;) {
        // Re-checked every pass: leaving for a match mid-batch stops the run and leaves
        // the remainder queued for the next allowed screen.
        if (!allowed) break;
        const announcement = shift();
        if (!announcement) break;
        shown.push(announcement);
        await present(announcement);
      }
    } finally {
      // Cleared in the same synchronous step as the follow-up check below, so a request
      // that lands while the run is winding down can never fall between the two.
      activeRun = null;
    }
    if (requested && allowed) request();
    return shown;
  }

  function reset() {
    if (timerId !== null) unschedule(timerId);
    activeRun = null;
    allowed = true;
    requested = false;
    scheduled = false;
    timerId = null;
  }

  return { request, run, setAllowed, reset, get isRunning() { return activeRun !== null; } };
}
