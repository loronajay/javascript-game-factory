import { $, showScreen } from "../ui/dom.mjs";
import { defaultShot } from "../state/session-state.mjs";

// Everything that advances a match: starting one, taking a shot through its
// spin/charge/approach/deck stages, scoring the roll, and racking the next one.
//
// This module decides; the HUD paints. It calls into `shotHud` and `scoreboard`
// to repaint after a decision, never the other way round.
export function createMatchRuntime({
  session,
  core,
  physics,
  cpu,
  balls,
  audio,
  audioCore,
  effects,
  effectsConfig,
  renderer,
  assets,
  shotHud,
  scoreboard,
  resultsScreen,
  onlineClient,
  applyMatchLane,
  getLocalLaneSlug,
  physicsStep,
  getMatchPresentation = () => ({}),
  onMatchStarted = () => {},
}) {
  const { scene } = session;

  // Every roll this client ever animates gets a distinct key, so a burst fires
  // exactly once. Online it is the server's own roll identity (stable across a
  // replay or a resume, and scoped by session so a rematch starts clean);
  // locally it is a counter that never resets, so no two rolls can collide.
  let localRollSequence = 0;

  function rollEffectKey(authority) {
    if (!authority) return `local:${localRollSequence}`;
    const sessionId = authority.snapshot?.sessionId ?? "session";
    return `online:${sessionId}:${Number(authority.roll.rollNumber) || 0}`;
  }

  // The ball position the picture is already using. Read, never written: the
  // trail follows the shot, it does not steer it.
  function displayedBallPosition() {
    if (scene.phase === "approach") {
      return {
        x: scene.gutterSide
          ? scene.gutterSide * physics.GUTTER_CENTER_X
          : physics.trajectoryX(scene.ballZ, scene.shot),
        z: scene.ballZ,
      };
    }
    if (scene.simulation?.ball?.active) {
      return {
        x: scene.simulation.ball.x,
        z: physics.RACK_FRONT_Z + scene.simulation.ball.y / physics.Z_SCALE,
      };
    }
    return null;
  }

  function emitBallTrail(dt) {
    const position = displayedBallPosition();
    if (!position) return;
    const { trailStyle, reducedMotion } = effectsConfig(session.activePlayer());
    effects.emitTrail(session.effects, { ...position, dt, style: trailStyle, reducedMotion });
  }

  function clonePins(pins) {
    return Array.isArray(pins) ? pins.map((pin) => ({ ...pin })) : physics.createRack();
  }

  function applyBallProfile() {
    const ball = balls[scene.liveShot.ballIndex] || balls[0];
    scene.liveShot.hookScale = ball.hookScale;
    scene.liveShot.speedScale = ball.speedScale;
    scene.liveShot.massScale = ball.massScale;
  }

  function resetHumanShot() {
    const playerIndex = session.match?.activePlayer ?? 0;
    const previousShot = session.playerShots[playerIndex] || scene.liveShot;
    const freshShot = {
      ...defaultShot(),
      ballIndex: previousShot?.ballIndex ?? 0,
    };
    session.playerShots[playerIndex] = freshShot;
    Object.assign(scene.liveShot, freshShot);
    shotHud.syncControlsFromShot();
  }

  function createPlayers() {
    const { setup } = session;
    const sanctionedMatch = session.tournamentMatch || session.campaignMatch;
    const campaignOpponent = sanctionedMatch
      ? assets.bowlerBySlug(sanctionedMatch.opponentSlug)
      : null;
    const campaignPlayer = sanctionedMatch
      ? assets.bowlerBySlug(setup.characterSlugs[0])
      : null;
    return [
      {
        id: "p1",
        name: campaignPlayer?.name || "Player 1",
        characterSlug: setup.characterSlugs[0],
        skinId: setup.skinIds[0],
        presentation: getMatchPresentation(setup.characterSlugs[0]),
        type: "human",
      },
      {
        id: "p2",
        name: campaignOpponent?.name || (setup.playType === "cpu" ? core.chooseCpuName() : "Player 2"),
        characterSlug: setup.characterSlugs[1],
        skinId: setup.skinIds[1],
        presentation: getMatchPresentation(setup.characterSlugs[1]),
        type: sanctionedMatch || setup.playType === "cpu" ? "cpu" : "human",
      },
    ];
  }

  function prepareActivePlayer({ announce = true } = {}) {
    const player = session.activePlayer();
    if (!player) return;
    Object.assign(scene.liveShot, session.playerShots[session.match.activePlayer] || defaultShot());
    applyBallProfile();
    shotHud.renderBallProfile();
    shotHud.syncControlsFromShot();
    shotHud.syncRackSelection();
    const skinId = session.playerSkinId(player);
    renderer.setCharacter(player.characterSlug, skinId).catch(console.error);
    $("turn-avatar").src = assets.characterPortrait(player.characterSlug, skinId);
    resultsScreen.preloadCalloutPoses(player);
    if (player.type === "cpu") session.cpuDelay = 0.8;
    if (announce) {
      session.bannerTime = 1;
      audio.play("announce");
    }
  }

  function startMatch() {
    applyMatchLane(session.tournamentMatch?.venueSlug || session.campaignMatch?.venueSlug || getLocalLaneSlug());
    session.setup.skinIds = session.setup.characterSlugs.map((slug) => assets.storedSkinId(slug));
    session.onlineMatch = false;
    session.onlineSnapshot = null;
    session.pendingAuthoritativeRoll = null;
    session.lastAppliedOnlineRoll = 0;
    session.reportedRatingSessionId = "";
    session.matchFacts.rolls = [];
    session.match = core.createMatch({
      modeId: session.setup.modeId,
      playType: session.tournamentMatch ? "tournament" : session.campaignMatch ? "campaign" : session.setup.playType,
      cpuLevelId: session.setup.cpuLevelId,
      players: createPlayers(),
    });
    session.resetScene(physics.createRack());
    session.cpuDelay = 0.8;
    shotHud.resetChargeFeedback();
    shotHud.resetSpinFeedback();
    $("pause-overlay").hidden = true;
    $("restart-match-button").hidden = false;
    $("quit-match-button").textContent = session.tournamentMatch
      ? "Quit to tournament"
      : session.campaignMatch ? "Quit to circuit" : "Quit to setup";
    $("online-result-status").hidden = true;
    audio.resumeMusic();
    resetHumanShot();
    prepareActivePlayer();
    scoreboard.updateMatchUI();
    showScreen("game-screen");
    onMatchStarted(session.match.players);
  }

  function selectBall(index) {
    if (!session.canAdjustShot()) return;
    scene.liveShot.ballIndex = index;
    applyBallProfile();
    shotHud.renderBallProfile();
    shotHud.syncRackSelection();
  }

  function startSpin() {
    if (!session.canAdjustShot()) return;
    audio.unlock();
    audio.play("select", { intensity: 0.75 });
    scene.phase = "spin";
    scene.spinElapsed = 0;
    scene.spinLevel = physics.spinAtTime(0, balls[scene.liveShot.ballIndex].meterSpeed);
    scene.liveShot.hook = scene.spinLevel;
    shotHud.updateSpinFeedback();
    shotHud.updateShotControls();
  }

  function startCharge() {
    if (scene.phase !== "spin" || session.activePlayer()?.type !== "human" || session.paused) return;
    audio.unlock();
    audio.play("charge");
    scene.liveShot.hook = scene.spinLevel;
    scene.phase = "charging";
    scene.chargeElapsed = 0;
    scene.chargeState = physics.chargeStateAtTime(0, balls[scene.liveShot.ballIndex]);
    scene.chargeLevel = scene.chargeState.power;
    scene.liveShot.power = scene.chargeLevel;
    $("throw-button").classList.add("is-charging");
    shotHud.updateShotControls();
    shotHud.updateChargeFeedback();
  }

  function releaseCharge() {
    if (scene.phase !== "charging") return;
    const power = scene.chargeLevel;
    $("throw-button").classList.remove("is-charging");
    // Online, the shot is a request: the server simulates it and deals the
    // result back, so the local deck waits rather than predicting.
    if (session.onlineMatch) {
      scene.liveShot.power = power;
      scene.phase = "submitting";
      onlineClient.submitShot({ ...scene.liveShot, power, release: 0 });
      shotHud.updateShotControls();
      return;
    }
    beginThrow(power);
  }

  function beginThrow(power, { release = 0 } = {}) {
    const ball = balls[scene.liveShot.ballIndex];
    scene.shot = {
      ...scene.liveShot,
      power,
      release,
      hookScale: ball.hookScale,
      speedScale: ball.speedScale,
      massScale: ball.massScale,
    };
    session.playerShots[session.match.activePlayer] = { ...scene.liveShot };
    scene.phase = "approach";
    scene.ballZ = 0.02;
    scene.gutterSide = 0;
    scene.throwElapsed = 0;
    scene.liveShot.power = power;
    scene.simulation = null;
    session.contactedPinCount = 0;
    audio.play("throw", { intensity: power });
    shotHud.updateShotControls();
  }

  function planCpuTurn() {
    const plan = cpu.createCpuPlan({
      levelId: session.match.cpuLevelId,
      pins: scene.pins,
      balls,
    });
    Object.assign(scene.liveShot, plan);
    scene.liveShot.ballIndex = plan.ballIndex;
    applyBallProfile();
    shotHud.renderBallProfile();
    shotHud.syncControlsFromShot();
    shotHud.syncRackSelection();
    beginThrow(plan.power, { release: plan.release });
  }

  function finalizeRoll() {
    const shooter = session.activePlayer();
    const frameIndex = session.match.frameIndex;
    const rollIndex = shooter?.frames?.[frameIndex]?.length || 0;
    const startedStanding = scene.simulation.startStanding;
    // Online, the server's count is the truth and the local simulation was only
    // the animation of it.
    const authority = session.onlineMatch ? session.pendingAuthoritativeRoll : null;
    const knocked = authority
      ? authority.roll.knocked
      : Math.max(0, Math.min(startedStanding, physics.knockedCount(scene.simulation)));
    scene.pins = authority ? clonePins(authority.roll.pinsAfter) : scene.simulation.pins;
    session.matchFacts.rolls.push({
      playerId: shooter?.id || "",
      frameIndex,
      rollIndex,
      standingPinIdsAfter: scene.pins.filter((pin) => pin.standing).map((pin) => Number(pin.id)).sort((a, b) => a - b),
    });
    if (!authority) localRollSequence += 1;
    resultsScreen.showCallout(knocked, startedStanding);
    if (knocked > 0) renderer.shake = Math.min(12, 3 + knocked);

    // The equipped strike burst, fired off the same outcome the callout and the
    // audio cue use so there is only ever one definition of a strike.
    if (audioCore.getOutcomeCue(knocked, startedStanding) === "strike") {
      const { burstStyle, reducedMotion } = effectsConfig(shooter);
      effects.triggerBurst(session.effects, {
        x: 0,
        z: physics.RACK_FRONT_Z,
        key: rollEffectKey(authority),
        style: burstStyle,
        reducedMotion,
      });
    }

    if (authority) {
      session.match = structuredClone(authority.snapshot.match);
      session.onlineSnapshot = authority.snapshot;
      session.lastAppliedOnlineRoll = Number(authority.roll.rollNumber) || session.lastAppliedOnlineRoll;
      session.pendingAuthoritativeRoll = null;
    } else {
      session.match = core.recordRoll(session.match, knocked);
    }
    scene.phase = "transition";
    session.transitionTime = 1.35;
    scoreboard.updateMatchUI();
  }

  function prepareNextRoll() {
    if (session.match.status === "complete") {
      resultsScreen.showResults();
      return;
    }
    const expectedPins = core.pinsStandingForTurn(session.match);
    scene.pins = session.onlineMatch && session.onlineSnapshot?.nextPins
      ? clonePins(session.onlineSnapshot.nextPins)
      : expectedPins === 10 ? physics.createRack() : physics.clearFallen(scene.pins);
    Object.assign(scene, {
      simulation: null,
      phase: "ready",
      ballZ: 0,
      gutterSide: 0,
      throwElapsed: 0,
      spinElapsed: 0,
      spinLevel: 0,
      chargeElapsed: 0,
      chargeLevel: 0,
      chargeState: null,
    });
    session.contactedPinCount = 0;
    shotHud.resetChargeFeedback();
    shotHud.resetSpinFeedback();
    if (session.activePlayer()?.type === "human") resetHumanShot();
    prepareActivePlayer();
    scoreboard.updateMatchUI();
  }

  // One fixed 60Hz tick. `keys` is the live held-input map owned by the input
  // bindings, read here rather than pushed in, so a key held across a phase
  // change keeps working.
  function tick(dt, keys) {
    if (!session.match || session.paused || $("game-screen").hidden) return;
    session.bannerTime = Math.max(0, session.bannerTime - dt);
    session.calloutTime = Math.max(0, session.calloutTime - dt);
    emitBallTrail(dt);
    effects.advance(session.effects, dt);
    scoreboard.updateOverlayVisibility();

    const strafeDirection = (keys.strafeRight ? 1 : 0) - (keys.strafeLeft ? 1 : 0);
    const aimDirection = (keys.aimRight ? 1 : 0) - (keys.aimLeft ? 1 : 0);

    if (session.canAdjustShot()) {
      if (strafeDirection) {
        scene.liveShot.position = Math.max(-0.46, Math.min(0.46, scene.liveShot.position + strafeDirection * dt * 0.46));
      }
      if (aimDirection) {
        const ball = balls[scene.liveShot.ballIndex] || balls[0];
        scene.liveShot.aim = Math.max(-0.45, Math.min(0.45, scene.liveShot.aim + aimDirection * dt * 0.45 * ball.aimSpeed));
      }
      if (strafeDirection || aimDirection) shotHud.syncControlsFromShot();
    }

    if (scene.phase === "ready" && session.activePlayer()?.type === "cpu") {
      session.cpuDelay -= dt;
      if (session.cpuDelay <= 0) planCpuTurn();
    } else if (scene.phase === "spin") {
      scene.spinElapsed += dt;
      scene.spinLevel = physics.spinAtTime(scene.spinElapsed, balls[scene.liveShot.ballIndex].meterSpeed);
      scene.liveShot.hook = scene.spinLevel;
      shotHud.updateSpinFeedback();
    } else if (scene.phase === "charging") {
      scene.chargeElapsed += dt;
      const ball = balls[scene.liveShot.ballIndex] || balls[0];
      scene.chargeState = physics.chargeStateAtTime(scene.chargeElapsed, ball);
      scene.chargeLevel = scene.chargeState.power;
      scene.liveShot.power = scene.chargeLevel;
      shotHud.updateChargeFeedback();
    } else if (scene.phase === "approach") {
      scene.throwElapsed += dt;
      // A late nudge during the approach is a local human's release tweak; it
      // has no meaning online, where the shot is already with the server.
      if (!session.onlineMatch && session.activePlayer()?.type === "human"
        && scene.throwElapsed <= 0.32 && strafeDirection) {
        scene.shot.release = Math.max(-0.035, Math.min(0.035, scene.shot.release + strafeDirection * dt * 0.1));
      }
      scene.ballZ += physics.ballSpeedForShot(scene.shot) * dt;
      if (!scene.gutterSide) {
        scene.gutterSide = physics.gutterSideForX(physics.trajectoryX(scene.ballZ, scene.shot));
      }
      if (scene.ballZ >= physics.PHYSICS_START_Z) {
        scene.ballZ = physics.PHYSICS_START_Z;
        scene.simulation = physics.createSimulation(scene.pins, scene.shot, { gutterSide: scene.gutterSide });
        session.contactedPinCount = 0;
        scene.phase = "deck";
      }
    } else if (scene.phase === "deck") {
      scene.throwElapsed += dt;
      for (let i = 0; i < 3; i += 1) physics.stepSimulation(scene.simulation, physicsStep);
      scene.pins = scene.simulation.pins;
      const nextContactedPinCount = scene.pins.filter((pin) => pin.contacted).length;
      if (nextContactedPinCount > session.contactedPinCount) {
        const newContacts = nextContactedPinCount - session.contactedPinCount;
        audio.play("pin", { intensity: 0.92 + newContacts * 0.12 });
        session.contactedPinCount = nextContactedPinCount;
      }
      scoreboard.updateStandingPinCount();
      if (scene.simulation.complete) finalizeRoll();
    } else if (scene.phase === "transition") {
      session.transitionTime -= dt;
      if (session.transitionTime <= 0) prepareNextRoll();
    }
  }

  return {
    startMatch,
    prepareActivePlayer,
    prepareNextRoll,
    selectBall,
    startSpin,
    startCharge,
    releaseCharge,
    beginThrow,
    applyBallProfile,
    clonePins,
    tick,
  };
}
