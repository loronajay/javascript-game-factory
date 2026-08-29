// The round: who is it, who is left, how long there is, and who won.
//
// All of the rules are in `round-logic.js` — this module only samples the built world for the
// positions the rules need, paints the HUD, and routes the two endings onto the screen the menu
// already owns. Catch resolution runs here rather than being announced by whoever thinks they were
// tagged, because that is the shape a server has to keep when this goes online.
export function createRound({ camera, world, player, elevator, hiders, monster, logic, config, document, window }) {
  const SEEKER_ID = 'local';
  const clockEl = document.getElementById('roundClock');
  const countEl = document.getElementById('roundCount');
  const bannerEl = document.getElementById('roundBanner');
  const hudEl = document.getElementById('roundHud');
  const caughtOverlay = document.getElementById('caughtOverlay');
  let state = logic.createRound({ players: [SEEKER_ID, ...hiders.ids()], seekerId: SEEKER_ID, config });
  let announcedPhase = null;
  world.state.seekerHeld = state.phase === logic.PHASES.HIDING;
  if (world.state.seekerHeld) elevator.holdSeeker();

  function seekerPose() {
    return {
      x: camera.position.x,
      y: camera.position.y - player.getEyeHeight(),
      z: camera.position.z,
      floor: world.state.playerFloor || 1,
    };
  }

  // Cheap line of sight: walls in this hotel are solid boxes, so sampling the segment between the
  // two bodies catches the "tagged through a bedroom wall" case without a raycast per hider per tick.
  function blockedBetween(from, to) {
    for (const t of [0.35, 0.5, 0.65]) {
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      if (world.collidesAt(x, z, Math.min(from.y, to.y) + 0.1, 1.2, 0.05)) return true;
    }
    return false;
  }

  function endedText(view) {
    if (view.outcome === logic.OUTCOMES.SEEKER) {
      return ['CHECKOUT COMPLETE', 'EVERY GUEST FOUND', 'You cleared the hotel before it cleared you. The Bellhop went hungry.'];
    }
    if (view.cause === logic.CAUSES.TIMEOUT) {
      const left = view.hidersRemaining;
      return ['LAST CALL', 'TIME RAN OUT', `${left} guest${left === 1 ? '' : 's'} stayed hidden. Sweep the floors faster — sprinting costs, but so does dawdling.`];
    }
    return ['ROOM SERVICE', 'IT FOUND YOU', 'The Bellhop does not care that you were the one seeking. Break its line of sight with corners, furniture, and crouching.'];
  }

  function paintEnding(view) {
    const [eyebrow, title, body] = endedText(view);
    const panel = caughtOverlay.querySelector('.caughtPanel');
    if (panel) {
      panel.querySelector('.caughtEyebrow').textContent = eyebrow;
      panel.querySelector('h1').textContent = title;
      panel.querySelector('p').textContent = body;
    }
    caughtOverlay.classList.add('visible');
    document.body.classList.add('caught');
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  function finish(view) {
    if (world.state.gameOver) { paintEnding(view); return; }
    world.state.gameOver = true;
    world.state.isLocked = false;
    paintEnding(view);
    world.emit('round-over', { outcome: view.outcome, cause: view.cause, hidersRemaining: view.hidersRemaining });
    // The menu's caught screen is the one full-viewport ending surface, so a win and a loss both
    // land on it rather than growing a second overlay that can stack on the first.
    world.emit('caught', { outcome: view.outcome });
  }

  function updateHud(view) {
    clockEl.textContent = view.clock;
    countEl.textContent = `${view.hidersRemaining} / ${view.hidersTotal}`;
    hudEl.dataset.phase = view.phase;
    if (view.phase === logic.PHASES.HIDING) bannerEl.textContent = 'THEY ARE HIDING — WAIT HERE';
    else if (announcedPhase === logic.PHASES.HIDING) {
      bannerEl.textContent = 'GO';
      world.notify('GO. FIND THEM ALL BEFORE THE BELLHOP FINDS YOU.', 3200);
    } else bannerEl.textContent = '';
    announcedPhase = view.phase;
  }

  function resolveCatches() {
    const seeker = seekerPose();
    const demon = monster.getState();
    const demonPose = { x: demon.position.x, y: demon.position.y, z: demon.position.z, floor: demon.floor };
    for (const hider of hiders.list()) {
      // The demon is checked first: it does not care whose hand got there, and a hider it takes
      // still counts toward the seeker's win.
      if (Math.abs(hider.y - demonPose.y) < 1.15 && Math.hypot(hider.x - demonPose.x, hider.z - demonPose.z) < config.demonCatchDistance) {
        state = logic.resolveDemonCatch(state, hider.id);
        hiders.eliminate(hider.id);
        world.notify(`GUEST ${hider.id.split('-')[1]} WAS TAKEN.`, 2600);
        continue;
      }
      if (logic.canTag({ seeker, hider, occluded: blockedBetween(seeker, hider) }, config)) {
        state = logic.resolveTag(state, { seekerId: SEEKER_ID, hiderId: hider.id });
        if (!logic.participant(state, hider.id).alive) {
          hiders.eliminate(hider.id);
          world.notify('FOUND ONE.', 1800);
        }
      }
    }
  }

  function update(delta) {
    if (state.status === logic.ROUND_STATES.ENDED) return;
    const previousPhase = state.phase;
    state = logic.tickRound(state, delta, config);
    if (previousPhase === logic.PHASES.HIDING && state.phase === logic.PHASES.SEEKING) elevator.releaseSeeker();
    const seeker = seekerPose();
    const demon = monster.getState();
    // The seeker is a threat to hiders and so is the demon; the hiders cannot tell the difference
    // between an AI seeker and a human one, which is the point.
    hiders.update(delta, [
      { ...seeker, kind: logic.ROLES.SEEKER },
      { x: demon.position.x, z: demon.position.z, floor: demon.floor, kind: 'demon' },
    ]);
    if (state.phase === logic.PHASES.SEEKING) resolveCatches();
    // The head start is a rule, not a caption: the seeker looks around but does not walk.
    world.state.seekerHeld = state.phase === logic.PHASES.HIDING;
    const view = logic.describeRound(state, config);
    updateHud(view);
    if (view.over) finish(view);
  }

  // The demon reaching the seeker is already the game's oldest ending; the round only has to record
  // which side that hands the win to.
  window.addEventListener('hotel:caught', (event) => {
    if (event.detail && event.detail.outcome) return;
    state = logic.resolveDemonCatch(state, SEEKER_ID);
    paintEnding(logic.describeRound(state, config));
  });

  updateHud(logic.describeRound(state, config));
  return { update, getState: () => logic.describeRound(state, config) };
}
