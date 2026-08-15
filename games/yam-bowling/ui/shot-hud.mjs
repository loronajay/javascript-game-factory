import { $ } from "./dom.mjs";

// The right-hand shot rail: ball rack, ball profile, line controls, spin and
// power meters.
//
// This module renders and nothing else. It never decides that a spin has
// started or a throw has been released — those are match logic and live in the
// match runtime, which calls back in here to repaint. Keeping the decision out
// of the HUD is what stops the shot pipeline from being spread across both.
export function createShotHud({ session, balls, ballCore }) {
  const { scene } = session;

  function formatDirection(value, allowZero = false) {
    const amount = Math.round(Math.abs(value) * 100);
    if (amount === 0) return allowZero ? "0" : "C";
    return `${value < 0 ? "L" : "R"} ${amount}`;
  }

  function activeBall() {
    return balls[scene.liveShot.ballIndex] || balls[0];
  }

  function buildBallRack(onSelect) {
    const rack = $("ball-rack");
    balls.forEach((ball, index) => {
      const button = document.createElement("button");
      button.className = `ball-button${index === 0 ? " is-selected" : ""}`;
      button.type = "button";
      const profile = `${ball.name}, ${ball.archetype}: ${ball.description}`;
      button.title = profile;
      button.setAttribute("aria-label", profile);
      button.style.setProperty("--ball-a", ball.a);
      button.style.setProperty("--ball-b", ball.b);
      button.innerHTML = `<i aria-hidden="true"></i><span>${ball.name}</span>`;
      button.addEventListener("click", () => onSelect(index));
      rack.appendChild(button);
    });
  }

  function syncRackSelection() {
    $("ball-rack").querySelectorAll(".ball-button")
      .forEach((entry, index) => entry.classList.toggle("is-selected", index === scene.liveShot.ballIndex));
  }

  function renderBallProfile() {
    const ball = activeBall();
    $("ball-profile-name").textContent = ball.name;
    $("ball-profile-type").textContent = ball.archetype;
    $("ball-profile-description").textContent = ball.description;
    $("ball-profile-stats").innerHTML = ballCore.profileStats(ball)
      .map((stat) => `<div><dt>${stat.label}</dt><dd>${stat.value}</dd></div>`)
      .join("");
  }

  function syncControlsFromShot() {
    $("position-control").value = String(Math.round(scene.liveShot.position * 100));
    $("aim-control").value = String(Math.round(scene.liveShot.aim * 100));
    $("position-output").textContent = formatDirection(scene.liveShot.position);
    $("aim-output").textContent = formatDirection(scene.liveShot.aim);
  }

  function updateShotControls() {
    const enabled = session.canAdjustShot();
    const isCpu = session.activePlayer()?.type === "cpu";
    const waitingForOpponent = session.onlineMatch && !session.isLocalOnlineTurn();
    for (const control of [$("position-control"), $("aim-control")]) control.disabled = !enabled;
    for (const button of $("ball-rack").querySelectorAll("button")) button.disabled = !enabled;

    const throwEnabled = !isCpu
      && session.isLocalOnlineTurn()
      && !session.paused
      && ["ready", "spin", "charging"].includes(scene.phase);
    $("throw-button").disabled = !throwEnabled;

    $("shot-status").textContent = scene.phase === "network-paused" ? "Opponent reconnecting"
      : waitingForOpponent ? "Opponent bowling"
        : isCpu ? "CPU thinking"
          : scene.phase === "ready" ? "Set line"
            : scene.phase === "spin" ? "Time spin"
              : scene.phase === "charging" ? "Build power"
                : scene.phase === "submitting" ? "Server checking shot" : "Ball away";

    if (scene.phase === "ready") {
      $("throw-button").textContent = waitingForOpponent ? "Opponent's turn"
        : isCpu ? "CPU lining up…" : "Start spin timing";
    } else if (scene.phase === "spin") $("throw-button").textContent = "Press + hold to lock spin";
    else if (scene.phase === "charging") $("throw-button").textContent = "Release to throw";
    else if (scene.phase === "transition") $("throw-button").textContent = "Rack settling…";
    else if (scene.phase === "submitting") $("throw-button").textContent = "Scoring on server…";
    else if (scene.phase === "network-paused") $("throw-button").textContent = "Holding lane…";
    else $("throw-button").textContent = "Ball away";
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
    $("spin-output").textContent = Math.abs(percent) < 5
      ? "Straight"
      : `${percent < 0 ? "L" : "R"} ${Math.abs(percent)}`;
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

  return {
    buildBallRack,
    syncRackSelection,
    renderBallProfile,
    syncControlsFromShot,
    updateShotControls,
    updateChargeFeedback,
    updateSpinFeedback,
    resetChargeFeedback,
    resetSpinFeedback,
  };
}
