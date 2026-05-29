export function createInput() {
  const keys = {
    left: false,
    right: false,
    fire: false,
    restart: false
  };

  const touch = {
    leftPointer: false,
    rightPointer: false,
    firePointer: false
  };

  const pressed = {
    fire: false
  };

  function pressFire() {
    // Edge-triggered fire:
    // only record a shot request when fire transitions from up to down.
    if (!keys.fire && !touch.firePointer) {
      pressed.fire = true;
    }
  }

  function bindKeyEvents() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();

      if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;

      if (e.code === "Space" || e.code === "KeyJ") {
        if (!keys.fire) pressed.fire = true;
        keys.fire = true;
      }

      if (e.code === "KeyR" || e.code === "Enter") keys.restart = true;
    }, { passive: false });

    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
      if (e.code === "Space" || e.code === "KeyJ") keys.fire = false;
      if (e.code === "KeyR" || e.code === "Enter") keys.restart = false;
    });
  }

  function bindTouchButton(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;

    const on = (e) => {
      e.preventDefault();

      if (prop === "firePointer" && !touch.firePointer && !keys.fire) {
        pressed.fire = true;
      }

      touch[prop] = true;
    };

    const off = (e) => {
      e.preventDefault();
      touch[prop] = false;
    };

    el.addEventListener("pointerdown", on, { passive: false });
    el.addEventListener("pointerup", off, { passive: false });
    el.addEventListener("pointercancel", off, { passive: false });
    el.addEventListener("pointerleave", off, { passive: false });
  }

  function bindTouchEvents() {
    bindTouchButton("leftBtn", "leftPointer");
    bindTouchButton("rightBtn", "rightPointer");
    bindTouchButton("fireBtn", "firePointer");
  }

  function bind() {
    bindKeyEvents();
    bindTouchEvents();
  }

  function isLeft() {
    return keys.left || touch.leftPointer;
  }

  function isRight() {
    return keys.right || touch.rightPointer;
  }

  function isFireHeld() {
    return keys.fire || touch.firePointer;
  }

  function consumeFirePress() {
    if (!pressed.fire) return false;
    pressed.fire = false;
    return true;
  }

  function isRestart() {
    return keys.restart;
  }

  return {
    keys,
    touch,
    bind,
    isLeft,
    isRight,
    isFireHeld,
    consumeFirePress,
    isRestart
  };
}
