// Routes remote rollback inputs to the session for their round. A faster peer can enter the
// next round while this client is still rendering round_end; those early frames must wait for
// the new epoch instead of being discarded by the old session.

function createOnlineInputRouter({ getSession, maxBufferedFrames = 60 }) {
  const bufferedByEpoch = new Map();

  function _validSnapshot(snap) {
    return !!snap && Number.isInteger(snap.seq) && snap.seq >= 0
      && Number.isInteger(snap.epoch) && snap.epoch >= 0;
  }

  function _deliver(session, snap) {
    session.onRemoteInput(snap.seq, snap, snap.adv, snap.epoch);
  }

  function route(snap) {
    if (!_validSnapshot(snap)) return 'discarded';

    const session = getSession();
    if (session && snap.epoch === session.epoch) {
      _deliver(session, snap);
      return 'delivered';
    }

    // Only the immediately following round is legitimate while an old session is active.
    // This bounds memory and prevents malformed far-future epochs from poisoning later rounds.
    if (!session || snap.epoch !== session.epoch + 1) return 'discarded';

    let frames = bufferedByEpoch.get(snap.epoch);
    if (!frames) {
      frames = new Map();
      bufferedByEpoch.set(snap.epoch, frames);
    }
    if (!frames.has(snap.seq) && frames.size >= maxBufferedFrames) return 'discarded';
    frames.set(snap.seq, { ...snap });
    return 'buffered';
  }

  function activate(session) {
    if (!session) return 0;
    for (const epoch of bufferedByEpoch.keys()) {
      if (epoch < session.epoch) bufferedByEpoch.delete(epoch);
    }

    const frames = bufferedByEpoch.get(session.epoch);
    if (!frames) return 0;
    bufferedByEpoch.delete(session.epoch);

    const ordered = [...frames.values()].sort((a, b) => a.seq - b.seq);
    for (const snap of ordered) _deliver(session, snap);
    return ordered.length;
  }

  function reset() {
    bufferedByEpoch.clear();
  }

  return { activate, reset, route };
}

export { createOnlineInputRouter };
