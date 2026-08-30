// Which map this page is standing.
//
// A map is not a setting a running game can change: the hotel is built once at boot, the demons
// spawn into it, the elevator is a shaft in it, and the collision set is its plan. Swapping the
// building under a live scene would mean tearing down and rebuilding every one of those, and the
// first bug it produced would be a body standing in a wall that used to be a corridor.
//
// So a map change is an *entry*, not a transition: the choice is written down and the page re-enters
// into it, which is the same honesty `quit` already has (it reloads rather than pretending the hotel
// reset). Boot reads the choice back from the URL first — a `?map=` link has to win, because that is
// how someone shares a location — and from the saved preference after that.
const STORAGE_KEY = 'hideAndSeek.mapId';
// The solo setup a player had filled in when they changed location. A reload that dumped them back
// on the title screen would make the picker feel like a punishment for looking at another map.
const SETUP_KEY = 'hideAndSeek.pendingSetup';

export function createMapSession({ maps, window: win = globalThis, storage = null }) {
  const location = win.location || { search: '', href: '' };
  const store = storage !== null ? storage : safeStorage(win);

  function safeStorage(scope) {
    // A file:// page and a browser with site data blocked both throw on the first touch, and neither
    // is a reason not to play. The map is a preference, not state a round depends on.
    try {
      const candidate = scope.localStorage;
      candidate.getItem(STORAGE_KEY);
      return candidate;
    } catch { return null; }
  }

  function read(key) {
    try { return store ? store.getItem(key) : null; } catch { return null; }
  }

  function queryMapId() {
    const search = String(location.search || '');
    const match = /[?&]map=([^&]+)/.exec(search);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // The map a round will actually happen in. A registered-but-unbuilt map falls back to the default
  // rather than booting into a location with no geometry.
  const requested = queryMapId() || read(STORAGE_KEY);
  const activeId = maps ? maps.playableMapId(requested) : 'grand-hotel';

  function remember(mapId) {
    try { if (store) store.setItem(STORAGE_KEY, mapId); } catch { /* preference only */ }
  }

  // The setup the player was mid-way through, handed back exactly once so a second reload for any
  // other reason lands on the title the way it always did.
  function takePendingSetup() {
    const raw = read(SETUP_KEY);
    try { if (store) store.removeItem(SETUP_KEY); } catch { /* preference only */ }
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  // Returns true when the caller must stop what it was doing: the page is on its way out.
  function select(mapId, setup = null) {
    const next = maps ? maps.playableMapId(mapId) : activeId;
    remember(next);
    if (next === activeId) return false;
    try { if (store && setup) store.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* preference only */ }
    const base = String(location.href || '').split('?')[0].split('#')[0];
    win.location.href = `${base}?map=${encodeURIComponent(next)}`;
    return true;
  }

  function reopenOnlineSetup() {
    try { if (store) store.setItem(SETUP_KEY, JSON.stringify({ mode: 'online', mapId: activeId })); } catch { /* preference only */ }
    win.location.reload();
  }

  return {
    activeMapId: () => activeId,
    // What the picker last showed, which may be a `soon` map the player is only looking at.
    requestedMapId: () => (maps ? maps.normalizeMapId(requested) : activeId),
    map: () => (maps ? maps.getMap(activeId) : null),
    demonRoster: () => (maps ? maps.demonRosterFor(activeId) : []),
    remember, select, takePendingSetup, reopenOnlineSetup, SETUP_KEY, STORAGE_KEY,
  };
}
