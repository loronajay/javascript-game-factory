(function () {
  if (window.ArcadeInput) return;

  const listeners = [];

  function isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;

    const tagName = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  }

  function emit(action, source) {
    listeners.forEach((listener) => listener(action, source));
  }

  function onAction(listener) {
    listeners.push(listener);
  }

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") emit("left", "keyboard");
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") emit("right", "keyboard");
    if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") emit("up", "keyboard");
    if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") emit("down", "keyboard");

    if (isEditableTarget(event.target)) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      emit("select", "keyboard");
    }
  });

  let lastDirection = null;
  let lastMoveAt = 0;
  let lastSelectPressed = false;
  const repeatDelayMs = 180;

  function getConnectedPad() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    return pads.find((pad) => pad && pad.connected) || null;
  }

  function pollGamepad() {
    const pad = getConnectedPad();

    if (!pad) {
      lastDirection = null;
      lastSelectPressed = false;
      requestAnimationFrame(pollGamepad);
      return;
    }

    const now = performance.now();
    const horizontal = pad.axes[0] || 0;
    const vertical = pad.axes[1] || 0;

    const left = pad.buttons[14]?.pressed || horizontal < -0.5;
    const right = pad.buttons[15]?.pressed || horizontal > 0.5;
    const up = pad.buttons[12]?.pressed || vertical < -0.5;
    const down = pad.buttons[13]?.pressed || vertical > 0.5;

    let direction = null;
    if (left) direction = "left";
    else if (right) direction = "right";
    else if (up) direction = "up";
    else if (down) direction = "down";

    if (!direction) {
      lastDirection = null;
    } else if (direction !== lastDirection || now - lastMoveAt > repeatDelayMs) {
      emit(direction, "gamepad");
      lastDirection = direction;
      lastMoveAt = now;
    }

    const selectPressed = !!pad.buttons[0]?.pressed;
    if (selectPressed && !lastSelectPressed) {
      emit("select", "gamepad");
    }
    lastSelectPressed = selectPressed;

    requestAnimationFrame(pollGamepad);
  }

  pollGamepad();

  window.ArcadeInput = { onAction };
})();
