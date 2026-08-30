// The map's demons, as bodies.
//
// This used to be a Bellhop and an optional Housekeeper written out by hand, which quietly made two
// the maximum a building could hold. A roster is data now — `map-catalog.js` says who hunts in a
// given place — and this composes however many of them there are off the one `createMonster`
// factory. Cinder Mall's three cost nothing here.
//
// The one rule that is not per-demon is the threat readout: however many are in the building, the
// HUD gets a single aggregated state. That is the same rule that removed the tracker minimap —
// knowing where a demon is defeats the game, and three separate status lines would be three
// trackers.
const DEFAULT_ROSTER = Object.freeze([
  Object.freeze({ id: 'bellhop', name: 'The Bellhop', hunts: true, statusElementId: 'monsterStatus', accentColor: 0x5c141a, eyeColor: 0xff1008 }),
  Object.freeze({ id: 'housekeeper', name: 'The Housekeeper', hunts: false, statusElementId: 'housekeeperStatus', accentColor: 0x285f58, eyeColor: 0x7dffe0 }),
]);

// A roster entry may bring its own status element (the hotel's two are authored in index.html), but
// a third demon on a new map must not need markup written for it. Anything without one gets a row
// built into `#demonStatuses` on the spot, styled by the same class.
function statusElementIdFor(entry, document) {
  const authored = entry.statusElementId || `demonStatus-${entry.id}`;
  if (!document || typeof document.getElementById !== 'function') return authored;
  if (document.getElementById(authored)) return authored;
  const host = document.getElementById('demonStatuses');
  if (!host || typeof document.createElement !== 'function') return authored;
  const row = document.createElement('div');
  row.id = authored;
  row.className = 'demonStatus';
  row.dataset.state = 'roam';
  row.textContent = `${String(entry.name || '').toUpperCase()} IS ROAMING`;
  host.appendChild(row);
  return authored;
}

// The hotel's two status rows are authored in `index.html`, so on any other map they would sit in the
// HUD naming demons that are not in the building — Cinder Mall showed five. A row belongs to the
// roster or it does not belong at all.
function pruneStatusRows(document, keepIds) {
  const host = document && typeof document.getElementById === 'function' ? document.getElementById('demonStatuses') : null;
  if (!host || typeof host.querySelectorAll !== 'function') return;
  for (const row of host.querySelectorAll('.demonStatus')) {
    if (!keepIds.has(row.id)) row.remove();
  }
}

export function createDemons({ createMonster, common, roster = DEFAULT_ROSTER }) {
  let publishedState = null;
  let publishedLocalChase = null;
  const entries = (Array.isArray(roster) && roster.length ? roster : DEFAULT_ROSTER);
  // The order the server builds them in, so a snapshot's demon is posed onto the right body.
  const ids = entries.map((entry) => entry.id);
  const list = [];
  const statusIds = [];
  for (const entry of entries) {
    list.push(createMonster({
      ...common,
      // Only the roster's hunter reads the sanity meter; the rest are handed no meter at all, which
      // is what keeps the anti-camping rule legible as one stalker rather than a pack.
      sanity: entry.hunts ? common.sanity : null,
      name: entry.name,
      statusElementId: statusIds[statusIds.push(statusElementIdFor(entry, common.document)) - 1],
      // Each demon opens clear of the ones already standing. See `createMonster`.
      //
      // `getState()` reports a `position` vector rather than loose x/z, so it is flattened here: the
      // separation is a distance, and comparing against an undefined coordinate would quietly always
      // be false and place three demons on top of each other.
      takenSpawns: list.map((demon) => {
        const view = demon.getState();
        return { x: view.position?.x ?? 0, z: view.position?.z ?? 0, floor: view.floor };
      }),
      accentColor: entry.accentColor,
      eyeColor: entry.eyeColor,
    }));
  }

  pruneStatusRows(common.document, new Set(statusIds));

  function paintThreat(override = null) {
    const states = list.map((demon) => demon.getState());
    const threatState = override ? override.state : common.logic.aggregateEnemyState(states);
    const localChase = override
      ? !!override.localChase
      : states.some((state) => state.state === common.logic.ENEMY_STATES.CHASE
        && state.detectedTargetId === 'local');
    const searching = threatState === common.logic.ENEMY_STATES.SEARCH;
    const hunting = threatState === 'hunt';
    common.document.body.classList.toggle('monster-chase', localChase);
    common.document.body.classList.toggle('monster-search', searching);
    common.document.body.classList.toggle('monster-hunt', hunting);
    if (threatState !== publishedState || localChase !== publishedLocalChase) {
      publishedState = threatState;
      publishedLocalChase = localChase;
      common.world.emit('monster-state', { state: threatState, localChase });
    }
  }

  // Online the roster is the server's. The snapshot names each demon and this poses the matching
  // body — the same demons, off the same factory, with their brains switched off. The threat readout
  // stays aggregated and position-free exactly as it is offline: one state for the whole roster, so
  // two hunters never become two trackers.
  function applySnapshot(demons = [], threat = null, localId = null) {
    for (let index = 0; index < list.length; index += 1) {
      const view = demons.find((entry) => entry.id === ids[index]) || demons[index] || null;
      list[index].setRemotePose(view);
    }
    const chasingLocal = demons.some((entry) => entry.state === common.logic.ENEMY_STATES.CHASE)
      && !!localId;
    paintThreat({ state: threat || common.logic.ENEMY_STATES.ROAM, localChase: chasingLocal });
  }

  // What to call the staff, for copy that used to name The Bellhop outright. A round in Cinder Mall
  // telling the seeker to beat The Bellhop is naming a demon that is not in the building.
  const hunter = entries.find((entry) => entry.hunts) || entries[0];
  const names = entries.map((entry) => entry.name);

  return {
    primary: list[0],
    roster: entries,
    hunterName: () => (hunter ? hunter.name : 'the demon'),
    // "A and B", "A, B and C" — however many the map has.
    rosterText: () => (names.length <= 1 ? names[0] || 'the demon'
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`),
    list,
    applySnapshot,
    setPlayers(provider) { for (const demon of list) demon.setPlayers(provider); },
    update(delta, elapsed) { for (const demon of list) demon.update(delta, elapsed); paintThreat(); },
    getStates: () => list.map((demon) => demon.getState()),
  };
}
