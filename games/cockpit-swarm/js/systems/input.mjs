export function createInput() {
  const keys = {
    left: false,
    right: false,
    fire: false,
    up: false,
    down: false,
    escape: false
  };

  const touch = {
    leftPointer: false,
    rightPointer: false,
    firePointer: false
  };

  // Edge-triggered presses consumed once per logical action
  const pressed = {
    fire: false,
    up: false,
    down: false,
    confirm: false,
    back: false
  };

  // Mouse state in canvas logical space (1280×720)
  const mouse = { x: -1, y: -1 };
  let pendingClick = null;

  function bindKeyEvents() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === "ArrowLeft"  || e.code === "KeyA") keys.left  = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;

      if (e.code === "ArrowUp"   || e.code === "KeyW") { if (!keys.up)   pressed.up   = true; keys.up   = true; }
      if (e.code === "ArrowDown" || e.code === "KeyS") { if (!keys.down) pressed.down = true; keys.down = true; }

      if (e.code === "Space" || e.code === "KeyJ") {
        if (!keys.fire) pressed.fire = true;
        keys.fire = true;
      }

      if (e.code === "Enter") {
        pressed.confirm = true;
      }

      if (e.code === "Escape") {
        if (!keys.escape) pressed.back = true;
        keys.escape = true;
      }
    }, { passive: false });

    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft"  || e.code === "KeyA") keys.left  = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
      if (e.code === "ArrowUp"    || e.code === "KeyW") keys.up    = false;
      if (e.code === "ArrowDown"  || e.code === "KeyS") keys.down  = false;
      if (e.code === "Space"      || e.code === "KeyJ") keys.fire  = false;
      if (e.code === "Escape")                          keys.escape = false;
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
    el.addEventListener("pointerup",   off, { passive: false });
    el.addEventListener("pointercancel", off, { passive: false });
    el.addEventListener("pointerleave", off, { passive: false });
  }

  function bindTouchEvents() {
    bindTouchButton("leftBtn",  "leftPointer");
    bindTouchButton("rightBtn", "rightPointer");
    bindTouchButton("fireBtn",  "firePointer");
  }

  function bind() {
    bindKeyEvents();
    bindTouchEvents();
  }

  // Called by main.mjs with canvas-normalized coordinates
  function setMousePos(x, y) {
    mouse.x = x;
    mouse.y = y;
  }

  function registerClick(x, y) {
    pendingClick = { x, y };
  }

  function isLeft()      { return keys.left  || touch.leftPointer;  }
  function isRight()     { return keys.right || touch.rightPointer; }
  function isFireHeld()  { return keys.fire  || touch.firePointer;  }

  function consumeFirePress() {
    if (!pressed.fire) return false;
    pressed.fire = false;
    return true;
  }

  function consumeUp() {
    if (!pressed.up) return false;
    pressed.up = false;
    return true;
  }

  function consumeDown() {
    if (!pressed.down) return false;
    pressed.down = false;
    return true;
  }

  function consumeConfirm() {
    if (!pressed.confirm) return false;
    pressed.confirm = false;
    return true;
  }

  function consumeBack() {
    if (!pressed.back) return false;
    pressed.back = false;
    return true;
  }

  function consumeClick() {
    const c = pendingClick;
    pendingClick = null;
    return c;
  }

  function getMousePos() {
    return mouse;
  }

  // Drain all pending presses — call when entering a menu state so stale
  // in-game inputs can't accidentally trigger button selections.
  function clearMenuPresses() {
    pressed.fire    = false;
    pressed.up      = false;
    pressed.down    = false;
    pressed.confirm = false;
    pressed.back    = false;
    pendingClick    = null;
  }

  return {
    keys,
    touch,
    bind,
    setMousePos,
    registerClick,
    isLeft,
    isRight,
    isFireHeld,
    consumeFirePress,
    consumeUp,
    consumeDown,
    consumeConfirm,
    consumeBack,
    consumeClick,
    getMousePos,
    clearMenuPresses
  };
}
