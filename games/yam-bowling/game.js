import { loadFactoryProfile } from "../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../js/platform/identity/match-identity.mjs";
import { createPlatformApiClient } from "../../js/platform/api/platform-api.mjs";
import { createOnlineClient, normalizeRoomCode } from "./online-client.mjs";
import { initMobileLandscapeGate } from "./mobile-ui.mjs";
import { $, showScreen } from "./ui/dom.mjs";
import { createCharacterAssets } from "./ui/character-assets.mjs";
import { createMenuSplashPicker } from "./ui/menu-splash-picker.mjs";
import { createLanePicker } from "./ui/lane-picker.mjs";
import { createCharacterInspector } from "./ui/character-inspector.mjs";
import { createSetupScreen } from "./ui/setup-screen.mjs";
import { createOnlineScreen } from "./ui/online-screen.mjs";
import { createShotHud } from "./ui/shot-hud.mjs";
import { createScoreboard } from "./ui/scoreboard.mjs";
import { createResultsScreen } from "./ui/results-screen.mjs";
import { createSessionState } from "./state/session-state.mjs";
import { createMatchRuntime } from "./match/match-runtime.mjs";
import { createOnlineSession } from "./online/online-session.mjs";
import { bindEvents, createHeldKeys } from "./input/bindings.mjs";

initMobileLandscapeGate();

// Composition root. This file wires the cabinet together and runs the frame
// loop; it owns no game logic, no rendering and no screen markup of its own.
// Anything longer than a wiring line here belongs in one of the modules below.
(function startYamBowling() {
  "use strict";

  // The `*-core.js` modules are classic scripts loaded ahead of this one, so
  // they arrive on `window` rather than through an import.
  const Core = window.YamGameCore;
  const Physics = window.YamPhysics;
  const BallCore = window.YamBallCore;
  const Cpu = window.YamCpuPlanner;
  const AudioCore = window.YamAudio;
  const MenuSplash = window.YamMenuSplash;
  const LaneCore = window.YamLaneCore;
  const Animation = window.YamBowlingCore;
  const Catalog = window.YamCharacterCatalog;
  const Roster = Animation.CANON_BOWLERS;
  const BALLS = BallCore.BALLS;
  const TICK_MS = 1000 / 60;
  const PHYSICS_DT = 1 / 180;

  const renderer = new window.YamBowlingRenderer($("game-canvas"));
  const audio = AudioCore.createAudioDirector();
  const onlineIdentity = createOnlineIdentityPayload(loadFactoryProfile());
  const platformApi = createPlatformApiClient();
  const onlineClient = createOnlineClient();
  const assets = createCharacterAssets({ animation: Animation, roster: Roster });

  const session = createSessionState({
    physics: Physics,
    animation: Animation,
    storedSkinId: assets.storedSkinId,
    localClientId: () => onlineClient.getSnapshot().clientId,
  });

  // One seam decides the house a match is bowled in: local play uses the saved
  // pick, online play uses the lane the server dealt both bowlers.
  // Never gate this on renderer.ready: a resumed online match can be served its
  // lane while boot art is still loading, and skipping the request there would
  // leave the screen on a lane the scoreboard no longer claims. The renderer
  // already drops a redundant request for the lane it is on or fetching.
  function applyMatchLane(slug) {
    session.matchLaneSlug = LaneCore.getLane(slug).slug;
    renderer.setLane(session.matchLaneSlug).catch((error) => console.error(error));
  }

  const menuSplashPicker = createMenuSplashPicker({ menuSplash: MenuSplash, audio });
  const lanePicker = createLanePicker({ laneCore: LaneCore, audio, onPreview: applyMatchLane });
  session.matchLaneSlug = lanePicker.getSelectedSlug();

  const characterInspector = createCharacterInspector({
    animation: Animation,
    catalog: Catalog,
    assets,
    audio,
    initialSlug: Roster[0].slug,
  });
  const openInspector = (slug, focusTarget) => characterInspector.open(slug, focusTarget);

  const setupScreen = createSetupScreen({
    session, roster: Roster, animation: Animation, assets, onInspect: openInspector,
  });
  const shotHud = createShotHud({ session, balls: BALLS, ballCore: BallCore });

  // Declared ahead of the modules that call into them so the wiring below can
  // close over them; both are assigned before any event or frame can fire.
  let onlineSession = null;
  let matchRuntime = null;

  const resultsScreen = createResultsScreen({
    session,
    core: Core,
    assets,
    audio,
    audioCore: AudioCore,
    onShown: () => onlineSession?.reportResult(),
  });
  const scoreboard = createScoreboard({
    session,
    core: Core,
    laneCore: LaneCore,
    shotHud,
    onCalloutHidden: () => resultsScreen.hideCalloutPose(),
  });
  const onlineScreen = createOnlineScreen({
    session,
    roster: Roster,
    animation: Animation,
    assets,
    onlineIdentity,
    normalizeRoomCode,
    onInspect: openInspector,
    onBegin: (intent) => onlineSession.begin(intent),
    onLeave: () => onlineSession.leave(),
  });

  matchRuntime = createMatchRuntime({
    session,
    core: Core,
    physics: Physics,
    cpu: Cpu,
    balls: BALLS,
    audio,
    renderer,
    assets,
    shotHud,
    scoreboard,
    resultsScreen,
    onlineClient,
    applyMatchLane,
    getLocalLaneSlug: () => lanePicker.getSelectedSlug(),
    physicsStep: PHYSICS_DT,
  });

  onlineSession = createOnlineSession({
    session,
    onlineClient,
    onlineIdentity,
    platformApi,
    laneCore: LaneCore,
    matchRuntime,
    onlineScreen,
    scoreboard,
    resultsScreen,
    shotHud,
    audio,
    applyMatchLane,
    normalizeRoomCode,
  });

  function syncAudioToggle() {
    const toggle = $("audio-toggle");
    toggle.setAttribute("aria-pressed", String(audio.enabled));
    toggle.setAttribute("aria-label", audio.enabled ? "Mute music and sound" : "Turn on music and sound");
    toggle.title = audio.enabled ? "Mute music and sound" : "Turn on music and sound";
    toggle.querySelector(".audio-toggle__icon").textContent = audio.enabled ? "♫" : "×";
    toggle.querySelector(".audio-toggle__label").textContent = audio.enabled ? "Sound on" : "Sound off";
  }

  // Fixed-timestep accumulator: game logic runs at exactly 60 ticks/s whatever
  // the display refresh rate is, so a 144Hz monitor does not bowl faster.
  const keys = createHeldKeys();
  let lastTimestamp = null;
  let accumulator = 0;

  function loop(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    accumulator += Math.min(100, timestamp - lastTimestamp);
    lastTimestamp = timestamp;
    while (accumulator >= TICK_MS) {
      matchRuntime.tick(TICK_MS / 1000, keys);
      accumulator -= TICK_MS;
    }
    renderer.ctx.imageSmoothingEnabled = false;
    if (session.match && !$("game-screen").hidden) renderer.render(session.scene);
    requestAnimationFrame(loop);
  }

  async function init() {
    menuSplashPicker.build();
    lanePicker.build();
    setupScreen.build();
    onlineScreen.build();
    shotHud.buildBallRack((index) => matchRuntime.selectBall(index));
    Cpu.warmCpuPlanner({ pins: Physics.createRack(), balls: BALLS });

    setupScreen.render();
    onlineScreen.renderSetup();
    onlineClient.subscribe((snapshot) => onlineSession.handleSnapshot(snapshot));
    syncAudioToggle();

    characterInspector.bind();
    setupScreen.bind();
    onlineScreen.bind();
    bindEvents({
      session, keys, audio, renderer, matchRuntime, onlineSession,
      setupScreen, onlineScreen, shotHud, syncAudioToggle,
    });

    if (onlineClient.resumeSavedSession()) {
      showScreen("online-lobby-screen");
      onlineScreen.renderLobby(onlineClient.getSnapshot());
    }

    // The start button stays disabled until the lane art is on screen, so a
    // match cannot begin against an empty backdrop.
    $("start-match").disabled = true;
    $("start-match").textContent = "Loading lane…";
    try {
      await renderer.load(lanePicker.getSelectedSlug());
      $("start-match").disabled = false;
      $("start-match").textContent = "Start match";
    } catch (error) {
      console.error(error);
      $("start-match").textContent = "Lane failed to load";
    }
    requestAnimationFrame(loop);
  }

  init();
})();
