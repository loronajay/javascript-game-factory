// The cabinet's shared mutable state, in one declared place.
//
// This used to be twenty loose `let` bindings in the game.js closure, which is
// why every new feature landed in that one file: there was no state to hand a
// module. Everything a screen, the HUD, the tick loop or the online session
// needs to read now lives here behind named accessors, so a module can be given
// exactly the session rather than the whole closure.
//
// Rules that keep this from becoming a god object:
//   - No DOM. Nothing here touches an element.
//   - No rendering, no network, no audio.
//   - Derived questions ("can this player adjust their shot?") live here only
//     when more than one caller asks them.

export function defaultShot() {
  return {
    position: 0,
    aim: 0.1,
    hook: -0.1,
    hookScale: 1,
    speedScale: 1,
    massScale: 1,
    ballIndex: 0,
    power: 0.78,
  };
}

export function createSessionState({ physics, animation, effects, storedSkinId, localClientId }) {
  const session = {
    // --- Match configuration, owned by the setup screens ---
    setup: {
      modeId: "quick",
      playType: "cpu",
      cpuLevelId: "casual",
      activeSlot: 0,
      characterSlugs: ["daisy-monroe", "nia-brooks"],
      skinIds: [storedSkinId("daisy-monroe"), storedSkinId("nia-brooks")],
    },
    onlineSetup: {
      modeId: "quick",
      // The stakes of the next online match. Casual by default on purpose: a
      // rating should be staked deliberately, and the cost of the wrong default
      // is asymmetric — an unrecorded ranked match can be bowled again, an
      // accidental ranked loss is somebody else's ladder.
      ranked: false,
      characterSlug: "daisy-monroe",
      skinId: storedSkinId("daisy-monroe"),
      intent: null,
    },

    // --- The live deck ---
    scene: {
      phase: "ready",
      pins: physics.createRack(),
      simulation: null,
      liveShot: defaultShot(),
      shot: null,
      ballZ: 0,
      gutterSide: 0,
      throwElapsed: 0,
      spinElapsed: 0,
      spinLevel: 0,
      chargeElapsed: 0,
      chargeLevel: 0,
      chargeState: null,
    },

    // --- Match progress ---
    match: null,
    matchFacts: { rolls: [] },
    // Present only while a sanctioned single-player circuit match is active.
    // The campaign domain owns its meaning; the match runtime only uses the
    // declared venue and opponent presentation.
    campaignMatch: null,
    tournamentMatch: null,
    // Set only while the coached first frame is being bowled. It marks a match
    // as a lesson; nothing about the shot, the scoring or the deck changes.
    tutorialMatch: false,
    playerShots: [],
    contactedPinCount: 0,
    paused: false,
    matchLaneSlug: "",

    // --- Equipped visual effects: particles only, never gameplay ---
    // Advanced by the tick loop and painted by the renderer. Nothing in here
    // is ever read back into a shot, a score or an online message.
    effects: effects.createEffectsState(),

    // --- Presentation timers, counted down by the tick loop ---
    calloutTime: 0,
    bannerTime: 0,
    cpuDelay: 0,
    transitionTime: 0,

    // --- Online authority ---
    onlineMatch: false,
    onlineSnapshot: null,
    pendingAuthoritativeRoll: null,
    lastAppliedOnlineRoll: 0,
    reportedRatingSessionId: "",

    activePlayer() {
      return session.match?.players[session.match.activePlayer] || null;
    },

    frameRollNumber() {
      if (!session.match) return 1;
      const player = session.match.players[session.match.activePlayer];
      return player.frames[session.match.frameIndex].length + 1;
    },

    // A local match is always the local player's turn; an online match is only
    // theirs when the server says the active seat is this client.
    isLocalOnlineTurn() {
      return !session.onlineMatch || session.activePlayer()?.id === localClientId();
    },

    canAdjustShot() {
      return Boolean(
        session.match
        && session.match.status === "playing"
        && session.scene.phase === "ready"
        && session.activePlayer()?.type === "human"
        && session.isLocalOnlineTurn()
        && !session.paused,
      );
    },

    // The local player's own equipped skin wins for their own bowler; a remote
    // look is normalized before it can reach an asset path.
    playerSkinId(player) {
      if (session.onlineMatch && player?.id === localClientId()) return session.onlineSetup.skinId;
      if (player?.skinId) return animation.normalizeSkinId(player.skinId);
      return animation.DEFAULT_SKIN_ID;
    },

    // Both a fresh local match and a served online match reset the deck the same
    // way; only the pins they start from differ.
    resetScene(pins) {
      Object.assign(session.scene, {
        phase: "ready",
        pins,
        simulation: null,
        ballZ: 0,
        gutterSide: 0,
        throwElapsed: 0,
        spinElapsed: 0,
        spinLevel: 0,
        chargeElapsed: 0,
        chargeLevel: 0,
        chargeState: null,
      });
      session.playerShots = [defaultShot(), defaultShot()];
      session.contactedPinCount = 0;
      // Live particles belong to the deck that is being replaced. The fired-roll
      // key deliberately survives, so a resumed online match cannot re-fire a
      // burst it has already shown.
      effects.resetEffects(session.effects);
      session.transitionTime = 0;
      session.bannerTime = 1.15;
      session.paused = false;
    },
  };

  return session;
}
