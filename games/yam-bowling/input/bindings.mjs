import { $, showScreen } from "../ui/dom.mjs";

// Held-key state, shared with the tick loop. Keyed by intent rather than by key
// so the pointer and keyboard paths stay interchangeable.
export function createHeldKeys() {
  return { strafeLeft: false, strafeRight: false, aimLeft: false, aimRight: false };
}

// Every global listener the cabinet installs. Screen-local wiring belongs to the
// screen that owns it (the setup screens, the pickers and the inspector each
// bind their own); what lands here is what is genuinely cross-screen: audio,
// navigation between screens, the throw control, keyboard, pause and results.
export function bindEvents({
  session,
  keys,
  audio,
  renderer,
  matchRuntime,
  onlineSession,
  setupScreen,
  onlineScreen,
  shotHud,
  syncAudioToggle,
}) {
  const { scene } = session;

  function pressThrow() {
    if (scene.phase === "ready") matchRuntime.startSpin();
    else if (scene.phase === "spin") matchRuntime.startCharge();
  }

  function quitMatch() {
    session.paused = false;
    $("pause-overlay").hidden = true;
    if (session.onlineMatch) onlineSession.leave();
    else showScreen("setup-screen");
    audio.resumeMusic();
  }

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
    const isSelection = button.matches(
      ".character-card, .ball-button, [data-mode], [data-play-type], [data-cpu-level], [data-player-slot], [data-splash-slug], [data-skin-id], [data-lane-slug]",
    );
    audio.play(isSelection ? "select" : "click");
  });

  $("audio-toggle").addEventListener("click", () => {
    audio.toggle();
    syncAudioToggle();
  });

  // --- Navigation ---
  $("play-button").addEventListener("click", () => { showScreen("setup-screen"); setupScreen.render(); });
  $("online-button").addEventListener("click", () => { showScreen("online-screen"); onlineScreen.renderSetup(); });
  $("setup-back").addEventListener("click", () => showScreen("title-screen"));
  $("online-back").addEventListener("click", () => showScreen("title-screen"));
  $("how-button").addEventListener("click", () => { $("how-dialog").showModal(); audio.play("popup"); });
  $("how-close").addEventListener("click", () => $("how-dialog").close());
  $("start-match").addEventListener("click", () => matchRuntime.startMatch());

  // --- Shot controls ---
  $("position-control").addEventListener("input", (event) => {
    if (!session.canAdjustShot()) return;
    scene.liveShot.position = Number(event.target.value) / 100;
    audio.play("select", { intensity: 0.55 });
    shotHud.syncControlsFromShot();
  });
  $("aim-control").addEventListener("input", (event) => {
    if (!session.canAdjustShot()) return;
    scene.liveShot.aim = Number(event.target.value) / 100;
    audio.play("select", { intensity: 0.55 });
    shotHud.syncControlsFromShot();
  });

  const throwButton = $("throw-button");
  throwButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    throwButton.setPointerCapture?.(event.pointerId);
    pressThrow();
  });
  throwButton.addEventListener("pointerup", (event) => {
    event.preventDefault();
    matchRuntime.releaseCharge();
  });
  throwButton.addEventListener("pointercancel", () => matchRuntime.releaseCharge());

  // --- Keyboard: A/D strafe the approach, arrows aim, space throws ---
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      pressThrow();
    }
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      if (session.canAdjustShot()) {
        event.preventDefault();
        if (event.code === "ArrowLeft") keys.aimLeft = true;
        if (event.code === "ArrowRight") keys.aimRight = true;
      }
    }
    if ((event.key === "a" || event.key === "A") && !event.shiftKey) keys.strafeLeft = true;
    if ((event.key === "d" || event.key === "D") && event.shiftKey && !event.repeat) {
      renderer.debug = !renderer.debug;
    } else if (event.key === "d" || event.key === "D") keys.strafeRight = true;
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") { event.preventDefault(); matchRuntime.releaseCharge(); }
    if (event.code === "ArrowLeft") keys.aimLeft = false;
    if (event.code === "ArrowRight") keys.aimRight = false;
    if (event.key === "a" || event.key === "A") keys.strafeLeft = false;
    if (event.key === "d" || event.key === "D") keys.strafeRight = false;
  });
  // A held key with no keyup because focus left the window would strafe forever.
  window.addEventListener("blur", () => {
    keys.strafeLeft = false;
    keys.strafeRight = false;
    keys.aimLeft = false;
    keys.aimRight = false;
  });

  // --- Pause, restart, results ---
  $("pause-button").addEventListener("click", () => {
    session.paused = true;
    $("pause-overlay").hidden = false;
    audio.play("popup");
    audio.pauseMusic();
  });
  $("resume-button").addEventListener("click", () => {
    session.paused = false;
    $("pause-overlay").hidden = true;
    audio.resumeMusic();
  });
  $("restart-match-button").addEventListener("click", () => matchRuntime.startMatch());
  $("quit-match-button").addEventListener("click", quitMatch);

  $("rematch-button").addEventListener("click", () => {
    if (session.onlineMatch) onlineSession.requestRematch();
    else matchRuntime.startMatch();
  });
  $("change-match-button").addEventListener("click", () => {
    if (session.onlineMatch) onlineSession.leave();
    else { showScreen("setup-screen"); setupScreen.render(); }
  });
  $("results-home-button").addEventListener("click", () => {
    onlineSession.leaveToTitle();
  });

  // Backgrounding the tab pauses a live match rather than letting it run on.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      audio.pauseMusic();
      if (session.match && !$("game-screen").hidden) {
        session.paused = true;
        $("pause-overlay").hidden = false;
      }
    } else if (!session.paused) audio.resumeMusic();
  });
}
