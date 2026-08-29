export function createDemons({ createMonster, common, includeHousekeeper = true }) {
  let publishedState = null;
  let publishedLocalChase = null;
  const bellhop = createMonster({ ...common, name: 'The Bellhop', statusElementId: 'monsterStatus' });
  const list = [bellhop];
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

  function paintThreat() {
    const states = list.map((demon) => demon.getState());
    const threatState = common.logic.aggregateEnemyState(states);
    const localChase = states.some((state) => state.state === common.logic.ENEMY_STATES.CHASE
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

  return {
    primary: bellhop,
    list,
    setPlayers(provider) { for (const demon of list) demon.setPlayers(provider); },
    update(delta, elapsed) { for (const demon of list) demon.update(delta, elapsed); paintThreat(); },
    getStates: () => list.map((demon) => demon.getState()),
  };
}
