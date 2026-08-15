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
  renderer,
  assets,
  shotHud,
  scoreboard,
  resultsScreen,
  onlineClient,
  applyMatchLane,
  getLocalLaneSlug,
  physicsStep,
}) {
  const { scene } = session;

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
    scene.liveShot.position = 0;
    scene.liveShot.aim = 0.1;
    scene.liveShot.hook = -0.1;
    shotHud.syncControlsFromShot();
  }

  function createPlayers() {
    const { setup } = session;
    return [
      {
        id: "p1",
        name: "Player 1",
        characterSlug: setup.characterSlugs[0],
        skinId: setup.skinIds[0],
        type: "human",
      },
      {
        id: "p2",
        name: setup.playType === "cpu" ? core.chooseCpuName() : "Player 2",
        characterSlug: setup.characterSlugs[1],
        skinId: setup.skinIds[1],
        type: setup.playType === "cpu" ? "cpu" : "human",
      },
    ];
  }

  function prepareActivePlayer() {
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
    session.bannerTime = 1;
    audio.play("announce");
  }

  function startMatch() {
    applyMatchLane(getLocalLaneSlug());
    session.onlineMatch = false;
    session.onlineSnapshot = null;
    session.pendingAuthoritativeRoll = null;
    session.lastAppliedOnlineRoll = 0;
    session.reportedRatingSessionId = "";
    session.match = core.createMatch({
      modeId: session.setup.modeId,
      playType: session.setup.playType,
      cpuLevelId: session.setup.cpuLevelId,
      players: createPlayers(),
    });
    session.resetScene(physics.createRack());
    session.cpuDelay = 0.8;
    shotHud.resetChargeFeedback();
    shotHud.resetSpinFeedback();
    $("pause-overlay").hidden = true;
    $("restart-match-button").hidden = false;
    $("online-result-status").hidden = true;
    audio.resumeMusic();
    resetHumanShot();
    prepareActivePlayer();
    scoreboard.updateMatchUI();
    showScreen("game-screen");
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
    const startedStanding = scene.simulation.startStanding;
    // Online, the server's count is the truth and the local simulation was only
    // the animation of it.
    const authority = session.onlineMatch ? session.pendingAuthoritativeRoll : null;
    const knocked = authority
      ? authority.roll.knocked
      : Math.max(0, Math.min(startedStanding, physics.knockedCount(scene.simulation)));
    scene.pins = authority ? clonePins(authority.roll.pinsAfter) : scene.simulation.pins;
    resultsScreen.showCallout(knocked, startedStanding);
    if (knocked > 0) renderer.shake = Math.min(12, 3 + knocked);

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
      if (scene.ballZ >= physics.PHYSICS_START_Z) {
        scene.ballZ = physics.PHYSICS_START_Z;
        scene.simulation = physics.createSimulation(scene.pins, scene.shot);
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
