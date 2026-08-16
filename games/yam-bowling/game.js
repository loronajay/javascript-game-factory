import { loadFactoryProfile } from "../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../js/platform/identity/match-identity.mjs";
import { createPlatformApiClient } from "../../js/platform/api/platform-api.mjs";
import { createYamAccountAccess } from "./account-access.mjs";
import { createCampaignProgressClient } from "./campaign-progress-client.mjs";
import { createProfileSyncClient } from "./profile/profile-sync-client.mjs";
import { createVoucherClient } from "./profile/voucher-client.mjs";
import { createAchievementClient } from "./profile/achievement-client.mjs";
import { createPublicProfileClient } from "./profile/public-profile-client.mjs";
import { createPublicProfileRepository } from "./profile/public-profile-repository.mjs";
import { createOnlineClient, normalizeRoomCode } from "./online-client.mjs";
import { initMobileLandscapeGate } from "./mobile-ui.mjs";
import { $, showScreen } from "./ui/dom.mjs";
import { createCharacterAssets } from "./ui/character-assets.mjs";
import { createMenuSplashPicker } from "./ui/menu-splash-picker.mjs";
import { createLanePicker } from "./ui/lane-picker.mjs";
import { createCharacterInspector } from "./ui/character-inspector.mjs";
import { createSetupScreen } from "./ui/setup-screen.mjs";
import { createOnlineScreen } from "./ui/online-screen.mjs";
import { createCircuitScreen } from "./ui/circuit-screen.mjs";
import { createProfileScreen } from "./ui/profile-screen.mjs";
import { createPublicProfileScreen } from "./ui/public-profile-screen.mjs";
import { createShotHud } from "./ui/shot-hud.mjs";
import { createScoreboard } from "./ui/scoreboard.mjs";
import { createResultsScreen } from "./ui/results-screen.mjs";
import { createSessionState } from "./state/session-state.mjs";
import { createMatchRuntime } from "./match/match-runtime.mjs";
import { createOnlineSession } from "./online/online-session.mjs";
import { createProgressionReporter } from "./online/progression-reporter.mjs";
import { createMasteryCelebrationQueue } from "./state/mastery-celebrations.mjs";
import { createPlayerLevelCelebrationQueue } from "./state/player-level-celebrations.mjs";
import { createProgressionCelebrationPresenter } from "./ui/progression-celebration.mjs";
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
  const Cosmetics = window.YamCosmetics;
  const LoadoutCore = window.YamLoadout;
  const ProgressionCore = window.YamProgression;
  const MasteryRewards = window.YamMasteryRewards;
  const PlayerRewards = window.YamPlayerRewards;
  const AchievementCore = window.YamAchievementCore;
  const Campaign = window.YamCampaign;
  const Effects = window.YamEffects;
  const Catalog = window.YamCharacterCatalog;
  const Roster = Animation.CANON_BOWLERS;
  const BALLS = BallCore.BALLS;
  const TICK_MS = 1000 / 60;
  const PHYSICS_DT = 1 / 180;

  const renderer = new window.YamBowlingRenderer($("game-canvas"));
  const audio = AudioCore.createAudioDirector();
  const factoryProfile = loadFactoryProfile();
  const onlineIdentity = createOnlineIdentityPayload(factoryProfile);
  const platformApi = createPlatformApiClient();
  const accountAccess = createYamAccountAccess();
  const onlineClient = createOnlineClient();
  const campaignStore = Campaign.createCampaignStore();
  // What this device owns and wears. Every cosmetic read goes through it, so
  // equipment has one owner and one migration off the old preference keys.
  const loadout = LoadoutCore.createLoadoutStore({ campaign: campaignStore });
  // The device-local cache of an authoritative balance. It never awards itself
  // XP; only a server snapshot moves a number in it.
  const progression = ProgressionCore.createProgressionStore();
  const progressionCelebration = createProgressionCelebrationPresenter({
    masteryQueue: createMasteryCelebrationQueue({ rewards: MasteryRewards }),
    playerQueue: createPlayerLevelCelebrationQueue({ rewards: PlayerRewards }),
    playerId: factoryProfile.playerId,
    progression,
    roster: Roster,
    loadout,
    audio,
  });
  let profileScreen = null;
  const voucherClient = createVoucherClient({ platformApi, loadout });
  const assets = createCharacterAssets({ animation: Animation, roster: Roster, loadout });
  const progressionReporter = createProgressionReporter({
    progressionCore: ProgressionCore,
    store: progression,
    platformApi,
    onSnapshotApplied: () => {
      applyLevelUnlocks();
      profileScreen?.refresh();
      progressionCelebration.observe();
    },
  });

  const session = createSessionState({
    physics: Physics,
    animation: Animation,
    effects: Effects,
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

  // The equipped effects, resolved per read rather than captured once, so a
  // change in the loadout applies to the next roll without a reload. Reduced
  // motion is asked of the browser the same way, so a preference change during
  // a session is honored too.
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  const effectsConfig = () => ({
    trailStyle: Effects.styleForItem(Cosmetics.getItem(loadout.getGlobalSlot("ballTrail"))),
    burstStyle: Effects.styleForItem(Cosmetics.getItem(loadout.getGlobalSlot("strikeBurst"))),
    reducedMotion: Boolean(prefersReducedMotion?.matches),
  });

  const menuSplashPicker = createMenuSplashPicker({ menuSplash: MenuSplash, loadout, audio });

  // A level-earned reward is proved by the level itself, so the owned set is
  // recomputed from each authoritative snapshot rather than granted once and
  // stored. Both sync paths share this one definition for the same reason
  // `applyMatchLane` does: two callers must never be able to disagree about what
  // the account has unlocked. An unsynced device earns nothing -- a cached level
  // is not evidence.
  function applyLevelUnlocks() {
    if (progression.getSyncState().stale) {
      loadout.clearLevelEntitlements();
      return;
    }
    loadout.applyLevelEntitlements([
      ...PlayerRewards.earnedItemIds({ currentLevel: progression.getPlayer().level }),
      ...progression.listBowlers().flatMap((bowler) => MasteryRewards.earnedItemIds({
        character: bowler,
        currentLevel: bowler.level,
      })),
    ]);
  }
  const campaignProgress = createCampaignProgressClient({
    campaignStore,
    progressionCore: ProgressionCore,
    progressionStore: progression,
    platformApi,
    onSnapshotApplied: (snapshot) => {
      loadout.applyServerEntitlements(snapshot?.entitlements || []);
      voucherClient.applyProgress(snapshot);
      applyLevelUnlocks();
      menuSplashPicker.refresh();
      profileScreen?.refresh();
      progressionCelebration.observe();
    },
  });
  const profileSync = createProfileSyncClient({
    platformApi,
    playerId: factoryProfile.playerId,
    loadout,
    progressionCore: ProgressionCore,
    progressionStore: progression,
    onGameProgress: (snapshot) => voucherClient.applyProgress(snapshot),
    onSnapshotApplied: () => {
      applyLevelUnlocks();
      menuSplashPicker.refresh();
      profileScreen?.refresh();
      progressionCelebration.observe();
    },
  });
  profileScreen = createProfileScreen({
    profileName: factoryProfile.profileName,
    loadout,
    progression,
    animation: Animation,
    roomCore: window.YamRoomCore,
    cosmetics: Cosmetics,
    playerRewards: PlayerRewards,
    syncClient: profileSync,
    voucherClient,
    audio,
  });
  const publicProfiles = createPublicProfileRepository({
    client: createPublicProfileClient({ platformApi }),
    animation: Animation,
    roomCore: window.YamRoomCore,
  });
  const publicProfileScreen = createPublicProfileScreen({ repository: publicProfiles, audio });
  const lanePicker = createLanePicker({ laneCore: LaneCore, audio, onPreview: applyMatchLane });
  session.matchLaneSlug = lanePicker.getSelectedSlug();

  const characterInspector = createCharacterInspector({
    animation: Animation,
    catalog: Catalog,
    cosmetics: Cosmetics,
    assets,
    loadout,
    progression,
    masteryRewards: MasteryRewards,
    historyStatus: () => {
      if (!accountAccess.isEligible()) return "signed-out";
      const syncState = profileSync.getState();
      if (syncState.progressionStatus === "ready") return "ready";
      return ["idle", "syncing"].includes(syncState.status) ? "syncing" : "unavailable";
    },
    audio,
    initialSlug: Roster[0].slug,
  });
  const openInspector = (slug, focusTarget) => characterInspector.open(slug, focusTarget);

  const setupScreen = createSetupScreen({
    session, roster: Roster, animation: Animation, assets, loadout, onInspect: openInspector,
  });
  const shotHud = createShotHud({ session, balls: BALLS, ballCore: BallCore });

  // Declared ahead of the modules that call into them so the wiring below can
  // close over them; both are assigned before any event or frame can fire.
  let onlineSession = null;
  let matchRuntime = null;
  let circuitScreen = null;
  let achievementClient = null;

  const resultsScreen = createResultsScreen({
    session,
    core: Core,
    assets,
    audio,
    audioCore: AudioCore,
    cosmetics: Cosmetics,
    localClientId: () => onlineClient.getSnapshot().clientId,
    onOpenProfile: (playerId, profileName, focusTarget) => publicProfileScreen.open(playerId, profileName, focusTarget),
    onShown: () => {
      circuitScreen?.handleResultsShown();
      onlineSession?.reportResult();
      const localPlayerId = session.onlineMatch ? onlineClient.getSnapshot().clientId : "p1";
      achievementClient?.handleFinishedMatch({
        match: session.onlineMatch ? { ...session.match, playType: "online" } : session.match,
        localPlayerId,
        rolls: session.matchFacts.rolls,
      }).catch(() => {});
    },
  });
  achievementClient = createAchievementClient({
    achievementCore: AchievementCore,
    platformApi,
    loadout,
    onEarned: (achievementIds) => resultsScreen.showAchievements(achievementIds),
    onSnapshotApplied: () => {
      menuSplashPicker.refresh();
      profileScreen?.refresh();
    },
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
    loadout,
    onlineIdentity,
    normalizeRoomCode,
    publicProfiles,
    onOpenProfile: (playerId, profileName, focusTarget) => publicProfileScreen.open(playerId, profileName, focusTarget),
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
    audioCore: AudioCore,
    effects: Effects,
    effectsConfig,
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

  circuitScreen = createCircuitScreen({
    session,
    campaign: Campaign,
    store: campaignStore,
    assets,
    laneCore: LaneCore,
    audio,
    getMatchRuntime: () => matchRuntime,
    accountAccess,
    campaignProgress,
  });

  onlineSession = createOnlineSession({
    session,
    onlineClient,
    onlineIdentity,
    platformApi,
    progressionReporter,
    laneCore: LaneCore,
    matchRuntime,
    onlineScreen,
    scoreboard,
    resultsScreen,
    shotHud,
    audio,
    applyMatchLane,
    normalizeRoomCode,
    accountAccess,
    getOwnedSkinId: assets.storedSkinId,
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
    if (session.match && !$("game-screen").hidden) renderer.render(session.scene, session.effects);
    requestAnimationFrame(loop);
  }

  async function init() {
    menuSplashPicker.build();
    progressionCelebration.bind();
    accountAccess.syncControls();
    accountAccess.bindSessionChanges(document, () => {
      loadout.clearServerAuthority();
      onlineSession.leaveToTitle();
      circuitScreen.leaveToTitle();
      profileScreen.leaveToTitle();
    });
    if (accountAccess.isEligible()) {
      await campaignProgress.sync();
      await profileSync.sync();
      // A finished match whose report never reached the server is filed on the
      // first boot that has a connection again, rather than waiting for the
      // next match to notice it.
      onlineSession.flushPendingReports().catch(() => {});
    }
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
    circuitScreen.bind();
    profileScreen.bind();
    publicProfileScreen.bind();
    bindEvents({
      session, keys, audio, renderer, matchRuntime, onlineSession,
      circuitScreen, profileScreen, setupScreen, onlineScreen, shotHud, syncAudioToggle, accountAccess,
    });

    if (accountAccess.isEligible() && onlineClient.resumeSavedSession()) {
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
