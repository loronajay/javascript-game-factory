// The round: who is it, who is left, how long there is, and who won.
//
// All of the rules are in `round-logic.js` — this module only samples the built world for the
// positions the rules need, paints the HUD, and routes the two endings onto the screen the menu
// already owns. Catch resolution runs here rather than being announced by whoever thinks they were
// tagged, because that is the shape a server has to keep when this goes online.
export function createRound({ camera, world, player, elevator, hiders, seeker = null, spectator = null, avatars = null, localRole = 'seeker', monster, monsters, staff = monsters, flashlightDrops, logic, config, document, window }) {
  const LOCAL_ID = 'local';
  const localIsSeeker = localRole === logic.ROLES.SEEKER;
  const SEEKER_ID = localIsSeeker ? LOCAL_ID : seeker?.id;
  const clockEl = document.getElementById('roundClock');
  const countEl = document.getElementById('roundCount');
  const bannerEl = document.getElementById('roundBanner');
  const hudEl = document.getElementById('roundHud');
  const caughtOverlay = document.getElementById('caughtOverlay');
  const players = localIsSeeker ? [LOCAL_ID, ...hiders.ids()] : [SEEKER_ID, LOCAL_ID, ...hiders.ids()].filter(Boolean);
  let state = logic.createRound({ players, seekerId: SEEKER_ID, config });
  // The copy names this map's staff. It used to say "The Bellhop" outright, which is a demon that
  // does not work at Cinder Mall.
  const hunterText = () => (staff && staff.hunterName ? staff.hunterName() : 'The Bellhop');
  const staffText = () => (staff && staff.rosterText ? staff.rosterText() : 'The Bellhop and The Housekeeper');
  const demonList = Array.isArray(monsters) && monsters.length ? monsters : [monster];
  let announcedPhase = null;
  world.state.localRole = localRole;
  world.state.playerEliminated = false;
  world.state.seekerHeld = localIsSeeker && state.phase === logic.PHASES.HIDING;
  if (state.phase === logic.PHASES.HIDING) {
    elevator.holdSeeker(localIsSeeker ? undefined : { moveCamera: false });
    seeker?.setHeld(true);
  }

  function localPose() {
    return {
      id: LOCAL_ID,
      x: camera.position.x,
      y: camera.position.y - player.getEyeHeight(),
      z: camera.position.z,
      floor: world.state.playerFloor || 1,
      yaw: world.state.yaw,
      crouching: player.isCrouching ? player.isCrouching() : false,
    };
  }

  function seekerPose() { return localIsSeeker ? localPose() : seeker?.getState(); }

  function spectatorRoster() {
    const live = new Map(hiders.list().map((entry) => [entry.id, { ...entry, role: logic.ROLES.HIDER, alive: true }]));
    if (seeker) live.set(seeker.id, seeker.getState());
    live.set(LOCAL_ID, { ...localPose(), name: 'You', role: localRole });
    return state.participants.map((entry) => ({ ...live.get(entry.id), id: entry.id, role: entry.role, alive: entry.alive })).filter((entry) => Number.isFinite(entry.x));
  }

  function beginSpectating() {
    world.state.playerEliminated = true;
    avatars?.setVisible(LOCAL_ID, false);
    player.setFlashlight(false);
    spectator?.start(spectatorRoster, LOCAL_ID);
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
      if (!localIsSeeker) return ['NO VACANCY', 'THE SEEKER WON', 'Every hiding place was cleared. Watch the other guests after a catch, then try a different floor next round.'];
      return ['CHECKOUT COMPLETE', 'EVERY GUEST FOUND', `You cleared the building before it cleared you. ${staffText()} went hungry.`];
    }
    if (!localIsSeeker) return ['STILL OCCUPIED', 'HIDERS WIN', world.state.playerEliminated ? 'The remaining guests outlasted the hunt. You stayed to watch the building finish what it started.' : 'The seeker was taken before every guest was found. You made it out of the hunt alive.'];
    if (view.cause === logic.CAUSES.TIMEOUT) {
      const left = view.hidersRemaining;
      return ['LAST CALL', 'TIME RAN OUT', `${left} guest${left === 1 ? '' : 's'} stayed hidden. Sweep the floors faster — sprinting costs, but so does dawdling.`];
    }
    return ['ROOM SERVICE', 'IT FOUND YOU', 'The demons do not care that you were the one seeking. Break line of sight, keep moving, and do not assume the stairs made them forget.'];
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
    spectator?.stop();
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
    if (view.phase === logic.PHASES.HIDING) bannerEl.textContent = localIsSeeker ? 'THEY ARE HIDING — WAIT HERE' : 'HIDE. THE SEEKER IS HELD.';
    else if (announcedPhase === logic.PHASES.HIDING) {
      bannerEl.textContent = 'GO';
      world.notify(localIsSeeker ? `GO. FIND THEM ALL BEFORE ${hunterText().toUpperCase()} FINDS YOU.` : 'THE SEEKER IS OUT. KEEP MOVING.', 3200);
    } else bannerEl.textContent = '';
    announcedPhase = view.phase;
  }

  function resolveDemonCatches() {
    const demonStates = demonList.map((demon) => demon.getState());
    for (const hider of hiders.list()) {
      const catcher = demonStates.find((demon) => Math.abs(hider.y - demon.position.y) < 1.15
        && Math.hypot(hider.x - demon.position.x, hider.z - demon.position.z) < config.demonCatchDistance);
      if (!catcher) continue;
      flashlightDrops?.drop({ playerId: hider.id, x: hider.x, y: hider.y, z: hider.z, floor: hider.floor, charge: hider.flashlightCharge });
      state = logic.resolveDemonCatch(state, hider.id);
      hiders.eliminate(hider.id);
      world.notify(`GUEST ${hider.id.split('-')[1]} WAS TAKEN BY ${catcher.name.toUpperCase()}.`, 2600);
      world.emit('demon-catch', { demon: catcher.name, playerId: hider.id, phase: state.phase });
    }
    if (seeker) {
      const target = seeker.getState();
      const catcher = target.alive && demonStates.find((demon) => Math.abs(target.y - demon.position.y) < 1.15
        && Math.hypot(target.x - demon.position.x, target.z - demon.position.z) < config.demonCatchDistance);
      if (catcher) {
        state = logic.resolveDemonCatch(state, seeker.id);
        seeker.eliminate();
        world.emit('demon-catch', { demon: catcher.name, playerId: seeker.id, phase: state.phase });
      }
    }
  }

  function resolveSeekerTags() {
    const seeker = seekerPose();
    if (!seeker) return;
    if (!localIsSeeker) {
      const local = logic.participant(state, LOCAL_ID);
      const pose = localPose();
      if (local?.alive && logic.canTag({ seeker, hider: pose, occluded: blockedBetween(seeker, pose) }, config)) {
        const flashlight = player.getState();
        flashlightDrops?.drop({ playerId: LOCAL_ID, x: pose.x, y: pose.y, z: pose.z, floor: pose.floor, charge: flashlight.flashlightCharge });
        state = logic.resolveTag(state, { seekerId: SEEKER_ID, hiderId: LOCAL_ID });
        beginSpectating();
        world.notify('THE SEEKER FOUND YOU. SPECTATING THE REST OF THE MATCH.', 2600);
      }
    }
    for (const hider of hiders.list()) {
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
    if (previousPhase === logic.PHASES.HIDING && state.phase === logic.PHASES.SEEKING) { elevator.releaseSeeker(); seeker?.setHeld(false); }
    const seekerState = seekerPose();
    const demonStates = demonList.map((demon) => demon.getState());
    // The seeker is a threat to hiders and so is the demon; the hiders cannot tell the difference
    // between an AI seeker and a human one, which is the point.
    hiders.update(delta, [
      { ...seekerState, kind: logic.ROLES.SEEKER },
      ...demonStates.map((demon) => ({ x: demon.position.x, z: demon.position.z, floor: demon.floor, kind: 'demon' })),
    ]);
    if (!localIsSeeker && seekerState?.alive) {
      const local = logic.participant(state, LOCAL_ID);
      seeker.update(delta, [
        { ...localPose(), role: logic.ROLES.HIDER, alive: !!local?.alive },
        ...hiders.list().map((entry) => ({ ...entry, role: logic.ROLES.HIDER, alive: true })),
      ]);
    }
    // Demons hunt throughout the whole active round. Only the seeker's own tag remains gated behind
    // the head start, so guests can be taken while they are still trying to reach a hiding place.
    resolveDemonCatches();
    if (state.phase === logic.PHASES.SEEKING && state.status === logic.ROUND_STATES.ACTIVE) resolveSeekerTags();
    // The head start is a rule, not a caption: the seeker looks around but does not walk.
    world.state.seekerHeld = localIsSeeker && state.phase === logic.PHASES.HIDING;
    const view = logic.describeRound(state, config);
    updateHud(view);
    if (view.over) finish(view);
  }

  // The demon reaching the seeker is already the game's oldest ending; the round only has to record
  // which side that hands the win to.
  window.addEventListener('hotel:caught', (event) => {
    if (event.detail && event.detail.outcome) return;
    const local = logic.participant(state, LOCAL_ID);
    if (local?.alive) {
      const pose = localPose(); const flashlight = player.getState();
      flashlightDrops?.drop({ playerId: LOCAL_ID, x: pose.x, y: pose.y, z: pose.z, floor: pose.floor, charge: flashlight.flashlightCharge });
    }
    state = logic.resolveDemonCatch(state, LOCAL_ID);
    const view = logic.describeRound(state, config);
    if (!localIsSeeker && !view.over) beginSpectating();
    else if (!localIsSeeker) finish(view);
    else paintEnding(view);
  });

  updateHud(logic.describeRound(state, config));
  return { update, getState: () => logic.describeRound(state, config) };
}
