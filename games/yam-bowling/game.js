(function startYamBowling() {
  "use strict";

  const Core = window.YamGameCore;
  const Physics = window.YamPhysics;
  const BallCore = window.YamBallCore;
  const Cpu = window.YamCpuPlanner;
  const AudioCore = window.YamAudio;
  const Roster = window.YamBowlingCore.CANON_BOWLERS;
  const TICK_MS = 1000 / 60;
  const PHYSICS_DT = 1 / 180;
  const BALLS = BallCore.BALLS;

  const $ = (id) => document.getElementById(id);
  const canvas = $("game-canvas");
  const renderer = new window.YamBowlingRenderer(canvas);
  const audio = AudioCore.createAudioDirector();
  const setup = {
    modeId: "quick",
    playType: "cpu",
    cpuLevelId: "casual",
    activeSlot: 0,
    characterSlugs: ["daisy-monroe", "nia-brooks"],
  };

  let match = null;
  let paused = false;
  let calloutTime = 0;
  let bannerTime = 0;
  let cpuDelay = 0;
  let transitionTime = 0;
  let lastTimestamp = null;
  let accumulator = 0;
  let playerShots = [];
  let contactedPinCount = 0;

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

  function characterFrame(slug, frame = 1) {
    return `assets/characters/processed/canon/${slug}/throw-${String(frame).padStart(2, "0")}.png`;
  }

  function characterPortrait(slug) {
    return window.YamBowlingCore.getPortraitAssetPath({ slug });
  }

  function resultPortrait(slug, outcome) {
    return window.YamBowlingCore.getResultPortraitAssetPath({ slug }, outcome);
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
      slot.querySelector("img").src = characterPortrait(slug);
      slot.querySelector("strong").textContent = bowler.name;
    });

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
        if (setup.characterSlugs[other] === bowler.slug) {
          setup.characterSlugs[other] = setup.characterSlugs[setup.activeSlot];
        }
        setup.characterSlugs[setup.activeSlot] = bowler.slug;
        renderSetup();
      });
      grid.appendChild(card);
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
      { id: "p1", name: "Player 1", characterSlug: setup.characterSlugs[0], type: "human" },
      {
        id: "p2",
        name: setup.playType === "cpu" ? Core.chooseCpuName() : "Player 2",
        characterSlug: setup.characterSlugs[1],
        type: setup.playType === "cpu" ? "cpu" : "human",
      },
    ];
  }

  function startMatch() {
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
    audio.resumeMusic();
    resetHumanShot();
    prepareActivePlayer();
    updateMatchUI();
    showScreen("game-screen");
  }

  function activePlayer() {
    return match?.players[match.activePlayer] || null;
  }

  function prepareActivePlayer() {
    const player = activePlayer();
    if (!player) return;
    Object.assign(scene.liveShot, playerShots[match.activePlayer] || defaultShot());
    applyBallProfile();
    renderBallProfile();
    syncControlsFromShot();
    $("ball-rack").querySelectorAll(".ball-button").forEach((entry, index) => entry.classList.toggle("is-selected", index === scene.liveShot.ballIndex));
    renderer.setCharacter(player.characterSlug).catch(console.error);
    $("turn-avatar").src = characterPortrait(player.characterSlug);
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
      label.innerHTML = `<strong>${player.name}</strong><small>${player.type === "cpu" ? "CPU" : `P${playerIndex + 1}`}</small>`;
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
    $("match-chip").textContent = `${mode.name} · ${match.playType === "cpu" ? "Vs CPU" : "Hotseat"}`;
    $("score-mode").textContent = `${mode.frames} frames`;
    $("hud-frame").textContent = Math.min(mode.frames, match.frameIndex + 1);
    $("hud-pins").textContent = scene.pins.filter((pin) => pin.standing).length;
    $("turn-name").textContent = player.name;
    $("turn-detail").textContent = `Frame ${match.frameIndex + 1} · Roll ${frameRollNumber()}`;
    $("turn-banner").querySelector("strong").textContent = player.name;
    $("turn-banner").classList.toggle("is-visible", bannerTime > 0);
    $("callout").classList.toggle("is-visible", calloutTime > 0);
    updateScoreboard();
    updateShotControls();
  }

  function updateShotControls() {
    const enabled = canAdjustShot();
    const isCpu = activePlayer()?.type === "cpu";
    for (const control of [$("position-control"), $("aim-control")]) control.disabled = !enabled;
    for (const button of $("ball-rack").querySelectorAll("button")) button.disabled = !enabled;
    const throwEnabled = !isCpu && !paused && ["ready", "spin", "charging"].includes(scene.phase);
    $("throw-button").disabled = !throwEnabled;
    $("shot-status").textContent = isCpu ? "CPU thinking" : scene.phase === "ready" ? "Set line" : scene.phase === "spin" ? "Time spin" : scene.phase === "charging" ? "Build power" : "Ball away";
    if (scene.phase === "ready") $("throw-button").textContent = isCpu ? "CPU lining up…" : "Start spin timing";
    else if (scene.phase === "spin") $("throw-button").textContent = "Press + hold to lock spin";
    else if (scene.phase === "charging") $("throw-button").textContent = "Release to throw";
    else if (scene.phase === "transition") $("throw-button").textContent = "Rack settling…";
    else $("throw-button").textContent = "Ball away";
  }

  function canAdjustShot() {
    return Boolean(match && match.status === "playing" && scene.phase === "ready" && activePlayer()?.type === "human" && !paused);
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
    audio.play(AudioCore.getOutcomeCue(knocked, startedStanding, firstRoll), { intensity: 0.65 + knocked / 15 });
  }

  function finalizeRoll() {
    const startedStanding = scene.simulation.startStanding;
    const knocked = Math.max(0, Math.min(startedStanding, Physics.knockedCount(scene.simulation)));
    scene.pins = scene.simulation.pins;
    showCallout(knocked, startedStanding);
    if (knocked > 0) {
      renderer.shake = Math.min(12, 3 + knocked);
    }
    match = Core.recordRoll(match, knocked);
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
    scene.pins = expectedPins === 10 ? Physics.createRack() : Physics.clearFallen(scene.pins);
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
          <img src="${resultPortrait(player.characterSlug, outcome)}" alt="${bowler.name}, ${outcomeLabel.toLowerCase()}">
          <span class="result-player__outcome">${outcomeLabel}</span>
        </div>
        <div class="result-player__details">
          <strong>${player.name}</strong>
          <span class="result-player__score"><small>Final score</small><b>${player.score.total}</b></span>
        </div>`;
      host.appendChild(card);
    });
    showScreen("results-screen");
    audio.play("win");
  }

  function tick(dt) {
    if (!match || paused || $("game-screen").hidden) return;
    bannerTime = Math.max(0, bannerTime - dt);
    calloutTime = Math.max(0, calloutTime - dt);
    $("turn-banner").classList.toggle("is-visible", bannerTime > 0);
    $("callout").classList.toggle("is-visible", calloutTime > 0);
    const strafeDirection = (keys.strafeRight ? 1 : 0) - (keys.strafeLeft ? 1 : 0);
    const aimDirection = (keys.aimRight ? 1 : 0) - (keys.aimLeft ? 1 : 0);

    if (scene.phase === "ready" && activePlayer()?.type === "human") {
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
      if (activePlayer()?.type === "human" && scene.throwElapsed <= 0.32 && strafeDirection) {
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
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled || button.id === "throw-button") return;
      if (!audio.unlocked) audio.unlock();
      const isSelection = button.matches(".character-card, .ball-button, [data-mode], [data-play-type], [data-cpu-level], [data-player-slot]");
      audio.play(isSelection ? "select" : "click");
    });
    $("audio-toggle").addEventListener("click", () => {
      audio.toggle();
      syncAudioToggle();
    });
    $("play-button").addEventListener("click", () => { showScreen("setup-screen"); renderSetup(); });
    $("setup-back").addEventListener("click", () => showScreen("title-screen"));
    $("how-button").addEventListener("click", () => { $("how-dialog").showModal(); audio.play("popup"); });
    $("how-close").addEventListener("click", () => $("how-dialog").close());
    $("mode-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;
      setup.modeId = button.dataset.mode;
      renderSetup();
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
    $("quit-match-button").addEventListener("click", () => { paused = false; $("pause-overlay").hidden = true; showScreen("setup-screen"); audio.resumeMusic(); });
    $("rematch-button").addEventListener("click", startMatch);
    $("change-match-button").addEventListener("click", () => { showScreen("setup-screen"); renderSetup(); });
    $("results-home-button").addEventListener("click", () => showScreen("title-screen"));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        audio.pauseMusic();
        if (match && !$("game-screen").hidden) { paused = true; $("pause-overlay").hidden = false; }
      } else if (!paused) audio.resumeMusic();
    });
  }

  async function init() {
    buildCharacterGrid();
    buildBallRack();
    Cpu.warmCpuPlanner({ pins: Physics.createRack(), balls: BALLS });
    renderSetup();
    syncAudioToggle();
    bindEvents();
    $("start-match").disabled = true;
    $("start-match").textContent = "Loading lane…";
    try {
      await renderer.load();
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
