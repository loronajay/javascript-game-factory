import { loadFactoryProfile } from "../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../js/platform/identity/match-identity.mjs";
import { createPlatformApiClient } from "../../js/platform/api/platform-api.mjs";
import { createOnlineClient, normalizeRoomCode } from "./online-client.mjs";
import { initMobileLandscapeGate } from "./mobile-ui.mjs";

initMobileLandscapeGate();

(function startYamBowling() {
  "use strict";

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
  const TICK_MS = 1000 / 60;
  const PHYSICS_DT = 1 / 180;
  const BALLS = BallCore.BALLS;
  const storedSkinId = (slug) => Animation.getEquippedSkinId(
    Roster.find((bowler) => bowler.slug === slug) || Roster[0],
  );

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
  const canvas = $("game-canvas");
  const renderer = new window.YamBowlingRenderer(canvas);
  const audio = AudioCore.createAudioDirector();
  const factoryProfile = loadFactoryProfile();
  const onlineIdentity = createOnlineIdentityPayload(factoryProfile);
  const platformApi = createPlatformApiClient();
  const onlineClient = createOnlineClient();
  const setup = {
    modeId: "quick",
    playType: "cpu",
    cpuLevelId: "casual",
    activeSlot: 0,
    characterSlugs: ["daisy-monroe", "nia-brooks"],
    skinIds: [storedSkinId("daisy-monroe"), storedSkinId("nia-brooks")],
  };
  const onlineSetup = {
    modeId: "quick",
    characterSlug: "daisy-monroe",
    skinId: storedSkinId("daisy-monroe"),
    intent: null,
  };

  let match = null;
  let onlineMatch = false;
  let onlineSnapshot = null;
  let pendingAuthoritativeRoll = null;
  let lastAppliedOnlineRoll = 0;
  let reportedRatingSessionId = "";
  let paused = false;
  let calloutTime = 0;
  let bannerTime = 0;
  let cpuDelay = 0;
  let transitionTime = 0;
  let lastTimestamp = null;
  let accumulator = 0;
  let playerShots = [];
  let contactedPinCount = 0;
  let selectedMenuSplashSlug = MenuSplash.loadMenuSplashSlug();
  let selectedLaneSlug = LaneCore.loadLaneSlug();
  let matchLaneSlug = selectedLaneSlug;
  let inspectorSlug = Roster[0].slug;
  let inspectorPreviewSkinId = Animation.DEFAULT_SKIN_ID;
  let inspectorReturnFocus = null;

  const scene = {
    phase: "ready",
    pins: Physics.createRack(),
    simulation: null,
    liveShot: { position: 0, aim: 0.1, hook: -0.1, hookScale: 1, speedScale: 1, massScale: 1, ballIndex: 0, power: 0.78 },
    shot: null,
    ballZ: 0,
    throwElapsed: 0,
    spinElapsed: 0,
    spinLevel: 0,
    chargeElapsed: 0,
    chargeLevel: 0,
    chargeState: null,
  };

  function defaultShot() {
    return { position: 0, aim: 0.1, hook: -0.1, hookScale: 1, speedScale: 1, massScale: 1, ballIndex: 0, power: 0.78 };
  }

  function bowlerBySlug(slug) {
    return Roster.find((bowler) => bowler.slug === slug) || Roster[0];
  }

  function characterFrame(slug, frame = 1, skinId = Animation.DEFAULT_SKIN_ID) {
    return Animation.getFrameAssetPath({ slug }, frame, skinId);
  }

  function characterPortrait(slug, skinId = Animation.DEFAULT_SKIN_ID) {
    return Animation.getPortraitAssetPath({ slug }, skinId);
  }

  function resultPortrait(slug, outcome, skinId = Animation.DEFAULT_SKIN_ID) {
    return Animation.getResultPortraitAssetPath({ slug }, outcome, skinId);
  }

  function calloutPose(slug, outcomeCue, skinId = Animation.DEFAULT_SKIN_ID) {
    return Animation.getCalloutPoseAssetPath({ slug }, outcomeCue, skinId);
  }

  function playerSkinId(player) {
    if (onlineMatch && player?.id === onlineClient.getSnapshot().clientId) return onlineSetup.skinId;
    if (player?.skinId) return Animation.normalizeSkinId(player.skinId);
    return Animation.DEFAULT_SKIN_ID;
  }

  function applyMenuSplash(slug, persist = false) {
    selectedMenuSplashSlug = persist
      ? MenuSplash.saveMenuSplashSlug(slug)
      : MenuSplash.getMenuSplash(slug).slug;
    const splash = MenuSplash.getMenuSplash(selectedMenuSplashSlug);
    const art = $("menu-splash-art");
    art.src = splash.src;
    art.alt = splash.alt;
    $("menu-splash-button").title = `Current menu art: ${splash.name}`;

    for (const card of $("menu-splash-grid").querySelectorAll("[data-splash-slug]")) {
      const selected = card.dataset.splashSlug === selectedMenuSplashSlug;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-selected", String(selected));
    }
  }

  function buildMenuSplashGrid() {
    const grid = $("menu-splash-grid");
    for (const splash of MenuSplash.MENU_SPLASHES) {
      const card = document.createElement("button");
      card.className = "menu-splash-card";
      card.type = "button";
      card.setAttribute("data-splash-slug", splash.slug);
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${splash.thumbnailSrc}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(splash.name)}</span>`;
      card.addEventListener("click", () => {
        applyMenuSplash(splash.slug, true);
        $("menu-splash-dialog").close();
      });
      grid.appendChild(card);
    }
    applyMenuSplash(selectedMenuSplashSlug);
  }

  function applyLane(slug, persist = false) {
    selectedLaneSlug = persist ? LaneCore.saveLaneSlug(slug) : LaneCore.getLane(slug).slug;
    const lane = LaneCore.getLane(selectedLaneSlug);
    const art = $("lane-button-art");
    art.src = lane.thumbnailSrc;
    art.alt = "";
    $("lane-button-name").textContent = lane.name;
    $("lane-button-description").textContent = lane.description;
    $("lane-button").title = `Current lane: ${lane.name}`;

    for (const card of $("lane-grid").querySelectorAll("[data-lane-slug]")) {
      const selected = card.dataset.laneSlug === selectedLaneSlug;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-selected", String(selected));
    }

    // The backdrop swaps immediately so the picker reads as a live preview.
    applyMatchLane(selectedLaneSlug);
  }

  // One seam decides the house a match is bowled in: local play uses the saved
  // pick, online play uses the lane the server dealt both bowlers.
  // Never gate this on renderer.ready: a resumed online match can be served its
  // lane while boot art is still loading, and skipping the request there would
  // leave the screen on a lane the scoreboard no longer claims. The renderer
  // already drops a redundant request for the lane it is on or fetching.
  function applyMatchLane(slug) {
    matchLaneSlug = LaneCore.getLane(slug).slug;
    renderer.setLane(matchLaneSlug).catch((error) => console.error(error));
  }

  function buildLaneGrid() {
    const grid = $("lane-grid");
    for (const lane of LaneCore.LANES) {
      const card = document.createElement("button");
      card.className = "lane-card";
      card.type = "button";
      card.setAttribute("data-lane-slug", lane.slug);
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${lane.thumbnailSrc}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(lane.name)}</strong><small>${escapeHtml(lane.description)}</small></span>`;
      card.addEventListener("click", () => {
        applyLane(lane.slug, true);
        $("lane-dialog").close();
      });
      grid.appendChild(card);
    }
    applyLane(selectedLaneSlug);
  }

  function showScreen(id) {
    for (const screen of document.querySelectorAll(".screen")) {
      const active = screen.id === id;
      screen.hidden = !active;
      screen.classList.toggle("is-active", active);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  function setSelected(group, attribute, value) {
    for (const button of group.querySelectorAll(`[${attribute}]`)) {
      button.classList.toggle("is-selected", button.getAttribute(attribute) === value);
    }
  }

  function renderSkinOptions(containerId, slug, selectedSkinId, chooseSkin) {
    const host = $(containerId);
    host.innerHTML = "";
    const bowler = bowlerBySlug(slug);
    for (const skin of Animation.AVAILABLE_SKINS) {
      const button = document.createElement("button");
      button.className = `skin-option${skin.id === selectedSkinId ? " is-selected" : ""}`;
      button.type = "button";
      button.dataset.skinId = skin.id;
      button.setAttribute("aria-pressed", String(skin.id === selectedSkinId));
      button.innerHTML = `<img src="${characterPortrait(slug, skin.id)}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(skin.name)}</strong><small>${skin.id === selectedSkinId ? "Equipped" : "Equip"}</small></span>`;
      button.addEventListener("click", () => {
        const equipped = Animation.saveEquippedSkinId(bowler, skin.id);
        chooseSkin(equipped);
      });
      host.appendChild(button);
    }
  }

  function renderInspectorSkinOptions() {
    const host = $("character-inspector-skins");
    const equippedSkinId = storedSkinId(inspectorSlug);
    host.innerHTML = "";
    for (const skin of Animation.AVAILABLE_SKINS) {
      const previewing = skin.id === inspectorPreviewSkinId;
      const equipped = skin.id === equippedSkinId;
      const button = document.createElement("button");
      button.className = `character-inspector-skin${previewing ? " is-previewed" : ""}${equipped ? " is-equipped" : ""}`;
      button.type = "button";
      button.dataset.inspectorSkinId = skin.id;
      button.setAttribute("aria-pressed", String(previewing));
      button.innerHTML = `<img src="${characterPortrait(inspectorSlug, skin.id)}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(skin.name)}</strong><small>${escapeHtml(Catalog.getSkinPreviewLabel(skin.id, inspectorPreviewSkinId, equippedSkinId))}</small></span>`;
      button.addEventListener("click", () => {
        inspectorPreviewSkinId = skin.id;
        renderCharacterInspector();
      });
      host.appendChild(button);
    }
  }

  function renderCharacterInspector() {
    const character = Catalog.getCharacter(inspectorSlug);
    const skin = Animation.AVAILABLE_SKINS.find(({ id }) => id === inspectorPreviewSkinId) || Animation.AVAILABLE_SKINS[0];
    const art = $("character-inspector-art");
    art.src = characterPortrait(character.slug, skin.id);
    art.alt = `Front view of ${character.name} wearing the ${skin.name} outfit`;
    $("character-inspector-name").textContent = character.name;
    $("character-inspector-age").textContent = character.age;
    $("character-inspector-hometown").textContent = character.hometown;
    $("character-inspector-occupation").textContent = character.occupation;
    $("character-inspector-style").textContent = character.bowlingStyle;
    $("character-inspector-ball").textContent = character.favoriteBall;
    $("character-inspector-personality").textContent = character.personality;
    $("character-inspector-bio").textContent = character.bio;
    renderInspectorSkinOptions();
  }

  function showAdjacentInspectorCharacter(direction) {
    inspectorSlug = Catalog.getAdjacentCharacterSlug(inspectorSlug, direction);
    inspectorPreviewSkinId = storedSkinId(inspectorSlug);
    renderCharacterInspector();
  }

  function openCharacterInspector(slug, returnFocus = document.activeElement) {
    inspectorSlug = bowlerBySlug(slug).slug;
    inspectorPreviewSkinId = storedSkinId(inspectorSlug);
    inspectorReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : null;
    renderCharacterInspector();
    const dialog = $("character-inspector-dialog");
    if (!dialog.open) dialog.showModal();
    $("character-inspector-close").focus();
    audio.play("popup");
  }

  function closeCharacterInspector() {
    const dialog = $("character-inspector-dialog");
    if (dialog.open) dialog.close();
  }

  function renderSetup() {
    setSelected($("mode-options"), "data-mode", setup.modeId);
    setSelected($("play-type-options"), "data-play-type", setup.playType);
    setSelected($("cpu-options"), "data-cpu-level", setup.cpuLevelId);
    $("cpu-options").hidden = setup.playType !== "cpu";
    $("player-two-label").textContent = setup.playType === "cpu" ? "CPU" : "Player 2";
    $("player-two-badge").textContent = setup.playType === "cpu" ? "CPU" : "P2";
    $("selecting-label").textContent = `Choosing ${setup.activeSlot === 0 ? "Player 1" : setup.playType === "cpu" ? "CPU rival" : "Player 2"}`;

    setup.characterSlugs.forEach((slug, index) => {
      const bowler = bowlerBySlug(slug);
      const slot = index === 0 ? $("player-one-slot") : $("player-two-slot");
      slot.classList.toggle("is-active", setup.activeSlot === index);
      slot.querySelector("img").src = characterPortrait(slug, setup.skinIds[index]);
      slot.querySelector("strong").textContent = bowler.name;
    });

    renderSkinOptions(
      "skin-options",
      setup.characterSlugs[setup.activeSlot],
      setup.skinIds[setup.activeSlot],
      (skinId) => {
        setup.skinIds[setup.activeSlot] = skinId;
        renderSetup();
      },
    );
    $("inspect-bowler-button").textContent = `Inspect ${bowlerBySlug(setup.characterSlugs[setup.activeSlot]).name}`;

    for (const card of $("character-grid").querySelectorAll(".character-card")) {
      card.classList.toggle("is-selected", card.dataset.slug === setup.characterSlugs[setup.activeSlot]);
      card.classList.toggle("is-p1", card.dataset.slug === setup.characterSlugs[0]);
      card.classList.toggle("is-p2", card.dataset.slug === setup.characterSlugs[1]);
      const labels = [];
      if (card.dataset.slug === setup.characterSlugs[0]) labels.push("P1");
      if (card.dataset.slug === setup.characterSlugs[1]) labels.push(setup.playType === "cpu" ? "CPU" : "P2");
      card.querySelector("i").textContent = labels.join(" · ");
      card.setAttribute("aria-selected", String(card.classList.contains("is-selected")));
    }
  }

  function buildCharacterGrid() {
    const grid = $("character-grid");
    for (const bowler of Roster) {
      const card = document.createElement("button");
      card.className = "character-card";
      card.type = "button";
      card.dataset.slug = bowler.slug;
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${characterPortrait(bowler.slug)}" alt="" loading="lazy"><span>${bowler.name}</span><i></i>`;
      card.addEventListener("click", () => {
        const other = setup.activeSlot === 0 ? 1 : 0;
        const previousSlug = setup.characterSlugs[setup.activeSlot];
        const previousSkinId = setup.skinIds[setup.activeSlot];
        if (setup.characterSlugs[other] === bowler.slug) {
          setup.characterSlugs[other] = previousSlug;
          setup.skinIds[other] = previousSkinId;
        }
        setup.characterSlugs[setup.activeSlot] = bowler.slug;
        setup.skinIds[setup.activeSlot] = storedSkinId(bowler.slug);
        renderSetup();
      });
      grid.appendChild(card);
    }
  }

  function buildOnlineCharacterGrid() {
    const grid = $("online-character-grid");
    for (const bowler of Roster) {
      const card = document.createElement("button");
      card.className = "character-card";
      card.type = "button";
      card.dataset.slug = bowler.slug;
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${characterPortrait(bowler.slug)}" alt="" loading="lazy"><span>${bowler.name}</span><i></i>`;
      card.addEventListener("click", () => {
        onlineSetup.characterSlug = bowler.slug;
        onlineSetup.skinId = storedSkinId(bowler.slug);
        renderOnlineSetup();
      });
      grid.appendChild(card);
    }
  }

  function renderOnlineSetup() {
    setSelected($("online-mode-options"), "data-online-mode", onlineSetup.modeId);
    const bowler = bowlerBySlug(onlineSetup.characterSlug);
    $("online-selected-bowler").textContent = bowler.name;
    $("online-account-name").textContent = onlineIdentity.displayName || "Player";
    for (const card of $("online-character-grid").querySelectorAll(".character-card")) {
      const selected = card.dataset.slug === onlineSetup.characterSlug;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-selected", String(selected));
    }
    renderSkinOptions(
      "online-skin-options",
      onlineSetup.characterSlug,
      onlineSetup.skinId,
      (skinId) => {
        onlineSetup.skinId = skinId;
        renderOnlineSetup();
      },
    );
    $("online-inspect-bowler-button").textContent = `Inspect ${bowler.name}`;
  }

  function onlinePlayerCards(snapshot) {
    const players = snapshot?.matchState?.match?.players || snapshot?.lobby?.players || [];
    if (!players.length) return [{ id: snapshot?.clientId || "local", name: onlineIdentity.displayName || "Player", characterSlug: onlineSetup.characterSlug, skinId: onlineSetup.skinId }];
    return players;
  }

  function renderOnlineLobby(snapshot = onlineClient.getSnapshot()) {
    const lobby = snapshot.lobby;
    const roomCode = lobby?.roomCode || snapshot.matchState?.roomCode || "";
    const privateRoom = lobby?.isPrivate === true || onlineSetup.intent === "private-create" || onlineSetup.intent === "private-join";
    $("online-lobby-kind").textContent = privateRoom ? "Private room" : "Quick match";
    $("online-lobby-title").textContent = roomCode ? (privateRoom ? "Room ready" : "Opponent search") : "Finding a lane";
    $("online-room-code-wrap").hidden = !roomCode || !privateRoom;
    $("online-room-code").textContent = roomCode || "-----";

    let status = "Connecting to Factory Network…";
    if (snapshot.status === "searching") status = "Searching for an opponent on the public lanes…";
    if (snapshot.status === "creating") status = "Opening your private lane…";
    if (snapshot.status === "joining") status = "Joining the private lane…";
    if (snapshot.status === "lobby") status = lobby?.playerCount >= 2 ? "Both bowlers are here. Starting match…" : "Waiting for the second bowler…";
    if (snapshot.status === "reconnecting") status = "Connection lost. Rejoining your lane…";
    if (snapshot.disconnectedClientId) status = "Opponent disconnected. Holding their lane for 30 seconds…";
    if (snapshot.error?.message) status = snapshot.error.message;
    $("online-status").textContent = status;
    $("online-status").classList.toggle("is-error", Boolean(snapshot.error && snapshot.error.code !== "CONNECTION_LOST"));
    $("online-menu-status").textContent = snapshot.error?.message || "Choose a bowler, then find a lane.";
    $("online-menu-status").classList.toggle("is-error", Boolean(snapshot.error));

    const host = $("online-lobby-players");
    host.innerHTML = "";
    const cards = onlinePlayerCards(snapshot);
    cards.forEach((player, index) => {
      const local = player.id === snapshot.clientId;
      // Remote looks arrive over the wire, so resolve them against the local
      // roster and skin catalog rather than trusting them into an asset path.
      const slug = bowlerBySlug(player.characterSlug || (local ? onlineSetup.characterSlug : (index === 0 ? "daisy-monroe" : "nia-brooks"))).slug;
      const skinId = Animation.normalizeSkinId(player.skinId || (local ? onlineSetup.skinId : Animation.DEFAULT_SKIN_ID));
      const card = document.createElement("article");
      card.className = `online-player-card${local ? " is-you" : ""}${player.connected === false ? " is-disconnected" : ""}`;
      card.innerHTML = `<img src="${characterPortrait(slug, skinId)}" alt=""><span><strong>${escapeHtml(player.name || `Player ${index + 1}`)}</strong><small>${player.connected === false ? "Reconnecting" : local ? "You · Ready" : "Ready"}</small></span>`;
      host.appendChild(card);
    });
    while (host.children.length < 2) {
      const waiting = document.createElement("article");
      waiting.className = "online-player-card";
      waiting.innerHTML = `<img src="${characterPortrait("nia-brooks")}" alt=""><span><strong>Open lane</strong><small>Waiting for player</small></span>`;
      host.appendChild(waiting);
    }
  }

  function beginOnline(intent) {
    onlineSetup.intent = intent;
    onlineClient.setIdentity(onlineIdentity);
    onlineClient.connect();
    showScreen("online-lobby-screen");
    renderOnlineLobby();
    const options = { modeId: onlineSetup.modeId, characterSlug: onlineSetup.characterSlug, skinId: onlineSetup.skinId };
    if (intent === "quick") onlineClient.findQuickMatch(options);
    if (intent === "private-create") onlineClient.createPrivateRoom(options);
    if (intent === "private-join") {
      const code = normalizeRoomCode($("join-room-code").value);
      if (!code) {
        showScreen("online-screen");
        $("online-menu-status").textContent = "Enter the private room code first.";
        $("online-menu-status").classList.add("is-error");
        return;
      }
      onlineClient.joinPrivateRoom(code, options);
    }
  }

  function buildBallRack() {
    const rack = $("ball-rack");
    BALLS.forEach((ball, index) => {
      const button = document.createElement("button");
      button.className = `ball-button${index === 0 ? " is-selected" : ""}`;
      button.type = "button";
      const profile = `${ball.name}, ${ball.archetype}: ${ball.description}`;
      button.title = profile;
      button.setAttribute("aria-label", profile);
      button.style.setProperty("--ball-a", ball.a);
      button.style.setProperty("--ball-b", ball.b);
      button.innerHTML = `<i aria-hidden="true"></i><span>${ball.name}</span>`;
      button.addEventListener("click", () => {
        if (!canAdjustShot()) return;
        scene.liveShot.ballIndex = index;
        applyBallProfile();
        renderBallProfile();
        rack.querySelectorAll(".ball-button").forEach((entry, i) => entry.classList.toggle("is-selected", i === index));
      });
      rack.appendChild(button);
    });
  }

  function renderBallProfile() {
    const ball = BALLS[scene.liveShot.ballIndex] || BALLS[0];
    $("ball-profile-name").textContent = ball.name;
    $("ball-profile-type").textContent = ball.archetype;
    $("ball-profile-description").textContent = ball.description;
    $("ball-profile-stats").innerHTML = BallCore.profileStats(ball)
      .map((stat) => `<div><dt>${stat.label}</dt><dd>${stat.value}</dd></div>`)
      .join("");
  }

  function createPlayers() {
    return [
      { id: "p1", name: "Player 1", characterSlug: setup.characterSlugs[0], skinId: setup.skinIds[0], type: "human" },
      {
        id: "p2",
        name: setup.playType === "cpu" ? Core.chooseCpuName() : "Player 2",
        characterSlug: setup.characterSlugs[1],
        skinId: setup.skinIds[1],
        type: setup.playType === "cpu" ? "cpu" : "human",
      },
    ];
  }

  function startMatch() {
    applyMatchLane(selectedLaneSlug);
    onlineMatch = false;
    onlineSnapshot = null;
    pendingAuthoritativeRoll = null;
    lastAppliedOnlineRoll = 0;
    reportedRatingSessionId = "";
    match = Core.createMatch({
      modeId: setup.modeId,
      playType: setup.playType,
      cpuLevelId: setup.cpuLevelId,
      players: createPlayers(),
    });
    paused = false;
    scene.phase = "ready";
    scene.pins = Physics.createRack();
    scene.simulation = null;
    scene.ballZ = 0;
    scene.throwElapsed = 0;
    scene.spinElapsed = 0;
    scene.spinLevel = 0;
    scene.chargeElapsed = 0;
    scene.chargeLevel = 0;
    scene.chargeState = null;
    resetChargeFeedback();
    resetSpinFeedback();
    playerShots = [defaultShot(), defaultShot()];
    contactedPinCount = 0;
    transitionTime = 0;
    cpuDelay = 0.8;
    bannerTime = 1.15;
    $("pause-overlay").hidden = true;
    $("restart-match-button").hidden = false;
    $("online-result-status").hidden = true;
    audio.resumeMusic();
    resetHumanShot();
    prepareActivePlayer();
    updateMatchUI();
    showScreen("game-screen");
  }

  function clonePins(pins) {
    return Array.isArray(pins) ? pins.map((pin) => ({ ...pin })) : Physics.createRack();
  }

  function resetSceneForOnline(snapshot) {
    // The server deals the house so both bowlers see one lane; a player's own
    // pick is a local-play preference and never travels into an online room.
    applyMatchLane(LaneCore.laneFromRoll(snapshot.laneRoll).slug);
    match = structuredClone(snapshot.match);
    onlineMatch = true;
    onlineSnapshot = snapshot;
    pendingAuthoritativeRoll = null;
    lastAppliedOnlineRoll = Number(snapshot.rollNumber) || 0;
    reportedRatingSessionId = "";
    paused = false;
    scene.phase = "ready";
    scene.pins = clonePins(snapshot.nextPins);
    scene.simulation = null;
    scene.ballZ = 0;
    scene.throwElapsed = 0;
    scene.spinElapsed = 0;
    scene.spinLevel = 0;
    scene.chargeElapsed = 0;
    scene.chargeLevel = 0;
    scene.chargeState = null;
    resetChargeFeedback();
    resetSpinFeedback();
    playerShots = [defaultShot(), defaultShot()];
    contactedPinCount = 0;
    transitionTime = 0;
    bannerTime = 1.15;
    $("pause-overlay").hidden = true;
    $("restart-match-button").hidden = true;
    $("online-result-status").hidden = true;
    audio.resumeMusic();
    prepareActivePlayer();
    updateMatchUI();
    showScreen("game-screen");
  }

  function applyOnlineSnapshotDirect(snapshot) {
    if (!snapshot?.match) return;
    match = structuredClone(snapshot.match);
    onlineSnapshot = snapshot;
    lastAppliedOnlineRoll = Math.max(lastAppliedOnlineRoll, Number(snapshot.rollNumber) || 0);
    scene.pins = clonePins(snapshot.nextPins);
    pendingAuthoritativeRoll = null;
    if (match.status === "complete") {
      showResults();
      return;
    }
    scene.phase = snapshot.phase === "paused" ? "network-paused" : "ready";
    prepareActivePlayer();
    updateMatchUI();
  }

  function playAuthoritativeRoll(snapshot) {
    const roll = snapshot?.lastRoll;
    if (!roll || Number(roll.rollNumber) <= lastAppliedOnlineRoll) {
      if (snapshot?.match && !pendingAuthoritativeRoll) applyOnlineSnapshotDirect(snapshot);
      return;
    }
    if (Number(pendingAuthoritativeRoll?.roll?.rollNumber) === Number(roll.rollNumber)) {
      return;
    }
    if (!match || $("game-screen").hidden) {
      resetSceneForOnline({ ...snapshot, rollNumber: Number(roll.rollNumber) - 1 });
    }
    onlineSnapshot = snapshot;
    pendingAuthoritativeRoll = { snapshot, roll };
    const shooterIndex = match.players.findIndex((player) => player.id === roll.shooterClientId);
    if (shooterIndex >= 0) match.activePlayer = shooterIndex;
    scene.pins = clonePins(roll.pinsBefore);
    Object.assign(scene.liveShot, roll.shot);
    scene.liveShot.ballIndex = roll.shot.ballIndex;
    applyBallProfile();
    prepareActivePlayer();
    Object.assign(scene.liveShot, roll.shot);
    scene.liveShot.ballIndex = roll.shot.ballIndex;
    applyBallProfile();
    syncControlsFromShot();
    beginThrow(roll.shot.power, { release: roll.shot.release });
  }

  function handleOnlineSnapshot(snapshot) {
    renderOnlineLobby(snapshot);
    if (
      snapshot.status === "lobby"
      && snapshot.lobby?.status === "open"
      && snapshot.lobby?.ownerId === snapshot.clientId
      && snapshot.lobby.playerCount >= 2
    ) {
      onlineClient.startLobby();
    }
    if (!snapshot.matchState) return;
    if (!onlineMatch || (onlineSnapshot?.sessionId && snapshot.matchState.sessionId !== onlineSnapshot.sessionId)) {
      resetSceneForOnline(snapshot.matchState);
      return;
    }
    playAuthoritativeRoll(snapshot.matchState);
  }

  function activePlayer() {
    return match?.players[match.activePlayer] || null;
  }

  function isLocalOnlineTurn() {
    return !onlineMatch || activePlayer()?.id === onlineClient.getSnapshot().clientId;
  }

  function prepareActivePlayer() {
    const player = activePlayer();
    if (!player) return;
    Object.assign(scene.liveShot, playerShots[match.activePlayer] || defaultShot());
    applyBallProfile();
    renderBallProfile();
    syncControlsFromShot();
    $("ball-rack").querySelectorAll(".ball-button").forEach((entry, index) => entry.classList.toggle("is-selected", index === scene.liveShot.ballIndex));
    renderer.setCharacter(player.characterSlug, playerSkinId(player)).catch(console.error);
    $("turn-avatar").src = characterPortrait(player.characterSlug, playerSkinId(player));
    preloadCalloutPoses(player);
    if (player.type === "cpu") cpuDelay = 0.8;
    bannerTime = 1;
    audio.play("announce");
  }

  function resetHumanShot() {
    scene.liveShot.position = 0;
    scene.liveShot.aim = 0.1;
    scene.liveShot.hook = -0.1;
    syncControlsFromShot();
  }

  function applyBallProfile() {
    const ball = BALLS[scene.liveShot.ballIndex] || BALLS[0];
    scene.liveShot.hookScale = ball.hookScale;
    scene.liveShot.speedScale = ball.speedScale;
    scene.liveShot.massScale = ball.massScale;
  }

  function syncControlsFromShot() {
    $("position-control").value = String(Math.round(scene.liveShot.position * 100));
    $("aim-control").value = String(Math.round(scene.liveShot.aim * 100));
    $("position-output").textContent = formatDirection(scene.liveShot.position);
    $("aim-output").textContent = formatDirection(scene.liveShot.aim);
  }

  function formatDirection(value, allowZero = false) {
    const amount = Math.round(Math.abs(value) * 100);
    if (amount === 0) return allowZero ? "0" : "C";
    return `${value < 0 ? "L" : "R"} ${amount}`;
  }

  function frameRollNumber() {
    if (!match) return 1;
    return match.players[match.activePlayer].frames[match.frameIndex].length + 1;
  }

  function updateScoreboard() {
    const board = $("scoreboard");
    board.innerHTML = "";
    const frameCount = Core.MODES[match.modeId].frames;
    match.players.forEach((player, playerIndex) => {
      const row = document.createElement("div");
      row.className = `score-row${match.status === "playing" && playerIndex === match.activePlayer ? " is-active" : ""}`;
      const label = document.createElement("div");
      label.className = "score-player";
      label.innerHTML = `<strong>${escapeHtml(player.name)}</strong><small>${player.type === "cpu" ? "CPU" : `P${playerIndex + 1}`}</small>`;
      const frames = document.createElement("div");
      frames.className = "score-frames";
      frames.style.setProperty("--frames", frameCount);
      player.frames.forEach((rolls, frameIndex) => {
        const cell = document.createElement("div");
        cell.className = "score-frame";
        const slots = frameIndex === frameCount - 1 ? 3 : 2;
        const rollHtml = Array.from({ length: slots }, (_, rollIndex) => `<i>${Core.notation(rolls, rollIndex, frameIndex === frameCount - 1)}</i>`).join("");
        cell.innerHTML = `<small>${frameIndex + 1}</small><span class="score-rolls">${rollHtml}</span>${player.score.cumulative[frameIndex] ?? ""}`;
        frames.appendChild(cell);
      });
      const total = document.createElement("div");
      total.className = "score-total";
      total.textContent = player.score.total;
      row.append(label, frames, total);
      board.appendChild(row);
    });
  }

  function updateMatchUI() {
    if (!match) return;
    const player = activePlayer();
    const mode = Core.MODES[match.modeId];
    const opponent = onlineMatch ? "Online" : match.playType === "cpu" ? "Vs CPU" : "Hotseat";
    $("match-chip").textContent = `${mode.name} · ${opponent} · ${LaneCore.getLane(matchLaneSlug).name}`;
    $("score-mode").textContent = `${mode.frames} frames`;
    $("hud-frame").textContent = Math.min(mode.frames, match.frameIndex + 1);
    $("hud-pins").textContent = scene.pins.filter((pin) => pin.standing).length;
    $("turn-name").textContent = player.name;
    $("turn-detail").textContent = `Frame ${match.frameIndex + 1} · Roll ${frameRollNumber()}`;
    $("turn-banner").querySelector("strong").textContent = player.name;
    $("turn-banner").classList.toggle("is-visible", bannerTime > 0);
    $("callout").classList.toggle("is-visible", calloutTime > 0);
    if (calloutTime <= 0) hideCalloutPose();
    updateScoreboard();
    updateShotControls();
  }

  function updateShotControls() {
    const enabled = canAdjustShot();
    const isCpu = activePlayer()?.type === "cpu";
    const waitingForOpponent = onlineMatch && !isLocalOnlineTurn();
    for (const control of [$("position-control"), $("aim-control")]) control.disabled = !enabled;
    for (const button of $("ball-rack").querySelectorAll("button")) button.disabled = !enabled;
    const throwEnabled = !isCpu && isLocalOnlineTurn() && !paused && ["ready", "spin", "charging"].includes(scene.phase);
    $("throw-button").disabled = !throwEnabled;
    $("shot-status").textContent = scene.phase === "network-paused" ? "Opponent reconnecting" : waitingForOpponent ? "Opponent bowling" : isCpu ? "CPU thinking" : scene.phase === "ready" ? "Set line" : scene.phase === "spin" ? "Time spin" : scene.phase === "charging" ? "Build power" : scene.phase === "submitting" ? "Server checking shot" : "Ball away";
    if (scene.phase === "ready") $("throw-button").textContent = waitingForOpponent ? "Opponent's turn" : isCpu ? "CPU lining up…" : "Start spin timing";
    else if (scene.phase === "spin") $("throw-button").textContent = "Press + hold to lock spin";
    else if (scene.phase === "charging") $("throw-button").textContent = "Release to throw";
    else if (scene.phase === "transition") $("throw-button").textContent = "Rack settling…";
    else if (scene.phase === "submitting") $("throw-button").textContent = "Scoring on server…";
    else if (scene.phase === "network-paused") $("throw-button").textContent = "Holding lane…";
    else $("throw-button").textContent = "Ball away";
  }

  function canAdjustShot() {
    return Boolean(match && match.status === "playing" && scene.phase === "ready" && activePlayer()?.type === "human" && isLocalOnlineTurn() && !paused);
  }

  function startSpin() {
    if (!canAdjustShot()) return;
    audio.unlock();
    audio.play("select", { intensity: 0.75 });
    scene.phase = "spin";
    scene.spinElapsed = 0;
    scene.spinLevel = Physics.spinAtTime(0, BALLS[scene.liveShot.ballIndex].meterSpeed);
    scene.liveShot.hook = scene.spinLevel;
    updateSpinFeedback();
    updateShotControls();
  }

  function startCharge() {
    if (scene.phase !== "spin" || activePlayer()?.type !== "human" || paused) return;
    audio.unlock();
    audio.play("charge");
    scene.liveShot.hook = scene.spinLevel;
    scene.phase = "charging";
    scene.chargeElapsed = 0;
    scene.chargeState = Physics.chargeStateAtTime(0, BALLS[scene.liveShot.ballIndex]);
    scene.chargeLevel = scene.chargeState.power;
    scene.liveShot.power = scene.chargeLevel;
    $("throw-button").classList.add("is-charging");
    updateShotControls();
    updateChargeFeedback();
  }

  function releaseCharge() {
    if (scene.phase !== "charging") return;
    const power = scene.chargeLevel;
    $("throw-button").classList.remove("is-charging");
    if (onlineMatch) {
      scene.liveShot.power = power;
      scene.phase = "submitting";
      onlineClient.submitShot({ ...scene.liveShot, power, release: 0 });
      updateShotControls();
      return;
    }
    beginThrow(power);
  }

  function updateChargeFeedback() {
    const percent = Math.round(scene.chargeLevel * 100);
    $("power-fill").style.width = `${percent}%`;
    $("power-meter").setAttribute("aria-valuenow", String(percent));
    $("power-output").textContent = `${percent}%`;
    const phase = scene.chargeState?.phase || "charging";
    $("power-meter").classList.toggle("is-sweet-spot", phase === "sweet-spot");
    $("power-meter").classList.toggle("is-overcharged", phase === "overcharged");
    $("charge-warning").classList.toggle("is-danger", phase === "overcharged");
    if (phase === "overcharged") {
      const lost = Math.round((scene.chargeState?.penalty || 0) * 100);
      $("charge-warning").textContent = `OVERCHARGED — power drained ${lost}%`;
      $("throw-button").textContent = `Release! ${percent}% power left`;
    } else if (phase === "sweet-spot") {
      $("charge-warning").textContent = "SWEET SPOT — release now!";
      $("throw-button").textContent = "MAX POWER — release now!";
    } else {
      $("charge-warning").textContent = "Release in the gold window. Overcharging drains power.";
      $("throw-button").textContent = `Release — ${percent}% power`;
    }
  }

  function updateSpinFeedback() {
    const percent = Math.round(scene.spinLevel * 100);
    const cursorPosition = 4 + ((scene.spinLevel + 1) / 2) * 92;
    $("spin-cursor").style.left = `${cursorPosition}%`;
    $("spin-meter").setAttribute("aria-valuenow", String(percent));
    $("spin-output").textContent = Math.abs(percent) < 5 ? "Straight" : `${percent < 0 ? "L" : "R"} ${Math.abs(percent)}`;
  }

  function resetChargeFeedback() {
    $("power-fill").style.width = "0%";
    $("power-meter").setAttribute("aria-valuenow", "0");
    $("power-output").textContent = "0%";
    $("power-meter").classList.remove("is-sweet-spot", "is-overcharged");
    $("charge-warning").classList.remove("is-danger");
    $("charge-warning").textContent = "Release in the gold window. Overcharging drains power.";
  }

  function resetSpinFeedback() {
    $("spin-cursor").style.left = "50%";
    $("spin-meter").setAttribute("aria-valuenow", "0");
    $("spin-output").textContent = "Tap throw to start";
  }

  function beginThrow(power, { release = 0 } = {}) {
    const ball = BALLS[scene.liveShot.ballIndex];
    scene.shot = {
      ...scene.liveShot,
      power,
      release,
      hookScale: ball.hookScale,
      speedScale: ball.speedScale,
      massScale: ball.massScale,
    };
    playerShots[match.activePlayer] = { ...scene.liveShot };
    scene.phase = "approach";
    scene.ballZ = 0.02;
    scene.throwElapsed = 0;
    scene.liveShot.power = power;
    scene.simulation = null;
    contactedPinCount = 0;
    audio.play("throw", { intensity: power });
    updateShotControls();
  }

  function planCpuTurn() {
    const plan = Cpu.createCpuPlan({
      levelId: match.cpuLevelId,
      pins: scene.pins,
      balls: BALLS,
    });
    Object.assign(scene.liveShot, plan);
    scene.liveShot.ballIndex = plan.ballIndex;
    applyBallProfile();
    renderBallProfile();
    syncControlsFromShot();
    $("ball-rack").querySelectorAll(".ball-button").forEach((entry, index) => entry.classList.toggle("is-selected", index === scene.liveShot.ballIndex));
    beginThrow(plan.power, { release: plan.release });
  }

  function showCallout(knocked, startedStanding) {
    const cleared = knocked === startedStanding;
    const firstRoll = frameRollNumber() === 1;
    let big = `${knocked} pins`;
    let small = "Keep working the rack";
    if (cleared && startedStanding === 10 && firstRoll) { big = "Strike!"; small = "Clean pocket hit"; }
    else if (cleared && startedStanding < 10) { big = "Spare!"; small = "Every pin accounted for"; }
    else if (knocked === 0) { big = "Gutter"; small = "Reset the line"; }
    else if (knocked >= 8) { big = "Great ball"; small = `${knocked} pins down`; }
    $("callout").querySelector("strong").textContent = big;
    $("callout").querySelector("span").textContent = small;
    calloutTime = 1.15;
    const cue = AudioCore.getOutcomeCue(knocked, startedStanding, firstRoll);
    showCalloutPose(cue);
    audio.play(cue, { intensity: 0.65 + knocked / 15 });
  }

  function showCalloutPose(outcomeCue) {
    const pose = $("callout-pose");
    const art = $("callout-pose-art");
    const player = activePlayer();
    const source = player ? calloutPose(player.characterSlug, outcomeCue, playerSkinId(player)) : null;
    if (!source) {
      hideCalloutPose();
      return;
    }
    // A skin whose celebration art has not shipped yet still gets the canon pose.
    art.onerror = () => {
      const canonSource = calloutPose(player.characterSlug, outcomeCue);
      if (canonSource && !art.src.endsWith(canonSource)) {
        art.src = canonSource;
        return;
      }
      pose.classList.remove("is-visible");
      art.removeAttribute("src");
      pose.hidden = true;
    };
    pose.hidden = false;
    art.src = source;
    pose.classList.add("is-visible");
  }

  function hideCalloutPose() {
    const pose = $("callout-pose");
    if (pose.classList.contains("is-visible")) pose.classList.remove("is-visible");
  }

  function preloadCalloutPoses(player) {
    if (!player) return;
    for (const cue of ["strike", "spare"]) {
      const source = calloutPose(player.characterSlug, cue, playerSkinId(player));
      if (source) new Image().src = source;
    }
  }

  function finalizeRoll() {
    const startedStanding = scene.simulation.startStanding;
    const authority = onlineMatch ? pendingAuthoritativeRoll : null;
    const knocked = authority
      ? authority.roll.knocked
      : Math.max(0, Math.min(startedStanding, Physics.knockedCount(scene.simulation)));
    scene.pins = authority ? clonePins(authority.roll.pinsAfter) : scene.simulation.pins;
    showCallout(knocked, startedStanding);
    if (knocked > 0) {
      renderer.shake = Math.min(12, 3 + knocked);
    }
    if (authority) {
      match = structuredClone(authority.snapshot.match);
      onlineSnapshot = authority.snapshot;
      lastAppliedOnlineRoll = Number(authority.roll.rollNumber) || lastAppliedOnlineRoll;
      pendingAuthoritativeRoll = null;
    } else {
      match = Core.recordRoll(match, knocked);
    }
    scene.phase = "transition";
    transitionTime = 1.35;
    updateMatchUI();
  }

  function prepareNextRoll() {
    if (match.status === "complete") {
      showResults();
      return;
    }
    const expectedPins = Core.pinsStandingForTurn(match);
    scene.pins = onlineMatch && onlineSnapshot?.nextPins
      ? clonePins(onlineSnapshot.nextPins)
      : expectedPins === 10 ? Physics.createRack() : Physics.clearFallen(scene.pins);
    scene.simulation = null;
    scene.phase = "ready";
    scene.ballZ = 0;
    scene.throwElapsed = 0;
    scene.spinElapsed = 0;
    scene.spinLevel = 0;
    scene.chargeElapsed = 0;
    scene.chargeLevel = 0;
    scene.chargeState = null;
    contactedPinCount = 0;
    resetChargeFeedback();
    resetSpinFeedback();
    prepareActivePlayer();
    updateMatchUI();
  }

  function showResults() {
    const tie = match.winnerIds.length > 1;
    const winner = match.players.find((player) => match.winnerIds.includes(player.id));
    $("results-title").textContent = tie ? "Dead heat!" : `${winner.name} wins!`;
    $("results-subtitle").textContent = `${Core.MODES[match.modeId].name}. ${tie ? "Nothing between them." : "The rack has spoken."}`;
    const host = $("results-players");
    host.innerHTML = "";
    match.players.forEach((player) => {
      const isWinner = match.winnerIds.includes(player.id);
      const outcome = isWinner ? "victory" : "defeat";
      const outcomeLabel = tie ? "Tied for first" : isWinner ? "Victory" : "Defeat";
      const bowler = bowlerBySlug(player.characterSlug);
      const card = document.createElement("article");
      card.className = `result-player ${isWinner ? "is-winner" : "is-defeated"}`;
      card.innerHTML = `
        <div class="result-player__portrait">
          <img src="${resultPortrait(player.characterSlug, outcome, playerSkinId(player))}" alt="${bowler.name}, ${outcomeLabel.toLowerCase()}">
          <span class="result-player__outcome">${outcomeLabel}</span>
        </div>
        <div class="result-player__details">
          <strong>${escapeHtml(player.name)}</strong>
          <span class="result-player__score"><small>Final score</small><b>${player.score.total}</b></span>
        </div>`;
      host.appendChild(card);
    });
    showScreen("results-screen");
    audio.play("win");
    if (onlineMatch) reportOnlineResult();
  }

  async function reportOnlineResult() {
    const sessionId = onlineSnapshot?.sessionId || "";
    if (!sessionId || reportedRatingSessionId === sessionId) return;
    reportedRatingSessionId = sessionId;
    const clientId = onlineClient.getSnapshot().clientId;
    const me = match.players.find((player) => player.id === clientId);
    const opponent = match.players.find((player) => player.id !== clientId);
    const status = $("online-result-status");
    status.hidden = false;
    if (!me?.accountPlayerId || !opponent?.accountPlayerId) {
      status.textContent = "Sign in to a Factory account to save online records.";
      return;
    }
    const outcome = match.winnerIds.length > 1 ? "draw" : match.winnerIds.includes(me.id) ? "win" : "loss";
    status.textContent = "Saving this match to your Factory record…";
    await platformApi.updateGameRating("yam-bowling", {
      opponentPlayerId: opponent.accountPlayerId,
      outcome,
      sessionId,
    }).catch(() => null);
    const rating = await platformApi.getGameRating("yam-bowling", me.accountPlayerId).catch(() => null);
    status.textContent = rating
      ? `Factory record · ${rating.wins}W ${rating.losses}L ${rating.draws}D · ${rating.rating} ELO`
      : "Match complete. Sign in to save wins, losses, and rating.";
  }

  function tick(dt) {
    if (!match || paused || $("game-screen").hidden) return;
    bannerTime = Math.max(0, bannerTime - dt);
    calloutTime = Math.max(0, calloutTime - dt);
    $("turn-banner").classList.toggle("is-visible", bannerTime > 0);
    $("callout").classList.toggle("is-visible", calloutTime > 0);
    if (calloutTime <= 0) hideCalloutPose();
    const strafeDirection = (keys.strafeRight ? 1 : 0) - (keys.strafeLeft ? 1 : 0);
    const aimDirection = (keys.aimRight ? 1 : 0) - (keys.aimLeft ? 1 : 0);

    if (canAdjustShot()) {
      if (strafeDirection) {
        scene.liveShot.position = Math.max(-0.46, Math.min(0.46, scene.liveShot.position + strafeDirection * dt * 0.46));
      }
      if (aimDirection) {
        const ball = BALLS[scene.liveShot.ballIndex] || BALLS[0];
        scene.liveShot.aim = Math.max(-0.45, Math.min(0.45, scene.liveShot.aim + aimDirection * dt * 0.45 * ball.aimSpeed));
      }
      if (strafeDirection || aimDirection) {
        syncControlsFromShot();
      }
    }

    if (scene.phase === "ready" && activePlayer()?.type === "cpu") {
      cpuDelay -= dt;
      if (cpuDelay <= 0) planCpuTurn();
    } else if (scene.phase === "spin") {
      scene.spinElapsed += dt;
      const ball = BALLS[scene.liveShot.ballIndex];
      scene.spinLevel = Physics.spinAtTime(scene.spinElapsed, ball.meterSpeed);
      scene.liveShot.hook = scene.spinLevel;
      updateSpinFeedback();
    } else if (scene.phase === "charging") {
      scene.chargeElapsed += dt;
      const ball = BALLS[scene.liveShot.ballIndex] || BALLS[0];
      scene.chargeState = Physics.chargeStateAtTime(scene.chargeElapsed, ball);
      scene.chargeLevel = scene.chargeState.power;
      scene.liveShot.power = scene.chargeLevel;
      updateChargeFeedback();
    } else if (scene.phase === "approach") {
      scene.throwElapsed += dt;
      if (!onlineMatch && activePlayer()?.type === "human" && scene.throwElapsed <= 0.32 && strafeDirection) {
        scene.shot.release = Math.max(-0.035, Math.min(0.035, scene.shot.release + strafeDirection * dt * 0.1));
      }
      const speed = Physics.ballSpeedForShot(scene.shot);
      scene.ballZ += speed * dt;
      if (scene.ballZ >= Physics.PHYSICS_START_Z) {
        scene.ballZ = Physics.PHYSICS_START_Z;
        scene.simulation = Physics.createSimulation(scene.pins, scene.shot);
        contactedPinCount = 0;
        scene.phase = "deck";
      }
    } else if (scene.phase === "deck") {
      scene.throwElapsed += dt;
      for (let i = 0; i < 3; i += 1) Physics.stepSimulation(scene.simulation, PHYSICS_DT);
      scene.pins = scene.simulation.pins;
      const nextContactedPinCount = scene.pins.filter((pin) => pin.contacted).length;
      if (nextContactedPinCount > contactedPinCount) {
        const newContacts = nextContactedPinCount - contactedPinCount;
        audio.play("pin", { intensity: 0.92 + newContacts * 0.12 });
        contactedPinCount = nextContactedPinCount;
      }
      $("hud-pins").textContent = scene.pins.filter((pin) => pin.standing).length;
      if (scene.simulation.complete) finalizeRoll();
    } else if (scene.phase === "transition") {
      transitionTime -= dt;
      if (transitionTime <= 0) prepareNextRoll();
    }
  }

  function loop(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    accumulator += Math.min(100, timestamp - lastTimestamp);
    lastTimestamp = timestamp;
    while (accumulator >= TICK_MS) {
      tick(TICK_MS / 1000);
      accumulator -= TICK_MS;
    }
    renderer.ctx.imageSmoothingEnabled = false;
    if (match && !$("game-screen").hidden) renderer.render(scene);
    requestAnimationFrame(loop);
  }

  function syncAudioToggle() {
    const toggle = $("audio-toggle");
    toggle.setAttribute("aria-pressed", String(audio.enabled));
    toggle.setAttribute("aria-label", audio.enabled ? "Mute music and sound" : "Turn on music and sound");
    toggle.title = audio.enabled ? "Mute music and sound" : "Turn on music and sound";
    toggle.querySelector(".audio-toggle__icon").textContent = audio.enabled ? "♫" : "×";
    toggle.querySelector(".audio-toggle__label").textContent = audio.enabled ? "Sound on" : "Sound off";
  }

  const keys = { strafeLeft: false, strafeRight: false, aimLeft: false, aimRight: false };

  function bindEvents() {
    document.addEventListener("pointerdown", () => audio.unlock(), { capture: true, once: true });
    // Long-pressing the throw button or a slider must not open the touch text menu.
    document.addEventListener("contextmenu", (event) => {
      if (event.target?.closest?.("input, textarea, [data-selectable]")) return;
      event.preventDefault();
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled || button.id === "throw-button") return;
      if (!audio.unlocked) audio.unlock();
      const isSelection = button.matches(".character-card, .ball-button, [data-mode], [data-play-type], [data-cpu-level], [data-player-slot], [data-splash-slug], [data-skin-id], [data-lane-slug]");
      audio.play(isSelection ? "select" : "click");
    });
    $("audio-toggle").addEventListener("click", () => {
      audio.toggle();
      syncAudioToggle();
    });
    $("play-button").addEventListener("click", () => { showScreen("setup-screen"); renderSetup(); });
    $("online-button").addEventListener("click", () => { showScreen("online-screen"); renderOnlineSetup(); });
    $("setup-back").addEventListener("click", () => showScreen("title-screen"));
    $("online-back").addEventListener("click", () => showScreen("title-screen"));
    $("how-button").addEventListener("click", () => { $("how-dialog").showModal(); audio.play("popup"); });
    $("how-close").addEventListener("click", () => $("how-dialog").close());
    $("menu-splash-button").addEventListener("click", () => { $("menu-splash-dialog").showModal(); audio.play("popup"); });
    $("menu-splash-close").addEventListener("click", () => $("menu-splash-dialog").close());
    $("lane-button").addEventListener("click", () => { $("lane-dialog").showModal(); audio.play("popup"); });
    $("lane-close").addEventListener("click", () => $("lane-dialog").close());
    $("inspect-bowler-button").addEventListener("click", (event) => {
      openCharacterInspector(setup.characterSlugs[setup.activeSlot], event.currentTarget);
    });
    $("online-inspect-bowler-button").addEventListener("click", (event) => {
      openCharacterInspector(onlineSetup.characterSlug, event.currentTarget);
    });
    $("character-inspector-close").addEventListener("click", closeCharacterInspector);
    $("character-inspector-previous").addEventListener("click", () => showAdjacentInspectorCharacter(-1));
    $("character-inspector-next").addEventListener("click", () => showAdjacentInspectorCharacter(1));
    $("character-inspector-dialog").addEventListener("close", () => {
      inspectorReturnFocus?.focus?.();
      inspectorReturnFocus = null;
    });
    $("character-inspector-dialog").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeCharacterInspector();
    });
    $("character-inspector-dialog").addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      showAdjacentInspectorCharacter(event.key === "ArrowLeft" ? -1 : 1);
    });
    $("mode-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;
      setup.modeId = button.dataset.mode;
      renderSetup();
    });
    $("online-mode-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-online-mode]");
      if (!button) return;
      onlineSetup.modeId = button.dataset.onlineMode;
      renderOnlineSetup();
    });
    $("quick-match-button").addEventListener("click", () => beginOnline("quick"));
    $("create-room-button").addEventListener("click", () => beginOnline("private-create"));
    $("join-room-button").addEventListener("click", () => beginOnline("private-join"));
    $("join-room-code").addEventListener("input", (event) => {
      event.target.value = normalizeRoomCode(event.target.value);
      $("online-menu-status").classList.remove("is-error");
    });
    $("join-room-code").addEventListener("keydown", (event) => {
      if (event.key === "Enter") beginOnline("private-join");
    });
    $("copy-room-code").addEventListener("click", async () => {
      const code = $("online-room-code").textContent;
      await navigator.clipboard?.writeText?.(code).catch(() => {});
      $("copy-room-code").textContent = "Copied";
      setTimeout(() => { $("copy-room-code").textContent = "Copy code"; }, 1200);
    });
    $("leave-online-button").addEventListener("click", () => {
      onlineClient.leaveLobby();
      onlineMatch = false;
      onlineSnapshot = null;
      showScreen("online-screen");
      renderOnlineSetup();
    });
    $("play-type-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-play-type]");
      if (!button) return;
      setup.playType = button.dataset.playType;
      renderSetup();
    });
    $("cpu-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-cpu-level]");
      if (!button) return;
      setup.cpuLevelId = button.dataset.cpuLevel;
      renderSetup();
    });
    for (const slot of document.querySelectorAll("[data-player-slot]")) {
      slot.addEventListener("click", () => { setup.activeSlot = Number(slot.dataset.playerSlot); renderSetup(); });
    }
    $("start-match").addEventListener("click", startMatch);

    $("position-control").addEventListener("input", (event) => {
      if (!canAdjustShot()) return;
      scene.liveShot.position = Number(event.target.value) / 100;
      audio.play("select", { intensity: 0.55 });
      syncControlsFromShot();
    });
    $("aim-control").addEventListener("input", (event) => {
      if (!canAdjustShot()) return;
      scene.liveShot.aim = Number(event.target.value) / 100;
      audio.play("select", { intensity: 0.55 });
      syncControlsFromShot();
    });
    const throwButton = $("throw-button");
    throwButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      throwButton.setPointerCapture?.(event.pointerId);
      if (scene.phase === "ready") startSpin();
      else if (scene.phase === "spin") startCharge();
    });
    throwButton.addEventListener("pointerup", (event) => { event.preventDefault(); releaseCharge(); });
    throwButton.addEventListener("pointercancel", releaseCharge);

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        if (scene.phase === "ready") startSpin();
        else if (scene.phase === "spin") startCharge();
      }
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        if (canAdjustShot()) {
          event.preventDefault();
          if (event.code === "ArrowLeft") keys.aimLeft = true;
          if (event.code === "ArrowRight") keys.aimRight = true;
        }
      }
      if ((event.key === "a" || event.key === "A") && !event.shiftKey) keys.strafeLeft = true;
      if ((event.key === "d" || event.key === "D") && event.shiftKey && !event.repeat) renderer.debug = !renderer.debug;
      else if (event.key === "d" || event.key === "D") keys.strafeRight = true;
    });
    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") { event.preventDefault(); releaseCharge(); }
      if (event.code === "ArrowLeft") keys.aimLeft = false;
      if (event.code === "ArrowRight") keys.aimRight = false;
      if (event.key === "a" || event.key === "A") keys.strafeLeft = false;
      if (event.key === "d" || event.key === "D") keys.strafeRight = false;
    });
    window.addEventListener("blur", () => {
      keys.strafeLeft = false;
      keys.strafeRight = false;
      keys.aimLeft = false;
      keys.aimRight = false;
    });

    $("pause-button").addEventListener("click", () => { paused = true; $("pause-overlay").hidden = false; audio.play("popup"); audio.pauseMusic(); });
    $("resume-button").addEventListener("click", () => { paused = false; $("pause-overlay").hidden = true; audio.resumeMusic(); });
    $("restart-match-button").addEventListener("click", startMatch);
    $("quit-match-button").addEventListener("click", () => {
      paused = false;
      $("pause-overlay").hidden = true;
      if (onlineMatch) {
        onlineClient.leaveLobby();
        onlineMatch = false;
        showScreen("online-screen");
        renderOnlineSetup();
      } else {
        showScreen("setup-screen");
      }
      audio.resumeMusic();
    });
    $("rematch-button").addEventListener("click", () => {
      if (onlineMatch) {
        onlineClient.requestRematch();
        $("online-result-status").hidden = false;
        $("online-result-status").textContent = "Rematch requested. Waiting for your opponent…";
      } else startMatch();
    });
    $("change-match-button").addEventListener("click", () => {
      if (onlineMatch) {
        onlineClient.leaveLobby();
        onlineMatch = false;
        showScreen("online-screen");
        renderOnlineSetup();
      } else {
        showScreen("setup-screen");
        renderSetup();
      }
    });
    $("results-home-button").addEventListener("click", () => {
      if (onlineMatch) onlineClient.leaveLobby();
      onlineMatch = false;
      showScreen("title-screen");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        audio.pauseMusic();
        if (match && !$("game-screen").hidden) { paused = true; $("pause-overlay").hidden = false; }
      } else if (!paused) audio.resumeMusic();
    });
  }

  async function init() {
    buildMenuSplashGrid();
    buildLaneGrid();
    buildCharacterGrid();
    buildOnlineCharacterGrid();
    buildBallRack();
    Cpu.warmCpuPlanner({ pins: Physics.createRack(), balls: BALLS });
    renderSetup();
    renderOnlineSetup();
    onlineClient.subscribe(handleOnlineSnapshot);
    syncAudioToggle();
    bindEvents();
    if (onlineClient.resumeSavedSession()) {
      showScreen("online-lobby-screen");
      renderOnlineLobby();
    }
    $("start-match").disabled = true;
    $("start-match").textContent = "Loading lane…";
    try {
      await renderer.load(selectedLaneSlug);
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
