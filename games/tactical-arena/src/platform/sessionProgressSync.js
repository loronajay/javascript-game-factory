// Coordinates an in-app account change with the asynchronous progress reconcile.
// Account chrome updates immediately; progress-dependent screens update again after
// storage has the signed-in account's server snapshot. Failures are contained so one
// offline attempt cannot leave the session listener wedged.

export function createSessionProgressSync({
  shouldSync = () => true,
  refreshAccount = () => {},
  syncProgress = async () => {},
  refreshProgress = () => {},
  onError = () => {},
} = {}) {
  let inFlight = null;

  return function onSessionChanged(event) {
    function reportWait(promise) {
      try { event?.detail?.waitUntil?.(promise); } catch { /* optional event handshake */ }
      return promise;
    }

    refreshAccount();
    if (!shouldSync()) return reportWait(Promise.resolve());
    if (inFlight) return reportWait(inFlight);

    inFlight = (async () => {
      try {
        await syncProgress();
      } catch (error) {
        onError(error);
      } finally {
        refreshAccount();
        refreshProgress();
        inFlight = null;
      }
    })();
    return reportWait(inFlight);
  };
}
