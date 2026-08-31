// Loading is local; room state is authoritative. Only the most recent entry
// intent may enter a lane after an asynchronous engine load completes.
export function createModeReadiness(prepare) {
  let ready = false, pending = null, generation = 0;
  return {
    cancel() { generation += 1; },
    run(style, action, onError) {
      const ticket = ++generation;
      if (style !== '3d' || ready) return action();
      pending ||= (async () => { await prepare('3d'); ready = true; })()
        .finally(() => { pending = null; });
      return pending.then(() => ticket === generation ? action() : false)
        .catch(error => { if (ticket === generation) onError(error); return false; });
    },
  };
}
