export function createDemons({ createMonster, common, includeHousekeeper = true }) {
  let publishedState = null;
  let publishedLocalChase = null;
  const bellhop = createMonster({ ...common, name: 'The Bellhop', statusElementId: 'monsterStatus' });
  const list = [bellhop];
  // The order the server builds them in, so a snapshot's demon is posed onto the right body.
  const ids = ['bellhop', 'housekeeper'];
  if (includeHousekeeper) {
    list.push(createMonster({
      ...common,
      sanity: null,
      name: 'The Housekeeper',
      statusElementId: 'housekeeperStatus',
      excludedSpawnFloors: [bellhop.getState().floor],
      accentColor: 0x285f58,
      eyeColor: 0x7dffe0,
    }));
  }

  function paintThreat(override = null) {
    const states = list.map((demon) => demon.getState());
    const threatState = override ? override.state : common.logic.aggregateEnemyState(states);
    const localChase = override
      ? !!override.localChase
      : states.some((state) => state.state === common.logic.ENEMY_STATES.CHASE
        && state.detectedTargetId === 'local');
    const chasing = threatState === common.logic.ENEMY_STATES.CHASE;
    const searching = threatState === common.logic.ENEMY_STATES.SEARCH;
    const hunting = threatState === 'hunt';
    common.document.body.classList.toggle('monster-chase', chasing);
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

  return {
    primary: bellhop,
    list,
    applySnapshot,
    setPlayers(provider) { for (const demon of list) demon.setPlayers(provider); },
    update(delta, elapsed) { for (const demon of list) demon.update(delta, elapsed); paintThreat(); },
    getStates: () => list.map((demon) => demon.getState()),
  };
}
